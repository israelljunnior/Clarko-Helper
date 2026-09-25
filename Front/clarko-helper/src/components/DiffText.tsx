import { diffWords } from 'diff'

interface DiffTextProps {
  original: string
  revised: string
}

/** Word-level diff: removed words struck through, added words highlighted. */
export function DiffText({ original, revised }: DiffTextProps) {
  return (
    <span className="diff">
      {diffWords(original, revised).map((part, i) => {
        if (part.added) return <ins key={i}>{part.value}</ins>
        if (part.removed) return <del key={i}>{part.value}</del>
        return <span key={i}>{part.value}</span>
      })}
    </span>
  )
}
