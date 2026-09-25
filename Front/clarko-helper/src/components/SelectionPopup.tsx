import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { DiffText } from './DiffText'
import { getEditableSelection, useSelectionEdit, type SelectionSession } from '../hooks/useSelectionEdit'
import type { SuggestionService } from '../services/suggestionService'

const QUICK_ACTIONS = [
  { label: 'Improve', instruction: 'Improve clarity and flow' },
  { label: 'Shorter', instruction: 'Make it shorter' },
  { label: 'More formal', instruction: 'Make it more formal' },
  { label: 'More casual', instruction: 'Make it more casual' },
]

interface SelectionPopupProps {
  editor: Editor
  service: SuggestionService
  /** The scrolling pane the editor lives in, so the popup follows the text. */
  scrollTarget: HTMLElement | null
}

export function SelectionPopup({ editor, service, scrollTarget }: SelectionPopupProps) {
  const edit = useSelectionEdit(editor, service)
  const [draft, setDraft] = useState('')

  const sessionOpen = useRef(false)
  useEffect(() => {
    sessionOpen.current = edit.session !== null
  }, [edit.session])

  const shouldShow = useCallback(
    ({ state, view }: { state: EditorState; view: EditorView }) =>
      sessionOpen.current || (getEditableSelection(state) !== null && view.hasFocus()),
    [],
  )

  const options = useMemo(
    () => ({
      strategy: 'fixed' as const,
      placement: 'bottom-start' as const,
      offset: 8,
      flip: true,
      shift: { padding: 12 },
      scrollTarget: scrollTarget ?? undefined,
    }),
    [scrollTarget],
  )

  const submit = () => {
    const instruction = draft.trim()
    setDraft('')
    if (edit.session) edit.refine(instruction)
    else if (instruction) edit.start(instruction)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    if (edit.session) {
      edit.reject()
    } else {
      editor.chain().focus().setTextSelection(editor.state.selection.to).run()
    }
  }

  // Clicking buttons must not steal focus from the editor, or the popup would close.
  const keepEditorFocus = (event: MouseEvent) => {
    if (event.target instanceof HTMLElement && event.target.closest('button')) event.preventDefault()
  }

  return (
    <BubbleMenu editor={editor} shouldShow={shouldShow} options={options} appendTo={document.body} className="selection-popup-layer">
      <div className="selection-popup" onKeyDown={onKeyDown} onMouseDown={keepEditorFocus}>
        {edit.session ? (
          <SessionView session={edit.session} onAccept={edit.accept} onReject={edit.reject} onRetry={edit.retry} />
        ) : (
          <div className="selection-popup__actions">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="button button--quiet"
                onClick={() => edit.start(action.instruction)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {edit.session?.phase !== 'loading' && (
          <div className="selection-popup__ask">
            <input
              className="selection-popup__input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              placeholder={edit.session ? 'Refine it: shorter, add an example…' : 'Or tell Clarko what to change…'}
              aria-label={edit.session ? 'Refine the suggestion' : 'Instruction for Clarko'}
            />
            {edit.session && (
              <button type="button" className="button" onClick={submit}>
                {draft.trim() ? 'Refine' : 'Try another'}
              </button>
            )}
          </div>
        )}
      </div>
    </BubbleMenu>
  )
}

interface SessionViewProps {
  session: SelectionSession
  onAccept: () => void
  onReject: () => void
  onRetry: () => void
}

function SessionView({ session, onAccept, onReject, onRetry }: SessionViewProps) {
  const version = session.steps.length
  const instruction = session.steps.at(-1)

  return (
    <div className="selection-popup__session" aria-live="polite">
      <div className="selection-popup__meta">
        {version > 1 ? `Version ${version}: ` : ''}
        {instruction}
      </div>

      {session.phase === 'loading' && (
        <div className="selection-popup__row">
          <span className="selection-popup__note">Rewriting…</span>
          <button type="button" className="button" onClick={onReject}>
            Cancel <kbd>Esc</kbd>
          </button>
        </div>
      )}

      {session.phase === 'ready' && session.suggestion && (
        <>
          <div className="selection-popup__diff">
            <DiffText original={session.original} revised={session.suggestion.revised} />
          </div>
          <div className="selection-popup__row">
            <span className="suggestion__reason">{session.suggestion.reason}</span>
            <button type="button" className="button button--accept" onClick={onAccept} autoFocus>
              Accept <kbd>Enter</kbd>
            </button>
            <button type="button" className="button" onClick={onReject}>
              Reject <kbd>Esc</kbd>
            </button>
          </div>
        </>
      )}

      {session.phase === 'unchanged' && (
        <div className="selection-popup__row">
          <span className="selection-popup__note">No change needed for that. Try a different instruction.</span>
          <button type="button" className="button" onClick={onReject}>
            Close <kbd>Esc</kbd>
          </button>
        </div>
      )}

      {session.phase === 'error' && (
        <div className="selection-popup__row">
          <span className="selection-popup__note selection-popup__note--error">Couldn’t reach the model.</span>
          <button type="button" className="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
