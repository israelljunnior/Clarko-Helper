import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { MenuBar } from './MenuBar'
import { CoAuthorPane, type MirrorBlock } from './CoAuthorPane'
import { SelectionPopup } from './SelectionPopup'
import { useCoAuthor } from '../hooks/useCoAuthor'
import { useAutocomplete } from '../hooks/useAutocomplete'
import { MockOpenRouterClient } from '../services/mockOpenRouterClient'
import { SuggestionService } from '../services/suggestionService'
import { MockCompletionService } from '../services/completionService'
import clarkoLogo from '../assets/clarko-logo.png'

const INITIAL_CONTENT = `
<h1>A first draft</h1>
<p>Start writing here. When you pause, your co-author reads the paragraph you're in and suggests small fixes on the right.</p>
<p>try it: i think this editor is very usefull  when you dont have time to proofread .</p>
`

interface DocumentSnapshot {
  blocks: MirrorBlock[]
  words: number
  characters: number
  lines: number
}

const EMPTY_SNAPSHOT: DocumentSnapshot = { blocks: [], words: 0, characters: 0, lines: 0 }

/** U-turn arrow pointing left; mirrored for redo. */
function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M6 5 2 9l4 4M2 9h15a4.5 4.5 0 0 1 0 9H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function EditorWindow() {
  // The mock is swapped for the real OpenRouter client once the backend proxy exists.
  const service = useMemo(() => new SuggestionService(new MockOpenRouterClient()), [])
  const completions = useMemo(() => new MockCompletionService(), [])
  const [title, setTitle] = useState('')
  const [edited, setEdited] = useState(false)
  const [userPane, setUserPane] = useState<HTMLDivElement | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: INITIAL_CONTENT,
    editorProps: {
      attributes: { class: 'writer', 'aria-label': 'Document', spellcheck: 'false' },
    },
  })

  const coAuthor = useCoAuthor(editor, service)
  const autocomplete = useAutocomplete(editor, completions, coAuthor.reviewed)

  const snapshot =
    useEditorState({
      editor,
      selector: ({ editor: current }): DocumentSnapshot => {
        if (!current) return EMPTY_SNAPSHOT
        const { doc } = current.state

        const blocks: MirrorBlock[] = []
        doc.forEach((node) => {
          const level: unknown = node.attrs.level
          blocks.push({
            type: node.type.name,
            level: typeof level === 'number' ? level : null,
            text: node.textContent,
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

  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  })

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
            <div className="window__actions">
              <button
                type="button"
                className="window__action"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                disabled={!history?.canUndo}
                onClick={() => editor?.chain().focus().undo().run()}
              >
                <UndoIcon />
              </button>
              <button
                type="button"
                className="window__action window__action--redo"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
                disabled={!history?.canRedo}
                onClick={() => editor?.chain().focus().redo().run()}
              >
                <UndoIcon />
              </button>
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
                {editor && <SelectionPopup editor={editor} service={service} scrollTarget={userPane} />}
              </div>
            </section>

            <CoAuthorPane
              blocks={snapshot.blocks}
              status={coAuthor.status}
              activeBlock={coAuthor.activeBlock}
              suggestion={coAuthor.suggestion}
              completion={autocomplete.completion}
              reviewed={coAuthor.reviewed}
              onAccept={coAuthor.accept}
              onReject={coAuthor.reject}
              onAcceptCompletion={autocomplete.accept}
              onReviewAgain={coAuthor.reviewAgain}
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
