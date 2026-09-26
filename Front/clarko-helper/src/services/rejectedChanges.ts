import { diffWords } from 'diff'

/** One edit inside a suggestion: a run of removed words and/or the words that replace them. */
export interface TextChange {
  removed: string
  added: string
}

/** Identifies an edit regardless of the spacing around it, so "usefull" → "useful" matches anywhere. */
export function changeKey({ removed, added }: TextChange): string {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
  return `${normalize(removed)}→${normalize(added)}`
}

/** Splits a suggestion into its separate edits, in the order they appear. */
export function splitChanges(original: string, revised: string): TextChange[] {
  const changes: TextChange[] = []
  let pending: TextChange | null = null

  for (const part of diffWords(original, revised)) {
    if (part.added || part.removed) {
      pending ??= { removed: '', added: '' }
      if (part.added) pending.added += part.value
      else pending.removed += part.value
    } else if (pending) {
      changes.push(pending)
      pending = null
    }
  }
  if (pending) changes.push(pending)
  return changes
}

/**
 * Undoes every edit in `revised` that the author already rejected, keeping the rest of the suggestion.
 * Returns the text that is left and the keys of the edits it skipped.
 */
export function withoutRejected(
  original: string,
  revised: string,
  rejected: ReadonlySet<string>,
): { revised: string; skipped: string[] } {
  let text = ''
  const skipped: string[] = []
  let pending: TextChange | null = null

  const flush = () => {
    if (!pending) return
    const key = changeKey(pending)
    if (rejected.has(key)) {
      text += pending.removed
      skipped.push(key)
    } else {
      text += pending.added
    }
    pending = null
  }

  for (const part of diffWords(original, revised)) {
    if (part.added || part.removed) {
      pending ??= { removed: '', added: '' }
      if (part.added) pending.added += part.value
      else pending.removed += part.value
    } else {
      flush()
      text += part.value
    }
  }
  flush()

  return { revised: text, skipped }
}
