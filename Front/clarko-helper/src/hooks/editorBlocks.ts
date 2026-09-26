import type { Editor } from '@tiptap/react'
import type { EditorState } from '@tiptap/pm/state'

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

/** The top-level paragraph or heading at `index`, or null for other blocks (lists, quotes, code). */
export function getBlockAt(editor: Editor, index: number): BlockRange | null {
  const { doc } = editor.state
  if (index < 0 || index >= doc.childCount) return null

  const node = doc.child(index)
  if (!node.isTextblock || node.type.name === 'codeBlock') return null

  let offset = 0
  for (let i = 0; i < index; i++) offset += doc.child(i).nodeSize
  return { index, from: offset + 1, to: offset + node.nodeSize - 1, text: node.textContent }
}

/** The index of the top-level block whose whole text is selected, or null. */
export function getFullySelectedBlock(state: EditorState): number | null {
  const { from, to, empty, $from, $to } = state.selection
  if (empty || $from.depth < 1 || !$from.sameParent($to)) return null
  return from === $from.start(1) && to === $from.end(1) ? $from.index(0) : null
}

/** Inputs outside the editor (title, popup prompt) keep Tab and Esc for themselves. */
export function isOtherTextField(target: EventTarget | null, editorDom: HTMLElement): boolean {
  if (!(target instanceof HTMLElement) || editorDom.contains(target)) return false
  return target.matches('input, textarea, select') || target.isContentEditable
}
