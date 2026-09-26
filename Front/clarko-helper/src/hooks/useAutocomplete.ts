import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { CompletionService } from '../services/completionService'
import { getCurrentBlock, isOtherTextField } from './editorBlocks'

const PAUSE_MS = 350
/** Short enough to feel immediate on a click, long enough that holding an arrow key doesn't flood requests. */
const CURSOR_MOVE_MS = 120
const MAX_LINE_CHARS = 500
const MAX_CONTEXT_CHARS = 1000

export interface Completion {
  blockIndex: number
  /** Document position the words are inserted at: the cursor when they were requested. */
  position: number
  /** The same spot as a character offset into the paragraph's text, for showing the words in Clarko's pane. */
  offset: number
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

const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * Suggests the next words wherever the cursor is: after a pause in typing, or as soon as the author
 * clicks or moves the cursor. Only the paragraph's text before the cursor is used, so it works in the
 * middle of a sentence too. The words appear in Clarko's pane, and Tab moves them into the document.
 * Selecting text, such as a paragraph picked for review in Clarko's pane, clears them.
 */
export function useAutocomplete(editor: Editor | null, service: CompletionService) {
  const [completion, setCompletion] = useState<Completion | null>(null)

  const completionRef = useRef<Completion | null>(null)
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

      const position = selection.from
      const before = editor.state.doc.textBetween(block.from, position)
      const after = editor.state.doc.textBetween(position, block.to)
      if (!before.trim()) return

      // Inside a word ("use|ful") there is no sensible place for new words.
      if (WORD_CHAR.test(before.at(-1) ?? '') && WORD_CHAR.test(after[0] ?? '')) return

      const line = before.slice(-MAX_LINE_CHARS)

      const controller = new AbortController()
      inFlight = controller
      try {
        const options = await service.suggestNextWords(
          { line, context: contextBefore(editor, block.index) },
          controller.signal,
        )
        if (controller.signal.aborted) return
        if (editor.state.selection.from !== position) return // the cursor moved while we waited

        // Only the text before the cursor is sent, so drop words that just repeat what already follows it.
        const following = after.trimStart().toLowerCase()
        const fresh = options.filter((option) => !following.startsWith(option.trim().toLowerCase()))
        if (fresh.length === 0) return

        // In the middle of a sentence, keep a space between the new words and the word that follows.
        const needsSpace = WORD_CHAR.test(after[0] ?? '')
        setCompletion({
          blockIndex: block.index,
          position,
          offset: before.length,
          options: fresh.map((option) => (needsSpace && !/\s$/.test(option) ? `${option} ` : option)),
        })
      } catch {
        // Autocomplete is a nice-to-have: failures stay silent and the next pause tries again.
      } finally {
        if (inFlight === controller) inFlight = null
      }
    }

    const schedule = (delay: number) => {
      reset()
      timer = setTimeout(() => void request(), delay)
    }

    const onUpdate = () => schedule(PAUSE_MS)

    // A click or arrow key puts the cursor somewhere new: suggest for that spot right away.
    // Selecting text clears the suggestion instead.
    const onSelectionUpdate = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) return // typing: onUpdate waits for the pause
      if (editor.state.selection.empty) schedule(CURSOR_MOVE_MS)
      else reset()
    }

    editor.on('update', onUpdate)
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      editor.off('update', onUpdate)
      editor.off('selectionUpdate', onSelectionUpdate)
      clearTimeout(timer)
      inFlight?.abort()
    }
  }, [editor, service])

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
      if (!completionRef.current || event.shiftKey) return
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

  return { completion, accept, dismiss }
}
