import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react'
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

/** Space kept between the options menu and the edge of Clarko's pane. */
const MENU_EDGE_GAP = 12

interface CompletionMenuProps {
  completion: Completion
  onAccept: (option: string) => void
}

/**
 * The options under the suggested words. It opens below them, starting at the words, and slides left
 * when that would run past the right edge of Clarko's pane, so it is never cut off.
 */
function CompletionMenu({ completion, onAccept }: CompletionMenuProps) {
  const menuRef = useRef<HTMLSpanElement>(null)
  const optionsKey = completion.options.join('\u0000')

  // Measured before paint, so the menu never flashes in the clipped position.
  useLayoutEffect(() => {
    const menu = menuRef.current
    const pane = menu?.closest('.pane__body')
    if (!menu || !pane) return
    menu.style.left = '0px'
    const paneBox = pane.getBoundingClientRect()
    const box = menu.getBoundingClientRect()
    const overflow = box.right - (paneBox.right - MENU_EDGE_GAP)
    const room = box.left - (paneBox.left + MENU_EDGE_GAP)
    if (overflow > 0) menu.style.left = `${-Math.min(overflow, Math.max(room, 0))}px`
  }, [optionsKey, completion.selected])

  const several = completion.options.length > 1
  return (
    <span
      ref={menuRef}
      className="completion"
      aria-live="polite"
      // Keep clicks and keys here from reaching the paragraph, which would select it for review.
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {completion.options.map((option, optionIndex) => {
        const chosen = optionIndex === completion.selected
        return (
          <button
            key={option}
            type="button"
            className={chosen ? 'completion__option is-primary' : 'completion__option'}
            aria-current={chosen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onAccept(option)}
          >
            {option.trim()}
            {chosen && <kbd>Tab</kbd>}
          </button>
        )
      })}
      <span className="completion__hint">{several ? 'Ctrl+↑↓ to choose · Tab to insert' : 'Tab to insert · Esc to dismiss'}</span>
    </span>
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
      : 'Ctrl+Space for next words suggestions · click a paragraph to review it'

  return (
    <section className="pane pane--coauthor" aria-label="Clarko">
      <header className="pane__header">
        <span className="presence presence--ai" aria-hidden="true" />
        <img className="pane__avatar" src={clarkoHead} alt="" aria-hidden="true" />
        <span className="pane__name">Clarko</span>
        <button
          type="button"
          className="pane__search"
          title="Search the document (Ctrl+F)"
          aria-label="Search the document"
          aria-keyshortcuts="Control+F"
          onClick={onOpenSearch}
        >
          <SearchIcon />
        </button>
        <span className="pane__status" aria-live="polite">
          {status}
        </span>
      </header>

      {/* Same structure as the author's pane: a scrolling body with the text column inside it, so short
          text starts at the same place on both sides and lines wrap at the same width. */}
      <div className="pane__body" ref={bodyRef}>
        <div className="mirror">
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
                            {completion.options[completion.selected]}
                          </span>
                          <CompletionMenu completion={completion} onAccept={onAcceptCompletion} />
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
      </div>
    </section>
  )
}
