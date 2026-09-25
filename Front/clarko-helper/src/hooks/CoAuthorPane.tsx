import { DiffText } from '../components/DiffText'
import clarkoHead from '../assets/clarko-head.png'
import type { CoAuthorStatus, Suggestion } from '../hooks/useCoAuthor'

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
  onAccept: () => void
  onReject: () => void
}

const STATUS_TEXT: Record<CoAuthorStatus, (block: number | null) => string> = {
  idle: () => 'Pause while writing and I’ll look at your paragraph',
  reading: (block) => `Reading paragraph ${(block ?? 0) + 1}…`,
  suggesting: () => 'I have a suggestion. Tab to accept, Esc to reject',
  reviewed: () => 'That paragraph reads well',
  error: () => 'Couldn’t reach the model. Keep typing to try again',
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
  onAccept,
  onReject,
}: CoAuthorPaneProps) {
  return (
    <section className="pane pane--coauthor" aria-label="Clarko">
      <header className="pane__header">
        <span className="presence presence--ai" aria-hidden="true" />
        <img className="pane__avatar" src={clarkoHead} alt="" aria-hidden="true" />
        <span className="pane__name">Clarko</span>
        <span className={`pane__status pane__status--${status}`} aria-live="polite">
          {STATUS_TEXT[status](activeBlock)}
        </span>
      </header>

      <div className="pane__body mirror">
        {blocks.map((block, index) => {
          const hasSuggestion = suggestion?.blockIndex === index
          return (
            <div key={index} className={blockClassName(block, activeBlock === index)}>
              {hasSuggestion ? <DiffText original={suggestion.original} revised={suggestion.revised} /> : block.text || '\u00a0'}

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
