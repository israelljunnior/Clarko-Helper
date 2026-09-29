import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { helperApi, type SearchResponse } from '../services/api'
import { blockText, getBlockAt, textBetween } from './editorBlocks'
import { setSearchHighlights, type HighlightRange } from '../extensions/searchHighlight'

export type SearchStatus = 'idle' | 'searching' | 'done' | 'error'

/** A match to highlight in Clarko's pane: character offsets into one paragraph. */
export interface SearchHit {
  paragraph: number
  start: number
  length: number
  current: boolean
}

/**
 * Searches the whole document through the API and shows the matches in both panes: highlighted in the
 * editor and in Clarko's copy, with the current match scrolled into view on both sides. Editing the
 * document clears the results, since their positions no longer hold.
 */
export function useDocumentSearch(editor: Editor | null, clarkoPane: HTMLElement | null) {
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [current, setCurrent] = useState(0)
  const inFlight = useRef<AbortController | null>(null)
  const hasResult = useRef(false)

  useEffect(() => {
    hasResult.current = result !== null
  }, [result])

  const search = useCallback(
    async (query: string) => {
      if (!editor || !query.trim()) return
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      // One entry per top-level block, in order: match positions refer to these indexes.
      const paragraphs: string[] = []
      editor.state.doc.forEach((node) => paragraphs.push(blockText(node)))

      setStatus('searching')
      setResult(null)
      try {
        const response = await helperApi.search({ query: query.trim(), paragraphs }, controller.signal)
        if (controller.signal.aborted) return
        setResult(response)
        setCurrent(0)
        setStatus('done')
      } catch {
        if (!controller.signal.aborted) setStatus('error') // the interceptor already showed a toast
      } finally {
        if (inFlight.current === controller) inFlight.current = null
      }
    },
    [editor],
  )

  const clear = useCallback(() => {
    inFlight.current?.abort()
    setResult(null)
    setStatus('idle')
  }, [])

  // Positions go stale as soon as the document changes.
  useEffect(() => {
    if (!editor) return
    const onUpdate = () => {
      if (hasResult.current) {
        setResult(null)
        setStatus('idle')
      }
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
      inFlight.current?.abort()
    }
  }, [editor])

  // Highlight the matches in the editor and bring the current one into view on both sides.
  useEffect(() => {
    if (!editor) return
    const ranges: HighlightRange[] = []
    result?.matches.forEach((match, index) => {
      const block = getBlockAt(editor, match.paragraph)
      if (!block) return
      const from = block.from + match.start
      const to = from + match.length
      // Only highlight where the text really is (a safety net: positions and offsets match by design).
      if (to > block.to || textBetween(editor, from, to) !== match.text) return
      ranges.push({ from, to, current: index === current })
    })
    setSearchHighlights(editor, ranges)

    if (!result?.matches.length) return
    editor.view.dom.querySelector('.search-hit.is-current')?.scrollIntoView({ block: 'center' })
    clarkoPane?.querySelector('.search-hit.is-current')?.scrollIntoView({ block: 'center' })
  }, [editor, clarkoPane, result, current])

  const hits: SearchHit[] =
    result?.matches.map((match, index) => ({
      paragraph: match.paragraph,
      start: match.start,
      length: match.length,
      current: index === current,
    })) ?? []

  return { status, result, current, setCurrent, search, clear, hits }
}
