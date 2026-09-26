import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import type { SuggestionService } from '../services/suggestionService'

const PAUSE_MS = 1500
const MIN_PARAGRAPH_CHARS = 20

export type CoAuthorStatus = 'idle' | 'reading' | 'suggesting' | 'reviewed' | 'error'

export interface Suggestion {
  blockIndex: number
  original: string
  revised: string
  reason: string
}

/** A paragraph Clarko found nothing to fix in, and the exact text it approved. */
export interface ReviewedBlock {
  blockIndex: number
  text: string
}

interface CoAuthorState {
  status: CoAuthorStatus
  activeBlock: number | null
  suggestion: Suggestion | null
  reviewed: ReviewedBlock | null
}

type CoAuthorAction =
  | { type: 'reading'; blockIndex: number }
  | { type: 'suggested'; suggestion: Suggestion }
  | { type: 'reviewed'; block: ReviewedBlock }
  | { type: 'failed' }
  | { type: 'cancelled' }
  | { type: 'cleared' }

const initialState: CoAuthorState = { status: 'idle', activeBlock: null, suggestion: null, reviewed: null }

function reducer(state: CoAuthorState, action: CoAuthorAction): CoAuthorState {
  switch (action.type) {
    case 'reading':
      return { ...state, status: 'reading', activeBlock: action.blockIndex, reviewed: null }
    case 'suggested':
      return {
        status: 'suggesting',
        activeBlock: action.suggestion.blockIndex,
        suggestion: action.suggestion,
        reviewed: null,
      }
    case 'reviewed':
      return { ...state, status: 'reviewed', activeBlock: null, reviewed: action.block }
    case 'failed':
      return { ...state, status: 'error', activeBlock: null, reviewed: null }
    case 'cancelled':
      return state.status === 'reading' ? { ...state, status: 'idle', activeBlock: null } : state
    case 'cleared':
      return initialState
  }
}

export interface BlockRange {
  index: number
  from: number
  to: number
  text: string
}

/** The top-level paragraph or heading the cursor is in. Lists, quotes and code are skipped for now. */
export function getCurrentBlock(editor: Editor): BlockRange | null {
  const { $from } = editor.state.selection
  if ($from.depth < 1) return null

  const node = $from.node(1)
  if (!node.isTextblock || node.type.name === 'codeBlock') return null

  return {
    index: $from.index(0),
    from: $from.start(1),
    to: $from.end(1),
    text: node.textContent,
  }
}

/** Finds a block again, but only if its text is still what the AI saw. */
function findUnchangedBlock(editor: Editor, index: number, expectedText: string): BlockRange | null {
  const { doc } = editor.state
  if (index >= doc.childCount) return null

  const node = doc.child(index)
  if (node.textContent !== expectedText) return null

  let offset = 0
  for (let i = 0; i < index; i++) offset += doc.child(i).nodeSize
  return { index, from: offset + 1, to: offset + node.nodeSize - 1, text: node.textContent }
}

/** Inputs outside the editor (title, popup prompt) keep Tab and Esc for themselves. */
export function isOtherTextField(target: EventTarget | null, editorDom: HTMLElement): boolean {
  if (!(target instanceof HTMLElement) || editorDom.contains(target)) return false
  return target.matches('input, textarea, select') || target.isContentEditable
}

export function useCoAuthor(editor: Editor | null, service: SuggestionService) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const suggestionRef = useRef<Suggestion | null>(null)
  const lastReviewedText = useRef('')

  useEffect(() => {
    suggestionRef.current = state.suggestion
  }, [state.suggestion])

  // Watch for pauses and ask for a suggestion on the current paragraph.
  useEffect(() => {
    if (!editor) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight: AbortController | null = null

    const requestSuggestion = async () => {
      if (!editor.state.selection.empty) return // selections belong to the popup flow

      const block = getCurrentBlock(editor)
      if (!block || block.text.trim().length < MIN_PARAGRAPH_CHARS) return
      if (block.text === lastReviewedText.current) return

      const controller = new AbortController()
      inFlight = controller
      dispatch({ type: 'reading', blockIndex: block.index })

      try {
        const result = await service.suggestForParagraph(block.text, controller.signal)
        if (controller.signal.aborted) return

        lastReviewedText.current = block.text
        if (!findUnchangedBlock(editor, block.index, block.text)) return dispatch({ type: 'cleared' })

        if (result) {
          dispatch({ type: 'suggested', suggestion: { blockIndex: block.index, original: block.text, ...result } })
        } else {
          dispatch({ type: 'reviewed', block: { blockIndex: block.index, text: block.text } })
        }
      } catch {
        if (!controller.signal.aborted) dispatch({ type: 'failed' })
      } finally {
        if (inFlight === controller) inFlight = null
      }
    }

    const onUpdate = () => {
      clearTimeout(timer)
      if (inFlight) {
        inFlight.abort()
        dispatch({ type: 'cancelled' })
      }

      // Drop a suggestion as soon as the text it was made for changes.
      const current = suggestionRef.current
      if (current && !findUnchangedBlock(editor, current.blockIndex, current.original)) {
        dispatch({ type: 'cleared' })
      }

      timer = setTimeout(() => void requestSuggestion(), PAUSE_MS)
    }

    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
      clearTimeout(timer)
      inFlight?.abort()
    }
  }, [editor, service])

  const accept = useCallback(() => {
    const suggestion = suggestionRef.current
    if (!editor || !suggestion) return

    dispatch({ type: 'cleared' })
    const block = findUnchangedBlock(editor, suggestion.blockIndex, suggestion.original)
    if (!block) return

    lastReviewedText.current = suggestion.revised // don't review our own edit again
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.insertText(suggestion.revised, block.from, block.to)
        return true
      })
      .run()

    // An accepted fix is Clarko's own wording, so the paragraph now reads well.
    dispatch({ type: 'reviewed', block: { blockIndex: suggestion.blockIndex, text: suggestion.revised } })
  }, [editor])

  const reject = useCallback(() => {
    const suggestion = suggestionRef.current
    dispatch({ type: 'cleared' })
    editor?.commands.focus()

    // The author chose to keep their wording, so treat the paragraph as reading well and move on to autocomplete.
    if (editor && suggestion && findUnchangedBlock(editor, suggestion.blockIndex, suggestion.original)) {
      dispatch({ type: 'reviewed', block: { blockIndex: suggestion.blockIndex, text: suggestion.original } })
    }
  }, [editor])

  // Tab accepts and Esc rejects, even when focus has left the editor (e.g. after renaming the title).
  // Listens in the capture phase so it runs before the editor's own keymaps, such as list indentation.
  useEffect(() => {
    if (!editor) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!suggestionRef.current || event.shiftKey) return
      if (event.key !== 'Tab' && event.key !== 'Escape') return
      if (isOtherTextField(event.target, editor.view.dom)) return

      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Tab') accept()
      else reject()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor, accept, reject])

  return { ...state, accept, reject }
}
