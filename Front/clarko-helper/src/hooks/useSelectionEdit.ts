import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { TextSelection, type EditorState } from '@tiptap/pm/state'
import type { SuggestionService, TextSuggestion } from '../services/suggestionService'
import { ApiError } from '../services/api'

const ANOTHER_VERSION = 'Give me a different version'

export type SelectionPhase = 'loading' | 'ready' | 'unchanged' | 'error'

interface SelectionRange {
  from: number
  to: number
  original: string
  context: string
}

export interface SelectionSession extends SelectionRange {
  steps: string[]
  versions: (string | null)[]
  phase: SelectionPhase
  suggestion: TextSuggestion | null
  /** What went wrong, when `phase` is 'error'. */
  error?: string
}

/** A selection the AI can edit: non-empty text inside a single paragraph or heading. */
export function getEditableSelection(state: EditorState): SelectionRange | null {
  const { from, to, empty, $from, $to } = state.selection
  if (empty || !$from.sameParent($to)) return null
  if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return null

  const original = state.doc.textBetween(from, to, '\n')
  if (!original.trim()) return null
  return { from, to, original, context: $from.parent.textContent }
}

export function useSelectionEdit(editor: Editor, service: SuggestionService) {
  const [session, setSession] = useState<SelectionSession | null>(null)
  const sessionRef = useRef<SelectionSession | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  const commit = useCallback((next: SelectionSession | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const close = useCallback(() => {
    inFlight.current?.abort()
    inFlight.current = null
    commit(null)
  }, [commit])

  const run = useCallback(
    async (next: SelectionSession) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      commit({ ...next, phase: 'loading', suggestion: null })

      try {
        const suggestion = await service.suggestForSelection(
          {
            selectedText: next.original,
            context: next.context,
            steps: next.steps,
            previousVersions: next.versions,
          },
          controller.signal,
        )
        if (controller.signal.aborted) return
        commit({ ...next, phase: suggestion ? 'ready' : 'unchanged', suggestion })
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof ApiError ? error.message : 'Something went wrong. Try again.'
        commit({ ...next, phase: 'error', suggestion: null, error: message })
      }
    },
    [commit, service],
  )

  const start = useCallback(
    (instruction: string) => {
      const range = getEditableSelection(editor.state)
      if (!range || !instruction.trim()) return
      void run({ ...range, steps: [instruction.trim()], versions: [], phase: 'loading', suggestion: null })
    },
    [editor, run],
  )

  /** Asks again for the same selection, building on the latest version. */
  const refine = useCallback(
    (instruction: string) => {
      const current = sessionRef.current
      if (!current || current.phase === 'loading') return
      void run({
        ...current,
        steps: [...current.steps, instruction.trim() || ANOTHER_VERSION],
        versions: [...current.versions, current.suggestion?.revised ?? null],
      })
    },
    [run],
  )

  const retry = useCallback(() => {
    const current = sessionRef.current
    if (current) void run(current)
  }, [run])

  const accept = useCallback(() => {
    const current = sessionRef.current
    if (!current?.suggestion) return

    const { from, to, original, suggestion } = current
    close()
    if (editor.state.doc.textBetween(from, to, '\n') !== original) return

    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.insertText(suggestion.revised, from, to)
        tr.setSelection(TextSelection.create(tr.doc, from + suggestion.revised.length))
        return true
      })
      .run()
  }, [close, editor])

  /** Drops the suggestion but keeps the selection, so the author can try another action. */
  const reject = useCallback(() => {
    close()
    editor.commands.focus()
  }, [close, editor])

  // A session belongs to one exact selection of one exact text. Anything else ends it.
  useEffect(() => {
    const onSelectionUpdate = () => {
      const current = sessionRef.current
      if (!current) return
      const { from, to } = editor.state.selection
      if (from !== current.from || to !== current.to) close()
    }

    editor.on('selectionUpdate', onSelectionUpdate)
    editor.on('update', close)
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate)
      editor.off('update', close)
      inFlight.current?.abort()
    }
  }, [editor, close])

  return { session, start, refine, retry, accept, reject }
}
