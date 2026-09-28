import { Extension, type Editor } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface HighlightRange {
  from: number
  to: number
  /** The match the author is looking at, highlighted more strongly. */
  current: boolean
}

const searchHighlightKey = new PluginKey<DecorationSet>('searchHighlight')

/**
 * Highlights search matches in the editor without touching the document or the selection (a real
 * selection would open the selection popup). Highlights follow edits until they are replaced or cleared.
 */
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, highlights) {
            const ranges = tr.getMeta(searchHighlightKey) as HighlightRange[] | undefined
            if (!ranges) return highlights.map(tr.mapping, tr.doc)
            return DecorationSet.create(
              tr.doc,
              ranges.map((range) =>
                Decoration.inline(range.from, range.to, { class: range.current ? 'search-hit is-current' : 'search-hit' }),
              ),
            )
          },
        },
        props: {
          decorations: (state) => searchHighlightKey.getState(state),
        },
      }),
    ]
  },
})

/** Replaces the highlighted matches; an empty list clears them. */
export function setSearchHighlights(editor: Editor, ranges: HighlightRange[]) {
  editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, ranges))
}
