import { useState, type FormEvent, type KeyboardEvent } from 'react'
import clarkoHead from '../assets/clarko-head.png'
import type { SearchResponse } from '../services/api'
import type { SearchStatus } from '../hooks/useDocumentSearch'

/** Matches the API's limit for a search. */
const MAX_QUERY_LENGTH = 300
/** Characters of the paragraph shown on each side of a match in the results list. */
const SNIPPET_CONTEXT = 32

interface SearchPopupProps {
  status: SearchStatus
  result: SearchResponse | null
  current: number
  /** The document's paragraphs, to show each match in context. */
  paragraphs: string[]
  onSearch: (query: string) => void
  onSelect: (index: number) => void
  onClose: () => void
}

function summary(status: SearchStatus, result: SearchResponse | null): string {
  if (status === 'searching') return 'Clarko is looking through your document…'
  if (status === 'error') return "The search didn't go through. Try again."
  if (!result) return 'Find exact text, or related ideas when there is no exact match.'
  const count = result.matches.length
  if (result.kind === 'exact') return `${count} exact ${count === 1 ? 'match' : 'matches'}`
  if (result.kind === 'related') return `No exact match. ${count} related ${count === 1 ? 'passage' : 'passages'}:`
  return 'Nothing in the document matches or relates to that.'
}

/** Clarko Searching: a popup in the middle of the page to find text or related content in the document. */
export function SearchPopup({ status, result, current, paragraphs, onSearch, onSelect, onClose }: SearchPopupProps) {
  const [query, setQuery] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (query.trim() && status !== 'searching') onSearch(query)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation() // keys stay in the popup, away from the editor's shortcuts
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="search-dialog" role="dialog" aria-label="Clarko Searching" onKeyDown={onKeyDown}>
      <header className="search-dialog__header">
        <span className="search-dialog__title">
          <img className="pane__avatar" src={clarkoHead} alt="" aria-hidden="true" />
          Clarko Searching
        </span>
        <button type="button" className="search-dialog__close" aria-label="Close search" onClick={onClose}>
          ×
        </button>
      </header>

      <form className="search-dialog__form" onSubmit={submit}>
        <input
          className="search-dialog__input"
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Text or idea to find in your document…"
          aria-label="What to search for"
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="button search-dialog__find" disabled={!query.trim() || status === 'searching'}>
          Find
        </button>
      </form>
      <div className="search-dialog__meta">
        <span aria-live="polite">{summary(status, result)}</span>
        <span className="selection-popup__count">
          {query.length}/{MAX_QUERY_LENGTH}
        </span>
      </div>

      {!!result?.matches.length && (
        <ol className="search-dialog__results">
          {result.matches.map((match, index) => {
            const paragraph = paragraphs[match.paragraph] ?? ''
            const before = paragraph.slice(Math.max(0, match.start - SNIPPET_CONTEXT), match.start)
            const after = paragraph.slice(match.start + match.length, match.start + match.length + SNIPPET_CONTEXT)
            return (
              <li key={`${match.paragraph}:${match.start}`}>
                <button
                  type="button"
                  className={index === current ? 'search-result is-current' : 'search-result'}
                  aria-current={index === current}
                  onClick={() => onSelect(index)}
                >
                  <span className="search-result__where">¶ {match.paragraph + 1}</span>
                  <span className="search-result__text">
                    {match.start > SNIPPET_CONTEXT && '…'}
                    {before}
                    <mark>{match.text}</mark>
                    {after}
                    {match.start + match.length + SNIPPET_CONTEXT < paragraph.length && '…'}
                  </span>
                  {match.reason && <span className="search-result__reason">{match.reason}</span>}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
