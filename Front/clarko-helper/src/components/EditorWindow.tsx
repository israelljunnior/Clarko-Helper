import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { MenuBar } from './MenuBar'
import { BudgetIndicator } from './BudgetIndicator'
import { CoAuthorPane, type MirrorBlock, type MirrorSegment } from './CoAuthorPane'
import { SelectionPopup, type ClarkoAnchor, type SelectionPopupHandle } from './SelectionPopup'
import { useAutocomplete } from '../hooks/useAutocomplete'
import { useSyncedScroll } from '../hooks/useSyncedScroll'
import { useDocumentSearch } from '../hooks/useDocumentSearch'
import { SearchHighlight } from '../extensions/searchHighlight'
import { SearchPopup } from './SearchPopup'
import { getBlockAt, getFullySelectedBlock } from '../hooks/editorBlocks'
import { SuggestionService } from '../services/suggestionService'
import { chatApi, helperApi } from '../services/api'
import clarkoLogo from '../assets/clarko-logo.png'

const INITIAL_CONTENT = `
<h1>A first draft</h1>
<p>Start writing here. Press Ctrl+Space and Clarko suggests your next words. Click a paragraph on the right to have it reviewed.</p>
<p>try it: i think this editor is very usefull  when you dont have time to proofread .</p>
`

interface DocumentSnapshot {
  blocks: MirrorBlock[]
  words: number
  characters: number
  lines: number
}

const EMPTY_SNAPSHOT: DocumentSnapshot = { blocks: [], words: 0, characters: 0, lines: 0 }

export function EditorWindow() {
  // Both AI helpers talk to the Clarko API; its address comes from src/environments/environment.ts.
  const service = useMemo(() => new SuggestionService(helperApi), [])
  const completions = helperApi
  // Clarko's insights stream from the API's /api/chat/insights.
  const insights = chatApi
  const [title, setTitle] = useState('')
  const [edited, setEdited] = useState(false)
  const [userPane, setUserPane] = useState<HTMLDivElement | null>(null)
  const [clarkoPane, setClarkoPane] = useState<HTMLDivElement | null>(null)
  /** The paragraph last picked in Clarko's pane; its review popup opens on Clarko's side. */
  const [pickedBlock, setPickedBlock] = useState<number | null>(null)

  // The selection popup and Clarko's insights never show together: opening one closes the other.
  const selectionPopup = useRef<SelectionPopupHandle>(null)
  const [insightsFor, setInsightsFor] = useState<number | null>(null)
  const openInsights = (index: number) => {
    selectionPopup.current?.close()
    setInsightsFor(index)
  }
  const closeInsights = useCallback(() => setInsightsFor(null), [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      FontSize,
      SearchHighlight,
    ],
    content: INITIAL_CONTENT,
    editorProps: {
      attributes: { class: 'writer', 'aria-label': 'Document', spellcheck: 'false' },
    },
  })

  const autocomplete = useAutocomplete(editor, completions)

  // Clarko Searching: one popup at a time, so opening it closes the selection popup and insights.
  const documentSearch = useDocumentSearch(editor, clarkoPane)
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = () => {
    selectionPopup.current?.close()
    setInsightsFor(null)
    setSearchOpen(true)
  }
  const closeSearch = () => {
    setSearchOpen(false)
    documentSearch.clear()
  }

  // Scrolling either pane keeps the other on the same paragraph: the editor's top-level blocks and
  // Clarko's mirror blocks line up one to one. The editor goes first: it leads when content changes.
  useSyncedScroll(
    { element: userPane, blocks: '.ProseMirror > *' },
    { element: clarkoPane, blocks: '.mirror__block' },
  )

  /** Selects a whole paragraph so the selection popup opens on it, ready to review. */
  const selectBlock = (index: number) => {
    if (!editor) return
    const block = getBlockAt(editor, index)
    if (!block || !block.text.trim()) return
    setPickedBlock(index)
    editor.chain().focus().setTextSelection({ from: block.from, to: block.to }).scrollIntoView().run()
  }

  // The paragraph whose whole text is selected, which Clarko's pane marks as its own selection.
  const selectedBlock =
    useEditorState({
      editor,
      selector: ({ editor: current }) => (current ? getFullySelectedBlock(current.state) : null),
    }) ?? null

  const snapshot =
    useEditorState({
      editor,
      selector: ({ editor: current }): DocumentSnapshot => {
        if (!current) return EMPTY_SNAPSHOT
        const { doc } = current.state

        const blocks: MirrorBlock[] = []
        doc.forEach((node) => {
          const level: unknown = node.attrs.level

          // Group the paragraph's text into runs that share a font, from the textStyle mark.
          const segments: MirrorSegment[] = []
          node.forEach((child) => {
            if (!child.isText || !child.text) return
            const style = child.marks.find((mark) => mark.type.name === 'textStyle')?.attrs
            const fontFamily = typeof style?.fontFamily === 'string' ? style.fontFamily : null
            const fontSize = typeof style?.fontSize === 'string' ? style.fontSize : null

            const last = segments.at(-1)
            if (last && last.fontFamily === fontFamily && last.fontSize === fontSize) last.text += child.text
            else segments.push({ text: child.text, fontFamily, fontSize })
          })

          blocks.push({
            type: node.type.name,
            level: typeof level === 'number' ? level : null,
            text: node.textContent,
            segments,
            reviewable: node.isTextblock && node.type.name !== 'codeBlock',
          })
        })

        const text = doc.textBetween(0, doc.content.size, '\n')
        const trimmed = text.trim()
        return {
          blocks,
          words: trimmed ? trimmed.split(/\s+/).length : 0,
          characters: text.replace(/\n/g, '').length,
          lines: doc.childCount,
        }
      },
    }) ?? EMPTY_SNAPSHOT

  // Once the author selects anything else, the popup goes back to their side.
  const reviewAnchor: ClarkoAnchor | null =
    clarkoPane && pickedBlock !== null && selectedBlock === pickedBlock
      ? { container: clarkoPane, blockIndex: pickedBlock }
      : null

  // Forget the picked paragraph as soon as the selection leaves it, so selecting that same
  // paragraph later in the author's pane opens the popup on their side.
  useEffect(() => {
    if (!editor) return
    const onSelectionUpdate = () => {
      const selected = getFullySelectedBlock(editor.state)
      setPickedBlock((picked) => (picked !== null && picked !== selected ? null : picked))
    }
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const markEdited = () => setEdited(true)
    editor.on('update', markEdited)
    return () => {
      editor.off('update', markEdited)
    }
  }, [editor])

  return (
    <main className="desktop">
      <div className="stage">
        <img className="stage__logo" src={clarkoLogo} alt="Clarko" />
        <div className="window">
          <header className="window__titlebar">
            <div className="window__lights" aria-hidden="true">
              <span className="light light--close" />
              <span className="light light--minimize" />
              <span className="light light--zoom" />
            </div>
            <div className="window__title">
              <input
                className="window__title-input"
                value={title}
                placeholder="Untitled"
                maxLength={50}
                aria-label="Document title"
                spellCheck={false}
                size={Math.max(title.length, 'Untitled'.length)}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
                }}
                onBlur={() => setTitle((current) => current.trim())}
              />
              {edited && <span className="window__edited"> — Edited</span>}
            </div>
            <div className="window__meta">
              <BudgetIndicator />
            </div>
          </header>

          {editor && <MenuBar editor={editor} />}

          <div className="window__panes">
            <section className="pane pane--user" aria-label="Your document">
              <header className="pane__header">
                <span className="presence presence--user" aria-hidden="true" />
                <span className="pane__name">You</span>
              </header>
              <div className="pane__body" ref={setUserPane}>
                <EditorContent editor={editor} />
                {editor && (
                  <SelectionPopup
                    ref={selectionPopup}
                    editor={editor}
                    service={service}
                    scrollTarget={userPane}
                    anchor={reviewAnchor}
                    onShow={closeInsights}
                  />
                )}
              </div>
            </section>

            <CoAuthorPane
              blocks={snapshot.blocks}
              selectedBlock={selectedBlock}
              completion={autocomplete.completion}
              onSelectBlock={selectBlock}
              onAcceptCompletion={autocomplete.accept}
              bodyRef={setClarkoPane}
              insights={insights}
              insightsFor={insightsFor}
              onOpenInsights={openInsights}
              onCloseInsights={closeInsights}
              onOpenSearch={openSearch}
              searchHits={searchOpen ? documentSearch.hits : []}
            />
          </div>

          <footer className="window__footer">
            {snapshot.words} Words • {snapshot.characters} Characters • {snapshot.lines} Lines
          </footer>

          {searchOpen && (
            <SearchPopup
              status={documentSearch.status}
              result={documentSearch.result}
              current={documentSearch.current}
              paragraphs={snapshot.blocks.map((block) => block.text)}
              onSearch={(query) => void documentSearch.search(query)}
              onSelect={documentSearch.setCurrent}
              onClose={closeSearch}
            />
          )}
        </div>
      </div>
    </main>
  )
}
