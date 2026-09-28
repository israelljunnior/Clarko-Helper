import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from 'react'
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
/** Matches the API's limit for an instruction. */
const MAX_INSTRUCTION_LENGTH = 300
const INSTRUCTION_HELP = 'What Clarko should do with the selected text, like "Add a few friendly emojis".'

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

/** Lets the editor window close the popup, e.g. when the author opens Clarko's insights instead. */
export interface SelectionPopupHandle {
  close: () => void
}

interface SelectionPopupProps {
  editor: Editor
  service: SuggestionService
  /** The scrolling pane the editor lives in, so the popup follows the text. */
  scrollTarget: HTMLElement | null
  anchor: ClarkoAnchor | null
  /** Called whenever the popup appears, so other popups (insights) can make way. */
  onShow?: () => void
  ref?: Ref<SelectionPopupHandle>
}

export function SelectionPopup({ editor, service, scrollTarget, anchor, onShow, ref }: SelectionPopupProps) {
  const edit = useSelectionEdit(editor, service)
  const [draft, setDraft] = useState('')
  /** Commands the author added with [+]; they last until the page is reloaded. */
  const [customActions, setCustomActions] = useState<QuickAction[]>([])
  const actions = [...QUICK_ACTIONS, ...customActions]

  /** Whether the "new command" section under the buttons is open. */
  const [adding, setAdding] = useState(false)
  // Every time the popup closes, the "new command" section closes with it, so it opens with just the buttons.
  const onHide = useCallback(() => setAdding(false), [])

  const addCommand = (label: string, instruction: string) => {
    setCustomActions((current) => [...current, { label, instruction }])
    setAdding(false)
    editor.commands.focus() // back to the selection, so the new command can be used right away
  }

  const cancelAdding = () => {
    setAdding(false)
    editor.commands.focus()
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
      onShow,
      onHide,
    }
  }, [boundaryElement, onShow, onHide])

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

  /**
   * Closes the popup entirely: drops any suggestion and clears the selection that keeps it open.
   * `focusEditor` puts the caret back in the document (the × button); from outside the popup, focus
   * is left where the author is going.
   */
  const close = ({ focusEditor = true } = {}) => {
    if (!edit.session && editor.state.selection.empty) return // nothing open
    if (edit.session) {
      if (focusEditor) edit.reject()
      else edit.dismiss() // leave focus to whatever is taking over, e.g. the insights chat box
    }
    sessionOpen.current = false // hide on this transaction, not after the next render
    const chain = focusEditor ? editor.chain().focus() : editor.chain()
    chain.setTextSelection(editor.state.selection.to).run()
  }

  useImperativeHandle(ref, () => ({ close: () => close({ focusEditor: false }) }))

  const header = (
    <div className="selection-popup__header">
      <ClarkoIdentity />
      <button type="button" className="selection-popup__close" aria-label="Close" title="Close" onClick={() => close()}>
        ×
      </button>
    </div>
  )

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
            {header}
            <SessionView session={edit.session} onAccept={edit.accept} onReject={edit.reject} onRetry={edit.retry} />
          </>
        ) : (
          <>
            {header}
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
              <button
                type="button"
                className={adding ? 'button button--quiet selection-popup__add is-active' : 'button button--quiet selection-popup__add'}
                title="Add a command"
                aria-label="Add a command"
                aria-expanded={adding}
                onClick={() => setAdding((open) => !open)}
              >
                +
              </button>
            </div>
            {adding && (
              <NewCommandForm taken={actions.map((action) => action.label)} onAdd={addCommand} onCancel={cancelAdding} />
            )}
          </>
        )}

        {edit.session?.phase !== 'loading' && (
          <div className="selection-popup__ask">
            <input
              className="selection-popup__input"
              value={draft}
              maxLength={MAX_INSTRUCTION_LENGTH}
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

/** A small yellow "i" that explains a field on hover or keyboard focus. */
function InfoTip({ text }: { text: string }) {
  const id = useId()
  return (
    <span className="info-tip" tabIndex={0} role="button" aria-label="More information" aria-describedby={id}>
      i
      <span id={id} role="tooltip" className="info-tip__bubble">
        {text}
      </span>
    </span>
  )
}

interface NewCommandFormProps {
  /** Labels already in use, so the same command isn't added twice. */
  taken: string[]
  onAdd: (label: string, instruction: string) => void
  onCancel: () => void
}

/**
 * The section under the command buttons for adding a command: a short label for its button and the
 * instruction Clarko follows when it's clicked. Enter adds it, Esc cancels.
 */
function NewCommandForm({ taken, onAdd, onCancel }: NewCommandFormProps) {
  const [label, setLabel] = useState('')
  const [instruction, setInstruction] = useState('')
  const labelId = useId()
  const instructionId = useId()

  const trimmedLabel = label.trim()
  const trimmedInstruction = instruction.trim()
  const duplicate = taken.some((existing) => existing.toLowerCase() === trimmedLabel.toLowerCase())
  const canSave = trimmedLabel !== '' && trimmedInstruction !== '' && !duplicate

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (canSave) onAdd(trimmedLabel, trimmedInstruction)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    // Esc here only closes this section; it must not reach the popup, which would drop the selection.
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return (
    <form className="new-command" onSubmit={save} onKeyDown={onKeyDown} aria-label="New command">
      <div className="new-command__field">
        <div className="new-command__label-row">
          <label htmlFor={labelId} className="new-command__label">
            Label
          </label>
          <span className="selection-popup__count" aria-hidden="true">
            {label.length}/{MAX_COMMAND_LENGTH}
          </span>
        </div>
        <input
          id={labelId}
          className="selection-popup__input"
          value={label}
          maxLength={MAX_COMMAND_LENGTH}
          placeholder="e.g. Add emojis"
          aria-invalid={duplicate}
          autoFocus
          onChange={(event) => setLabel(event.target.value)}
        />
        {duplicate && <span className="new-command__error">That command already exists.</span>}
      </div>

      <div className="new-command__field">
        <div className="new-command__label-row">
          <label htmlFor={instructionId} className="new-command__label">
            Instruction
          </label>
          <InfoTip text={INSTRUCTION_HELP} />
        </div>
        <input
          id={instructionId}
          className="selection-popup__input"
          value={instruction}
          maxLength={MAX_INSTRUCTION_LENGTH}
          placeholder="e.g. Add a few friendly emojis"
          onChange={(event) => setInstruction(event.target.value)}
        />
      </div>

      <div className="new-command__buttons">
        <button type="button" className="button button--quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button new-command__save" disabled={!canSave}>
          Add command
        </button>
      </div>
    </form>
  )
}

/** Clarko's presence dot and head, marking the popup as the co-author's. */
function ClarkoIdentity() {
  return (
    <span className="selection-popup__identity" aria-hidden="true">
      <span className="presence presence--ai" />
      <img className="pane__avatar" src={clarkoHead} alt="" />
      <span >How can I Help you ?</span>
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
