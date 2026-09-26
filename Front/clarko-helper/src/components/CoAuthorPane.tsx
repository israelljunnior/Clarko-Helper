import type { CSSProperties } from 'react'
import { DiffText } from './DiffText'
import clarkoHead from '../assets/clarko-head.png'
import type { CoAuthorStatus, ReviewedBlock, Suggestion } from '../hooks/useCoAuthor'
import type { Completion } from '../hooks/useAutocomplete'

/** A run of text with the same font, so Clarko's view matches the author's formatting. */
export interface MirrorSegment {
  text: string
  fontFamily: string | null
  fontSize: string | null
}

export interface MirrorBlock {
  type: string
  level: number | null
  text: string
  segments: MirrorSegment[]
}

function fontStyle({ fontFamily, fontSize }: MirrorSegment): CSSProperties | undefined {
  if (!fontFamily && !fontSize) return undefined
  return { fontFamily: fontFamily ?? undefined, fontSize: fontSize ?? undefined }
}

/** The block's text with each run in its own font. */
function StyledText({ block }: { block: MirrorBlock }) {
  if (!block.text) return '\u00a0'
  return block.segments.map((segment, i) => (
    <span key={i} style={fontStyle(segment)}>
      {segment.text}
    </span>
  ))
}

/** Suggested next words are inserted at the end of the line, so they take the font found there. */
function endFontStyle(block: MirrorBlock): CSSProperties | undefined {
  const last = block.segments.at(-1)
  return last ? fontStyle(last) : undefined
}

/**
 * A suggestion diff is plain text, so it can only keep a font the whole paragraph shares.
 * Mixed fonts fall back to the default while the diff is showing.
 */
function sharedFontStyle(block: MirrorBlock): CSSProperties | undefined {
  const [first, ...rest] = block.segments
  if (!first) return undefined
  const uniform = rest.every((s) => s.fontFamily === first.fontFamily && s.fontSize === first.fontSize)
  return uniform ? fontStyle(first) : undefined
}

interface CoAuthorPaneProps {
  blocks: MirrorBlock[]
  status: CoAuthorStatus
  activeBlock: number | null
  suggestion: Suggestion | null
  completion: Completion | null
  reviewed: ReviewedBlock | null
  onAccept: () => void
  onReject: () => void
  onAcceptCompletion: (option: string) => void
  onReviewAgain: () => void
}

const STATUS_TEXT: Record<CoAuthorStatus, (block: number | null) => string> = {
  idle: () => 'Pause while writing and I’ll look at your paragraph',
  reading: (block) => `Reading paragraph ${(block ?? 0) + 1}…`,
  suggesting: () => 'I have a suggestion. Tab to accept, Esc to reject',
  reviewed: () => 'That paragraph reads well',
  error: () => 'Couldn’t reach the model. Keep typing to try again',
}

/**
 * Clarko's cursor with its name tag, like a collaborator's caret. Inline it marks where suggested words
 * start; as `span` it runs down the whole paragraph Clarko has selected.
 */
function ClarkoCaret({ span = false }: { span?: boolean }) {
  return (
    <span className={span ? 'caret caret--span' : 'caret'} aria-hidden="true">
      <span className="caret__label">Clarko</span>
    </span>
  )
}

function blockClassName(block: MirrorBlock, isActive: boolean) {
  const classes = ['mirror__block', `mirror__block--${block.type}`]
  if (block.level) classes.push(`mirror__block--h${block.level}`)
  if (isActive) classes.push('is-reading')
  return classes.join(' ')
}

export function CoAuthorPane({
  blocks,
  status,
  activeBlock,
  suggestion,
  completion,
  reviewed,
  onAccept,
  onReject,
  onAcceptCompletion,
  onReviewAgain,
}: CoAuthorPaneProps) {
  // Autocomplete only speaks up while Clarko has nothing more important to say.
  const showCompletionStatus = completion && (status === 'idle' || status === 'reviewed')

  return (
    <section className="pane pane--coauthor" aria-label="Clarko">
      <header className="pane__header">
        <span className="presence presence--ai" aria-hidden="true" />
        <img className="pane__avatar" src={clarkoHead} alt="" aria-hidden="true" />
        <span className="pane__name">Clarko</span>
        <span className={`pane__status pane__status--${status}`} aria-live="polite">
          {showCompletionStatus ? 'Tab to add the next words, Esc to dismiss' : STATUS_TEXT[status](activeBlock)}
        </span>
      </header>

      <div className="pane__body mirror">
        {blocks.map((block, index) => {
          const hasSuggestion = suggestion?.blockIndex === index
          const hasCompletion = !hasSuggestion && completion?.blockIndex === index
          const isActive = activeBlock === index
          const skippedCount = reviewed?.blockIndex === index ? reviewed.skipped.length : 0
          // Clarko "selects" the paragraph it is reading or has a suggestion for.
          const isSelected = isActive || hasSuggestion
          const content = hasSuggestion ? (
            <span style={sharedFontStyle(block)}>
              <DiffText original={suggestion.original} revised={suggestion.revised} />
            </span>
          ) : (
            <StyledText block={block} />
          )
          return (
            <div key={index} className={blockClassName(block, isActive)}>
              {isSelected ? (
                <div className="mirror__selected">
                  <ClarkoCaret span />
                  <span className="mirror__selection">{content}</span>
                  {hasCompletion && <span className="mirror__ghost" style={endFontStyle(block)}>{completion.options[0]}</span>}
                </div>
              ) : (
                <>
                  {content}
                  {hasCompletion && (
                    <>
                      <ClarkoCaret />
                      <span className="mirror__ghost" style={endFontStyle(block)}>{completion.options[0]}</span>
                    </>
                  )}
                </>
              )}

              {skippedCount > 0 && (
                <div className="skipped">
                  <span>
                    Skipping {skippedCount} {skippedCount === 1 ? 'change' : 'changes'} you rejected
                  </span>
                  <button
                    type="button"
                    className="skipped__review"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onReviewAgain}
                  >
                    Review again
                  </button>
                </div>
              )}

              {hasCompletion && (
                <div className="completion" aria-live="polite">
                  {completion.options.map((option, optionIndex) => (
                    <button
                      key={option}
                      type="button"
                      className={optionIndex === 0 ? 'completion__option is-primary' : 'completion__option'}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onAcceptCompletion(option)}
                    >
                      {option.trim()}
                      {optionIndex === 0 && <kbd>Tab</kbd>}
                    </button>
                  ))}
                </div>
              )}

              {hasSuggestion && (
                <div className="suggestion">
                  <span className="suggestion__reason">{suggestion.reason}</span>
                  <button type="button" className="button button--accept" onClick={onAccept}>
                    Accept <kbd>Tab</kbd>
                  </button>
                  <button type="button" className="button" onClick={onReject}>
                    Reject <kbd>Esc</kbd>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
