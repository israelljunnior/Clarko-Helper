import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { CompletionService } from '../services/completionService'
import { getCurrentBlock, isOtherTextField, type ReviewedBlock } from './useCoAuthor'

const PAUSE_MS = 350
const MAX_LINE_CHARS = 500
const MAX_CONTEXT_CHARS = 1000

export interface Completion {
  blockIndex: number
  /** Document position the words are inserted at: the cursor when they were requested. */
  position: number
  /** Continuations, most likely first. Tab inserts the first one. */
  options: string[]
}

/** Earlier blocks, closest last, so the model sees the tone and topic without the whole document. */
function contextBefore(editor: Editor, blockIndex: number): string {
  const { doc } = editor.state
  const parts: string[] = []
  for (let i = 0; i < blockIndex; i++) parts.push(doc.child(i).textContent)
  return parts.join('\n').slice(-MAX_CONTEXT_CHARS)
}

/**
 * Suggests the next words at the end of a line, but only once Clarko has reviewed the paragraph and
 * found it reads well: fixes come first, new words after. The words appear in Clarko's pane, and
 * Tab moves them into the document.
 */
export function useAutocomplete(editor: Editor | null, service: CompletionService, reviewed: ReviewedBlock | null) {
  const [completion, setCompletion] = useState<Completion | null>(null)

  const completionRef = useRef<Completion | null>(null)
  const reviewedRef = useRef(reviewed)
  const requestRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    completionRef.current = completion
  }, [completion])

  useEffect(() => {
    if (!editor) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight: AbortController | null = null

    const reset = () => {
      clearTimeout(timer)
      inFlight?.abort()
      inFlight = null
      setCompletion(null)
    }

    const request = async () => {
      const { selection } = editor.state
      if (!selection.empty) return

      const block = getCurrentBlock(editor)
      if (!block) return

      // The paragraph must be exactly the text Clarko approved.
      const approved = reviewedRef.current
      if (approved?.blockIndex !== block.index || approved.text !== block.text) return

      // Only complete at the end of a line, so the words never land in the middle of existing text.
      const position = selection.from
      const after = editor.state.doc.textBetween(position, block.to)
      if (after.trim()) return

      const line = editor.state.doc.textBetween(block.from, position).slice(-MAX_LINE_CHARS)
      if (!line.trim()) return

      const controller = new AbortController()
      inFlight = controller
      try {
        const options = await service.suggestNextWords(
          { line, context: contextBefore(editor, block.index) },
          controller.signal,
        )
        if (controller.signal.aborted || options.length === 0) return
        if (editor.state.selection.from !== position) return // the cursor moved while we waited
        setCompletion({ blockIndex: block.index, position, options })
      } catch {
        // Autocomplete is a nice-to-have: failures stay silent and the next pause tries again.
      } finally {
        if (inFlight === controller) inFlight = null
      }
    }

    const onUpdate = () => {
      reset()
      timer = setTimeout(() => void request(), PAUSE_MS)
    }

    requestRef.current = () => {
      reset()
      void request()
    }

    // Clicking or arrowing elsewhere makes the suggestion meaningless.
    const onSelectionUpdate = () => {
      const current = completionRef.current
      if (current && editor.state.selection.from !== current.position) reset()
    }

    editor.on('update', onUpdate)
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      editor.off('update', onUpdate)
      editor.off('selectionUpdate', onSelectionUpdate)
      requestRef.current = null
      clearTimeout(timer)
      inFlight?.abort()
    }
  }, [editor, service])

  // Clarko just approved a paragraph: that is the moment to offer the next words.
  useEffect(() => {
    reviewedRef.current = reviewed
    if (reviewed) requestRef.current?.() // clears any stale words first
  }, [reviewed])

  const accept = useCallback(
    (option?: string) => {
      const current = completionRef.current
      const text = option ?? current?.options[0]
      if (!editor || !current || !text) return

      setCompletion(null)
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.insertText(text, current.position)
          return true
        })
        .run()
    },
    [editor],
  )

  const dismiss = useCallback(() => {
    setCompletion(null)
    editor?.commands.focus()
  }, [editor])

  // Same capture-phase listener as the paragraph suggestion, so Tab never indents or leaves the editor.
  useEffect(() => {
    if (!editor) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!completionRef.current || !reviewedRef.current || event.shiftKey) return
      if (event.key !== 'Tab' && event.key !== 'Escape') return
      if (isOtherTextField(event.target, editor.view.dom)) return

      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Tab') accept()
      else dismiss()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor, accept, dismiss])

  return { completion: reviewed ? completion : null, accept, dismiss }
}
