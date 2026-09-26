import { useEditorState, type Editor } from '@tiptap/react'

type Level = 1 | 2 | 3
type Alignment = 'left' | 'center' | 'right'

interface MenuItem {
  label: string
  shortcut?: string
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const heading = (level: Level): MenuItem => ({
  label: `H${level}`,
  isActive: (editor) => editor.isActive('heading', { level }),
  run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
})

const align = (alignment: Alignment, label: string): MenuItem => ({
  label,
  isActive: (editor) => editor.isActive({ textAlign: alignment }),
  run: (editor) => editor.chain().focus().setTextAlign(alignment).run(),
})

const GROUPS: MenuItem[][] = [
  [
    heading(1),
    heading(2),
    heading(3),
    {
      label: 'Paragraph',
      isActive: (editor) => editor.isActive('paragraph'),
      run: (editor) => editor.chain().focus().setParagraph().run(),
    },
  ],
  [
    {
      label: 'Bold',
      shortcut: 'Ctrl+B',
      isActive: (editor) => editor.isActive('bold'),
      run: (editor) => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      shortcut: 'Ctrl+I',
      isActive: (editor) => editor.isActive('italic'),
      run: (editor) => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Strike',
      shortcut: 'Ctrl+Shift+S',
      isActive: (editor) => editor.isActive('strike'),
      run: (editor) => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: 'Highlight',
      shortcut: 'Ctrl+Shift+H',
      isActive: (editor) => editor.isActive('highlight'),
      run: (editor) => editor.chain().focus().toggleHighlight().run(),
    },
  ],
  [align('left', 'Left'), align('center', 'Center'), align('right', 'Right')],
]

const ITEMS = GROUPS.flat()

/** Formatting toolbar for the document; buttons light up for the formats at the cursor. */
export function MenuBar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      Object.fromEntries(ITEMS.map((item) => [item.label, item.isActive(current)])),
  })

  return (
    <div className="menubar" role="toolbar" aria-label="Formatting">
      {GROUPS.map((group, groupIndex) => (
        <div className="menubar__group" key={groupIndex}>
          {group.map((item) => {
            const isActive = active[item.label] ?? false
            return (
              <button
                key={item.label}
                type="button"
                className={isActive ? 'menubar__button is-active' : 'menubar__button'}
                aria-pressed={isActive}
                title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                onClick={() => item.run(editor)}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
