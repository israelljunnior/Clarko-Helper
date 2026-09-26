import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { DiffText } from './DiffText'
import { getEditableSelection, useSelectionEdit, type SelectionSession } from '../hooks/useSelectionEdit'
import type { SuggestionService } from '../services/suggestionService'
import clarkoHead from '../assets/clarko-head.png'

interface QuickAction {
  label: string
  instruction: string
}

/** Longest label for a command the author adds; it also has to fit on a button. */
const MAX_COMMAND_LENGTH = 15

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Fix grammar',
    instruction: 'Fix only grammar, spelling and punctuation. Keep the wording otherwise.',
  },
  { label: 'Improve', instruction: 'Improve clarity and flow' },
  { label: 'Shorter', instruction: 'Make it shorter' },
  { label: 'More formal', instruction: 'Make it more formal' },
  { label: 'More casual', instruction: 'Make it more casual' },
]

/** A paragraph picked in Clarko's pane: the popup opens there instead of under the author's text. */
export interface ClarkoAnchor {
  /** Clarko's scrolling pane, which also bounds the popup. */
  container: HTMLElement
  blockIndex: number
}

interface SelectionPopupProps {
  editor: Editor
  service: SuggestionService
  /** The scrolling pane the editor lives in, so the popup follows the text. */
  scrollTarget: HTMLElement | null
  anchor: ClarkoAnchor | null
}

export function SelectionPopup({ editor, service, scrollTarget, anchor }: SelectionPopupProps) {
  const edit = useSelectionEdit(editor, service)
  const [draft, setDraft] = useState('')
  /** Commands the author added with [+]; they last until the page is reloaded. */
  const [customActions, setCustomActions] = useState<QuickAction[]>([])
  const actions = [...QUICK_ACTIONS, ...customActions]

  const addCommand = (label: string) => {
    // The label doubles as the instruction, e.g. "Add emojis" or "Use bullet points".
    setCustomActions((current) => [...current, { label, instruction: label }])
    editor.commands.focus() // back to the selection, so the new command can be used right away
  }

  const sessionOpen = useRef(false)
  useEffect(() => {
    sessionOpen.current = edit.session !== null
  }, [edit.session])

  // Focus inside the popup counts as focus too: typing in one of its fields (the instruction, a new
  // command) must not close it when the menu re-checks shortly after the editor loses focus.
  const popupRef = useRef<HTMLDivElement>(null)
  const shouldShow = useCallback(
    ({ state, view }: { state: EditorState; view: EditorView }) => {
      if (sessionOpen.current) return true
      const focused = view.hasFocus() || !!popupRef.current?.contains(document.activeElement)
      return focused && getEditableSelection(state) !== null
    },
    [],
  )

  // Looked up when the popup is positioned, so it always finds the paragraph's current element.
  const anchorRef = useRef(anchor)
  useEffect(() => {
    anchorRef.current = anchor
  }, [anchor])

  const getReferencedVirtualElement = useCallback(() => {
    const current = anchorRef.current
    const element = current?.container.querySelector(`[data-block-index="${current.blockIndex}"]`)
    if (!element) return null // falls back to the selection in the author's pane
    return {
      getBoundingClientRect: () => element.getBoundingClientRect(),
      getClientRects: () => [element.getBoundingClientRect()],
    }
  }, [])

  // Keep the popup inside the pane it opens in: without a boundary it is placed against the whole
  // window and can spill over the other pane when the paragraph is near the edge.
  const boundaryElement = anchor?.container ?? scrollTarget
  const options = useMemo(() => {
    const boundary = boundaryElement ?? undefined
    return {
      strategy: 'fixed' as const,
      placement: 'bottom-start' as const,
      offset: 8,
      flip: { boundary, padding: 8 },
      shift: { boundary, padding: 12 },
      scrollTarget: boundary,
    }
  }, [boundaryElement])

  // The popup never gets wider than the pane it lives in.
  const [paneWidth, setPaneWidth] = useState<number | null>(null)
  useEffect(() => {
    if (!boundaryElement) return
    const observer = new ResizeObserver(([entry]) => setPaneWidth(entry.contentRect.width))
    observer.observe(boundaryElement)
    return () => observer.disconnect()
  }, [boundaryElement])
  const popupStyle = paneWidth ? { width: `min(440px, ${Math.max(paneWidth - 24, 240)}px)` } : undefined

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
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShow}
      options={options}
      getReferencedVirtualElement={getReferencedVirtualElement}
      appendTo={document.body}
      className="selection-popup-layer"
    >
      <div
        ref={popupRef}
        className="selection-popup"
        style={popupStyle}
        onKeyDown={onKeyDown}
        onMouseDown={keepEditorFocus}
      >
        {edit.session ? (
          <>
            <ClarkoIdentity />
            <SessionView session={edit.session} onAccept={edit.accept} onReject={edit.reject} onRetry={edit.retry} />
          </>
        ) : (
          <>
            <ClarkoIdentity />
            <div className="selection-popup__actions">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="button button--quiet"
                  onClick={() => edit.start(action.instruction)}
                >
                  {action.label}
                </button>
              ))}
              <AddCommand
                taken={actions.map((action) => action.label)}
                onAdd={addCommand}
                onCancel={() => editor.commands.focus()}
              />
            </div>
          </>
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

interface AddCommandProps {
  /** Labels already in use, so the same command isn't added twice. */
  taken: string[]
  onAdd: (label: string) => void
  onCancel: () => void
}

/** The [+] button: opens a small field to name a new command. Enter saves it, Esc cancels. */
function AddCommand({ taken, onAdd, onCancel }: AddCommandProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')

  const trimmed = label.trim()
  const duplicate = taken.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())
  const canSave = trimmed !== '' && !duplicate

  const close = () => {
    setOpen(false)
    setLabel('')
  }

  const save = () => {
    if (!canSave) return
    onAdd(trimmed)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      // Esc here only closes the field; it must not reach the popup, which would drop the selection.
      event.preventDefault()
      event.stopPropagation()
      close()
      onCancel()
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="button button--quiet selection-popup__add"
        title="Add a command"
        aria-label="Add a command"
        onClick={() => setOpen(true)}
      >
        +
      </button>
    )
  }

  return (
    <span className="selection-popup__new">
      <input
        className="selection-popup__input selection-popup__new-input"
        value={label}
        maxLength={MAX_COMMAND_LENGTH}
        placeholder="New command"
        aria-label={`New command, up to ${MAX_COMMAND_LENGTH} characters`}
        aria-invalid={duplicate}
        title={duplicate ? 'That command already exists' : undefined}
        autoFocus
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => !trimmed && close()}
      />
      <span className="selection-popup__count" aria-hidden="true">
        {label.length}/{MAX_COMMAND_LENGTH}
      </span>
      <button type="button" className="button" disabled={!canSave} onClick={save}>
        Add
      </button>
    </span>
  )
}

/** Clarko's presence dot and head, marking the popup as the co-author's. */
function ClarkoIdentity() {
  return (
    <span className="selection-popup__identity" aria-hidden="true">
      <span className="presence presence--ai" />
      <img className="pane__avatar" src={clarkoHead} alt="" />
      <span >How can I Help you ? :)</span>

    </span>
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
          <span className="selection-popup__note selection-popup__note--error">
            {session.error ?? 'Something went wrong. Try again.'}
          </span>
          <button type="button" className="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
