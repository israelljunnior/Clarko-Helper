import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { MenuBar } from './MenuBar'
import { CoAuthorPane, type MirrorBlock, type MirrorSegment } from './CoAuthorPane'
import { SelectionPopup, type ClarkoAnchor } from './SelectionPopup'
import { useAutocomplete } from '../hooks/useAutocomplete'
import { getBlockAt, getFullySelectedBlock } from '../hooks/editorBlocks'
import { MockOpenRouterClient } from '../services/mockOpenRouterClient'
import { SuggestionService } from '../services/suggestionService'
import { MockCompletionService } from '../services/completionService'
import clarkoLogo from '../assets/clarko-logo.png'

const INITIAL_CONTENT = `
<h1>A first draft</h1>
<p>Start writing here. Clarko suggests your next words as you type. Click a paragraph on the right to have it reviewed.</p>
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
  // The mock is swapped for the real OpenRouter client once the backend proxy exists.
  const service = useMemo(() => new SuggestionService(new MockOpenRouterClient()), [])
  const completions = useMemo(() => new MockCompletionService(), [])
  const [title, setTitle] = useState('')
  const [edited, setEdited] = useState(false)
  const [userPane, setUserPane] = useState<HTMLDivElement | null>(null)
  const [clarkoPane, setClarkoPane] = useState<HTMLDivElement | null>(null)
  /** The paragraph last picked in Clarko's pane; its review popup opens on Clarko's side. */
  const [pickedBlock, setPickedBlock] = useState<number | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      FontSize,
    ],
    content: INITIAL_CONTENT,
    editorProps: {
      attributes: { class: 'writer', 'aria-label': 'Document', spellcheck: 'false' },
    },
  })

  const autocomplete = useAutocomplete(editor, completions)

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
                  <SelectionPopup editor={editor} service={service} scrollTarget={userPane} anchor={reviewAnchor} />
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
            />
          </div>

          <footer className="window__footer">
            {snapshot.words} Words • {snapshot.characters} Characters • {snapshot.lines} Lines
          </footer>
        </div>
      </div>
    </main>
  )
}
