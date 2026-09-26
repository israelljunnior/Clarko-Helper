import { DiffText } from './DiffText'
import clarkoHead from '../assets/clarko-head.png'
import type { CoAuthorStatus, Suggestion } from '../hooks/useCoAuthor'
import type { Completion } from '../hooks/useAutocomplete'

export interface MirrorBlock {
  type: string
  level: number | null
  text: string
}

interface CoAuthorPaneProps {
  blocks: MirrorBlock[]
  status: CoAuthorStatus
  activeBlock: number | null
  suggestion: Suggestion | null
  completion: Completion | null
  onAccept: () => void
  onReject: () => void
  onAcceptCompletion: (option: string) => void
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
  onAccept,
  onReject,
  onAcceptCompletion,
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
          // Clarko "selects" the paragraph it is reading or has a suggestion for.
          const isSelected = isActive || hasSuggestion
          const content = hasSuggestion ? (
            <DiffText original={suggestion.original} revised={suggestion.revised} />
          ) : (
            block.text || '\u00a0'
          )
          return (
            <div key={index} className={blockClassName(block, isActive)}>
              {isSelected ? (
                <div className="mirror__selected">
                  <ClarkoCaret span />
                  <span className="mirror__selection">{content}</span>
                  {hasCompletion && <span className="mirror__ghost">{completion.options[0]}</span>}
                </div>
              ) : (
                <>
                  {content}
                  {hasCompletion && (
                    <>
                      <ClarkoCaret />
                      <span className="mirror__ghost">{completion.options[0]}</span>
                    </>
                  )}
                </>
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
