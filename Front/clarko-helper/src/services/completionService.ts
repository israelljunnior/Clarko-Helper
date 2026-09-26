/**
 * Next-word autocomplete. Shapes mirror the API's /api/helper/suggestionautocomplete:
 * NextWordRequest { line, context } → NextWordResponse { suggestions }.
 */
export interface NextWordRequest {
  /** The line up to the cursor, untrimmed: a trailing space means a new word starts. */
  line: string
  /** Earlier text in the document, for tone and topic. */
  context?: string
}

export interface CompletionService {
  /** Up to 3 continuations, most likely first, each ready to insert exactly at the cursor. */
  suggestNextWords(request: NextWordRequest, signal?: AbortSignal): Promise<string[]>
}

const NEXT_WORDS: Record<string, string[]> = {
  a: ['few', 'great', 'quick look'],
  and: ['the', 'it', 'I'],
  be: ['able to', 'a', 'the'],
  can: ['be', 'help', 'write'],
  "don't": ['have', 'need to', 'want to'],
  dont: ['have', 'need to', 'want to'],
  for: ['the', 'a', 'writing'],
  have: ['time to', 'a', 'to'],
  i: ['think', 'want to', 'have been'],
  in: ['the', 'a', 'my'],
  is: ['very', 'a great', 'the best'],
  it: ['is', 'helps', 'makes'],
  my: ['writing', 'draft', 'document'],
  of: ['the', 'my', 'your'],
  the: ['editor', 'document', 'first draft'],
  this: ['editor', 'is', 'document'],
  time: ['to', 'for', 'and'],
  to: ['write', 'proofread', 'the next'],
  useful: ['when', 'for', 'because'],
  very: ['useful', 'helpful', 'easy to'],
  when: ['you', 'I', 'the author'],
  will: ['be', 'help', 'make'],
  with: ['the', 'a', 'your'],
  writing: ['is', 'a', 'the'],
  you: ['can', 'are writing', 'need to'],
}

const SENTENCE_STARTERS = ['It', 'This', 'The next']
const FALLBACK = ['and', 'the', 'with']

const VOCABULARY = [
  ...new Set([
    ...Object.keys(NEXT_WORDS),
    ...Object.values(NEXT_WORDS).flatMap((words) => words.flatMap((w) => w.split(' '))),
    'author', 'because', 'clarity', 'definitely', 'different', 'document', 'editor', 'example',
    'however', 'important', 'paragraph', 'probably', 'proofread', 'quickly', 'really', 'sentence',
    'something', 'suggestion', 'therefore', 'thinking', 'together', 'through', 'without', 'working',
  ]),
]

const MIN_LATENCY_MS = 200
const MAX_LATENCY_MS = 450

/** Canned predictions so the autocomplete UI can be tried without the API. */
export class MockCompletionService implements CompletionService {
  async suggestNextWords({ line }: NextWordRequest, signal?: AbortSignal): Promise<string[]> {
    await delay(MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS), signal)
    if (!line.trim()) return []

    // Mid-word: finish the word the author is typing.
    const partial = line.match(/[A-Za-z']{2,}$/)?.[0]
    if (partial) {
      const endings = VOCABULARY.filter(
        (word) => word.length > partial.length && word.toLowerCase().startsWith(partial.toLowerCase()),
      ).map((word) => word.slice(partial.length))
      if (endings.length > 0) return endings.slice(0, 3)
    }

    // After a finished sentence, start a new one.
    if (/[.!?]\s*$/.test(line)) return SENTENCE_STARTERS.map((s) => withSpace(line, s))

    const lastWord = line.trim().split(/\s+/).at(-1)?.toLowerCase().replace(/[^a-z']/g, '') ?? ''
    const next = NEXT_WORDS[lastWord] ?? FALLBACK
    return next.map((words) => withSpace(line, words))
  }
}

/** A new word needs a leading space unless the line already ends with one. */
function withSpace(line: string, words: string): string {
  return /\s$/.test(line) ? words : ` ${words}`
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Request aborted', 'AbortError'))
    if (signal?.aborted) return abort()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        abort()
      },
      { once: true },
    )
  })
}
