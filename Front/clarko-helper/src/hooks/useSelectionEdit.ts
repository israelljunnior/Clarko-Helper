import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Fragment, Slice, type Mark, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import type { SuggestionService, TextSuggestion } from '../services/suggestionService'
import { ApiError } from '../services/api'
import { LINE_BREAK } from './editorBlocks'

const ANOTHER_VERSION = 'Give me a different version'

/** How the end of one paragraph and the start of the next read in a selection sent to Clarko. */
const PARAGRAPH_BREAK = '\n\n'
/** The API accepts up to this much context around the selection. */
const MAX_CONTEXT_LENGTH = 4_000

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
  /** Why Clarko suggested this, or why it saw nothing to change ('unchanged'). */
  reason?: string
  /** What went wrong, when `phase` is 'error'. */
  error?: string
}

/** The document's text between two positions: paragraphs separated by a blank line, line breaks as "\n". */
function selectedText(doc: ProseMirrorNode, from: number, to: number): string {
  return doc.textBetween(from, to, PARAGRAPH_BREAK, LINE_BREAK)
}

/**
 * A selection the AI can edit: non-empty text in one paragraph or heading, or running across several.
 * Code blocks are left alone.
 */
export function getEditableSelection(state: EditorState): SelectionRange | null {
  const { from, to, empty, $from, $to } = state.selection
  if (empty || !$from.parent.isTextblock || !$to.parent.isTextblock) return null

  let touchesCode = false
  state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'codeBlock') touchesCode = true
    return !touchesCode
  })
  if (touchesCode) return null

  const original = selectedText(state.doc, from, to)
  if (!original.trim()) return null

  // The whole paragraph(s) the selection sits in, for tone and meaning.
  const context = selectedText(state.doc, $from.start(), $to.end()).slice(0, MAX_CONTEXT_LENGTH)
  return { from, to, original, context }
}

/** One paragraph's text as inline content: "\n" becomes a line break, and the text keeps `marks`. */
function inlineContent(schema: Schema, text: string, marks: readonly Mark[]): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = []
  text.split(LINE_BREAK).forEach((line, i) => {
    if (i > 0) nodes.push(schema.nodes.hardBreak ? schema.nodes.hardBreak.create() : schema.text(LINE_BREAK))
    if (line) nodes.push(schema.text(line, marks))
  })
  return nodes
}

/**
 * Puts `revised` in place of from–to. A blank line in it starts a new paragraph, so a rewrite can merge,
 * split or keep the selected paragraphs; the first and last join the blocks the selection started and
 * ended in, like pasting. Returns the position just after the new text.
 */
function replaceWithText(tr: Transaction, from: number, to: number, revised: string): number {
  const { schema } = tr.doc.type
  const marks = tr.doc.resolve(from).marks()
  const paragraphs = revised.split(/\n{2,}/)

  if (paragraphs.length === 1) {
    tr.replaceWith(from, to, inlineContent(schema, revised, marks))
  } else {
    const blocks = paragraphs.map((text) => schema.nodes.paragraph.create(null, inlineContent(schema, text, marks)))
    tr.replaceRange(from, to, new Slice(Fragment.from(blocks), 1, 1))
  }
  return tr.mapping.map(to)
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
        const { suggestion, reason } = await service.suggestForSelection(
          {
            selectedText: next.original,
            context: next.context,
            steps: next.steps,
            previousVersions: next.versions,
          },
          controller.signal,
        )
        if (controller.signal.aborted) return
        commit({ ...next, phase: suggestion ? 'ready' : 'unchanged', suggestion, reason })
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
    if (selectedText(editor.state.doc, from, to) !== original) return

    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        const end = replaceWithText(tr, from, to, suggestion.revised)
        tr.setSelection(TextSelection.near(tr.doc.resolve(end)))
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

  // `dismiss` drops the suggestion without touching focus, for when another popup is taking over.
  return { session, start, refine, retry, accept, reject, dismiss: close }
}
