import type { CSSProperties, KeyboardEvent } from 'react'
import clarkoHead from '../assets/clarko-head.png'
import type { Completion } from '../hooks/useAutocomplete'
import type { SearchHit } from '../hooks/useDocumentSearch'
import type { InsightsService } from '../services/insightsService'
import { InsightsPopup } from './InsightsPopup'

/** How much earlier text Clarko gets as context for its insights. */
const INSIGHTS_CONTEXT_CHARS = 1000

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
  /** Paragraphs and headings can be reviewed; lists, quotes and code cannot yet. */
  reviewable: boolean
}

function fontStyle({ fontFamily, fontSize }: MirrorSegment): CSSProperties | undefined {
  if (!fontFamily && !fontSize) return undefined
  return { fontFamily: fontFamily ?? undefined, fontSize: fontSize ?? undefined }
}

/** Runs of text, each in its own font. */
function StyledText({ segments }: { segments: MirrorSegment[] }) {
  return segments.map((segment, i) => (
    <span key={i} style={fontStyle(segment)}>
      {segment.text}
    </span>
  ))
}

/** Splits the paragraph's runs at a character offset, so suggested words can be shown in between. */
function splitSegments(segments: MirrorSegment[], offset: number): [MirrorSegment[], MirrorSegment[]] {
  const before: MirrorSegment[] = []
  const after: MirrorSegment[] = []
  let seen = 0
  for (const segment of segments) {
    const cut = Math.min(Math.max(offset - seen, 0), segment.text.length)
    if (cut > 0) before.push({ ...segment, text: segment.text.slice(0, cut) })
    if (cut < segment.text.length) after.push({ ...segment, text: segment.text.slice(cut) })
    seen += segment.text.length
  }
  return [before, after]
}

/** Suggested words take the font of the text just before them, like typed text would. */
function fontBefore(segments: MirrorSegment[]): CSSProperties | undefined {
  const last = segments.at(-1)
  return last ? fontStyle(last) : undefined
}

/** The block's text with search matches marked, keeping each run's font. */
function HighlightedText({ segments, hits }: { segments: MirrorSegment[]; hits: SearchHit[] }) {
  const sorted = [...hits].sort((a, b) => a.start - b.start)
  const pieces: { key: string; text: string; style?: CSSProperties; hit?: SearchHit }[] = []
  let offset = 0
  segments.forEach((segment, segmentIndex) => {
    const style = fontStyle(segment)
    let cursor = 0
    while (cursor < segment.text.length) {
      const position = offset + cursor
      const hit = sorted.find((h) => position >= h.start && position < h.start + h.length)
      const nextStart = sorted.find((h) => h.start > position)?.start ?? Infinity
      const end = hit
        ? Math.min(segment.text.length, hit.start + hit.length - offset)
        : Math.min(segment.text.length, nextStart - offset)
      pieces.push({ key: `${segmentIndex}:${cursor}`, text: segment.text.slice(cursor, end), style, hit })
      cursor = end
    }
    offset += segment.text.length
  })

  return pieces.map((piece) =>
    piece.hit ? (
      <mark key={piece.key} className={piece.hit.current ? 'search-hit is-current' : 'search-hit'} style={piece.style}>
        {piece.text}
      </mark>
    ) : (
      <span key={piece.key} style={piece.style}>
        {piece.text}
      </span>
    ),
  )
}

/** A magnifying glass, drawn in the current text color. */
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
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

function blockClassName(block: MirrorBlock) {
  const classes = ['mirror__block', `mirror__block--${block.type}`]
  if (block.level) classes.push(`mirror__block--h${block.level}`)
  return classes.join(' ')
}

interface CoAuthorPaneProps {
  blocks: MirrorBlock[]
  /** The paragraph fully selected in the document, which Clarko marks as its own selection. */
  selectedBlock: number | null
  completion: Completion | null
  onSelectBlock: (index: number) => void
  onAcceptCompletion: (option: string) => void
  /** Receives the scrolling body, so a review popup can open next to Clarko's copy of a paragraph. */
  bodyRef: (element: HTMLDivElement | null) => void
  insights: InsightsService
  /** The paragraph whose insights popup is open, if any. */
  insightsFor: number | null
  onOpenInsights: (index: number) => void
  onCloseInsights: () => void
  onOpenSearch: () => void
  /** Search matches to highlight in Clarko's copy of the document. */
  searchHits: SearchHit[]
}

export function CoAuthorPane({
  blocks,
  selectedBlock,
  completion,
  onSelectBlock,
  onAcceptCompletion,
  bodyRef,
  insights,
  insightsFor,
  onOpenInsights,
  onCloseInsights,
  onOpenSearch,
  searchHits,
}: CoAuthorPaneProps) {
  const status = completion
    ? 'Tab to add the next words, Esc to dismiss'
    : selectedBlock !== null
      ? 'Pick what to do in the popup'
      : 'Click a paragraph to review it'

  return (
    <section className="pane pane--coauthor" aria-label="Clarko">
      <header className="pane__header">
        <span className="presence presence--ai" aria-hidden="true" />
        <img className="pane__avatar" src={clarkoHead} alt="" aria-hidden="true" />
        <span className="pane__name">Clarko</span>
        <button type="button" className="pane__search" title="Search the document" aria-label="Search the document" onClick={onOpenSearch}>
          <SearchIcon />
        </button>
        <span className="pane__status" aria-live="polite">
          {status}
        </span>
      </header>

      <div className="pane__body mirror" ref={bodyRef}>
        {blocks.map((block, index) => {
          const hasCompletion = completion?.blockIndex === index
          const isSelected = selectedBlock === index
          const canReview = block.reviewable && block.text.trim() !== ''

          const select = () => canReview && onSelectBlock(index)
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            select()
          }

          const [before, after] = hasCompletion ? splitSegments(block.segments, completion.offset) : [block.segments, []]
          const insightsOpen = canReview && insightsFor === index

          return (
            <div key={index} className={insightsOpen ? `${blockClassName(block)} has-insights` : blockClassName(block)}>
              {canReview && (
                <button
                  type="button"
                  className={insightsOpen ? 'insights-button is-open' : 'insights-button'}
                  aria-haspopup="dialog"
                  aria-expanded={insightsOpen}
                  aria-label={`Clarko's insights on paragraph ${index + 1}`}
                  onClick={() => (insightsOpen ? onCloseInsights() : onOpenInsights(index))}
                >
                  <span aria-hidden="true">✨</span> Insights
                </button>
              )}
              {insightsOpen && (
                <InsightsPopup
                  // A fresh conversation for each paragraph.
                  key={index}
                  service={insights}
                  paragraph={block.text}
                  context={blocks
                    .slice(0, index)
                    .map((earlier) => earlier.text)
                    .join('\n')
                    .slice(-INSIGHTS_CONTEXT_CHARS)}
                  onClose={onCloseInsights}
                  onGoToActions={() => {
                    onCloseInsights()
                    onSelectBlock(index)
                  }}
                />
              )}
              <div
                className={canReview ? 'mirror__text is-reviewable' : 'mirror__text'}
                data-block-index={index}
                role={canReview ? 'button' : undefined}
                tabIndex={canReview ? 0 : undefined}
                aria-label={canReview ? `Review paragraph ${index + 1}` : undefined}
                aria-pressed={canReview ? isSelected : undefined}
                title={canReview ? 'Review this paragraph' : undefined}
                // Keep focus in the editor's flow: the click selects the paragraph there instead.
                onMouseDown={(event) => canReview && event.preventDefault()}
                onClick={select}
                onKeyDown={canReview ? onKeyDown : undefined}
              >
                {isSelected ? (
                  <div className="mirror__selected">
                    <ClarkoCaret span />
                    <span className="mirror__selection">
                      <StyledText segments={block.segments} />
                    </span>
                  </div>
                ) : searchHits.some((hit) => hit.paragraph === index) ? (
                  <HighlightedText segments={block.segments} hits={searchHits.filter((hit) => hit.paragraph === index)} />
                ) : !block.text ? (
                  ' '
                ) : (
                  <>
                    <StyledText segments={before} />
                    {hasCompletion && (
                      // The options hang right under the suggested words, over the text below them.
                      <span className="mirror__ghost-anchor">
                        <ClarkoCaret />
                        <span className="mirror__ghost" style={fontBefore(before)}>
                          {completion.options[0]}
                        </span>
                        <span
                          className="completion"
                          aria-live="polite"
                          // Keep clicks and keys here from reaching the paragraph, which would select it for review.
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
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
                        </span>
                      </span>
                    )}
                    <StyledText segments={after} />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
