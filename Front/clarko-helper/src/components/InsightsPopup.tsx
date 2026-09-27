import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { InsightsService } from '../services/insightsService'
import { useInsightsChat } from '../hooks/useInsightsChat'

const MAX_QUESTION_LENGTH = 300

interface InsightsPopupProps {
  service: InsightsService
  paragraph: string
  /** Earlier text in the document, for tone and topic. */
  context: string
  onClose: () => void
  /** Leaves insights for the selection popup's actions on the same paragraph. */
  onGoToActions: () => void
}

/** Clarko's streamed thoughts about one paragraph, with a small chat to talk them through. */
export function InsightsPopup({ service, paragraph, context, onClose, onGoToActions }: InsightsPopupProps) {
  const chat = useInsightsChat(service, paragraph, context)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Follow the conversation as it streams in.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [chat.messages])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (chat.streaming || !draft.trim()) return
    chat.send(draft)
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Keys stay in the popup: Esc must not reach the editor or the paragraph behind it.
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const waitingForFirstWord = chat.messages.at(-1)?.streaming && !chat.messages.at(-1)?.content

  return (
    <div
      className="insights"
      role="dialog"
      aria-label="Clarko Insights"
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="insights__header">
        <span className="insights__title">
          <span aria-hidden="true">✨</span> Clarko Insights
        </span>
        <button type="button" className="insights__close" aria-label="Close insights" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="insights__messages" ref={listRef} aria-live="polite" aria-busy={chat.streaming}>
        {chat.messages.map((message) =>
          message.role === 'author' ? (
            <p key={message.id} className="insights__message insights__message--author">
              {message.content}
            </p>
          ) : message.content ? (
            <p key={message.id} className="insights__message insights__message--clarko">
              {message.content}
              {message.streaming && <span className="insights__cursor" aria-hidden="true" />}
            </p>
          ) : null,
        )}

        {waitingForFirstWord && (
          <p className="insights__typing" aria-label="Clarko is thinking">
            <span />
            <span />
            <span />
          </p>
        )}

        {chat.failed && (
          <p className="insights__error">
            Clarko lost its train of thought.{' '}
            <button type="button" className="insights__link" onClick={chat.retry}>
              Try again
            </button>
          </p>
        )}
      </div>

      <form className="insights__ask" onSubmit={submit}>
        <input
          className="insights__input"
          value={draft}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="Ask Clarko about this…"
          aria-label="Ask Clarko about its thoughts"
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="button" disabled={chat.streaming || !draft.trim()}>
          Send
        </button>
      </form>

      <footer className="insights__footer">
        <button type="button" className="button insights__go" onClick={onGoToActions}>
          Go to Actions <span aria-hidden="true">→</span>
        </button>
      </footer>
    </div>
  )
}
