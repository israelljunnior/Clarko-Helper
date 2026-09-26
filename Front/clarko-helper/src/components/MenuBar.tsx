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

// An empty value means "use the editor's default" and removes the style.
const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Sans serif', value: "'Segoe UI', system-ui, sans-serif" },
  { label: 'Serif', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Monospace', value: "'Courier New', monospace" },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
]

const FONT_SIZES = ['', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px']

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

interface SelectProps {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
}

function MenuSelect({ label, value, options, onChange }: SelectProps) {
  // A value outside the list (e.g. pasted text) shows as Default rather than a blank select.
  const known = options.some((option) => option.value === value) ? value : ''
  return (
    <select
      className="menubar__select"
      aria-label={label}
      title={label}
      value={known}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/** Formatting toolbar for the document; buttons light up for the formats at the cursor. */
export function MenuBar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      Object.fromEntries(ITEMS.map((item) => [item.label, item.isActive(current)])),
  })

  const font = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { fontFamily, fontSize } = current.getAttributes('textStyle') as {
        fontFamily?: string
        fontSize?: string
      }
      return { family: fontFamily ?? '', size: fontSize ?? '' }
    },
  })

  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  })

  const setFamily = (family: string) => {
    const chain = editor.chain().focus()
    void (family ? chain.setFontFamily(family) : chain.unsetFontFamily()).run()
  }

  const setSize = (size: string) => {
    const chain = editor.chain().focus()
    void (size ? chain.setFontSize(size) : chain.unsetFontSize()).run()
  }

  return (
    <div className="menubar" role="toolbar" aria-label="Formatting">
      <div className="menubar__group">
        <button
          type="button"
          className="menubar__history"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={!history.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="menubar__history menubar__history--redo"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          disabled={!history.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <UndoIcon />
        </button>
      </div>
      <div className="menubar__group">
        <MenuSelect label="Font family" value={font.family} options={FONT_FAMILIES} onChange={setFamily} />
        <MenuSelect
          label="Font size"
          value={font.size}
          options={FONT_SIZES.map((size) => ({ label: size ? size.replace('px', '') : 'Size', value: size }))}
          onChange={setSize}
        />
      </div>
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
