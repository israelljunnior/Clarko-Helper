import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  OpenRouterClient,
} from './openRouterClient'

interface RewriteRule {
  pattern: RegExp
  replacement: string
  reason: string
}

// Deterministic, small edits so the UI can be built without spending API budget.
const PROOFREAD: RewriteRule[] = [
  { pattern: / {2,}/g, replacement: ' ', reason: 'Removed extra spaces' },
  { pattern: /\s+([,.!?;:])/g, replacement: '$1', reason: 'Fixed punctuation spacing' },
  { pattern: /\bi\b/g, replacement: 'I', reason: 'Capitalized "I"' },
  { pattern: /\bdont\b/g, replacement: "don't", reason: 'Fixed contractions' },
  { pattern: /\bcant\b/g, replacement: "can't", reason: 'Fixed contractions' },
  { pattern: /\bwont\b/g, replacement: "won't", reason: 'Fixed contractions' },
  { pattern: /\bteh\b/g, replacement: 'the', reason: 'Fixed spelling' },
  { pattern: /\brecieve\b/g, replacement: 'receive', reason: 'Fixed spelling' },
  { pattern: /\busefull\b/g, replacement: 'useful', reason: 'Fixed spelling' },
  { pattern: /\bdefinately\b/g, replacement: 'definitely', reason: 'Fixed spelling' },
]

const TIGHTEN: RewriteRule[] = [
  { pattern: /\bin order to\b/gi, replacement: 'to', reason: 'Tightened wording' },
  { pattern: /\b(very|really|just|actually|basically,?) /gi, replacement: '', reason: 'Cut filler words' },
]

const FORMAL: RewriteRule[] = [
  { pattern: /\bdon't\b/gi, replacement: 'do not', reason: 'Expanded contractions' },
  { pattern: /\bcan't\b/gi, replacement: 'cannot', reason: 'Expanded contractions' },
  { pattern: /\bwon't\b/gi, replacement: 'will not', reason: 'Expanded contractions' },
  { pattern: /\bit's\b/gi, replacement: 'it is', reason: 'Expanded contractions' },
  { pattern: /\bI'm\b/g, replacement: 'I am', reason: 'Expanded contractions' },
  { pattern: /\ba lot of\b/gi, replacement: 'many', reason: 'More formal wording' },
  { pattern: /\bso\b/g, replacement: 'therefore', reason: 'More formal wording' },
]

const CASUAL: RewriteRule[] = [
  { pattern: /\bdo not\b/gi, replacement: "don't", reason: 'Used contractions' },
  { pattern: /\bcannot\b/gi, replacement: "can't", reason: 'Used contractions' },
  { pattern: /\bwill not\b/gi, replacement: "won't", reason: 'Used contractions' },
  { pattern: /\b([Ii])t is\b/g, replacement: "$1t's", reason: 'Used contractions' },
  { pattern: /\bI am\b/g, replacement: "I'm", reason: 'Used contractions' },
  { pattern: /\btherefore\b/gi, replacement: 'so', reason: 'Friendlier wording' },
  { pattern: /\bhowever\b/gi, replacement: 'but', reason: 'Friendlier wording' },
]

const MIN_LATENCY_MS = 600
const MAX_LATENCY_MS = 1200

export class MockOpenRouterClient implements OpenRouterClient {
  async createChatCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    await this.simulateLatency(signal)

    const text = this.findTextToEdit(request.messages)
    const instruction = this.findLatestInstruction(request.messages)
    const content = JSON.stringify(this.edit(text, instruction))

    return {
      id: `gen-mock-${Date.now()}`,
      provider: 'Mock',
      model: request.model,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          native_finish_reason: 'stop',
          message: { role: 'assistant', content, refusal: null },
        },
      ],
      usage: this.estimateUsage(request, content),
    }
  }

  private edit(text: string, instruction: string): { revised: string | null; reason: string } {
    const reasons = new Set<string>()
    let revised = this.apply(text, this.rulesFor(instruction), reasons)

    if (/short|concise|trim/i.test(instruction) && revised === text) {
      const firstSentence = text.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0]
      if (firstSentence && firstSentence.length < text.trim().length) {
        revised = firstSentence
        reasons.add('Kept only the first sentence')
      }
    }

    const capitalized = revised.replace(
      /(^|[.!?]\s+)([a-z])/g,
      (_, boundary: string, letter: string) => boundary + letter.toUpperCase(),
    )
    if (capitalized !== revised) reasons.add('Capitalized sentences')
    revised = capitalized

    if (revised === text) return { revised: null, reason: 'Nothing to change' }
    return { revised, reason: [...reasons].slice(0, 3).join(', ') }
  }

  private rulesFor(instruction: string): RewriteRule[] {
    if (/grammar|spelling|punctuation|proofread/i.test(instruction)) return PROOFREAD
    // "informal" contains "formal", so casual is checked first.
    if (/casual|informal|friendl/i.test(instruction)) return [...PROOFREAD, ...CASUAL]
    if (/formal/i.test(instruction)) return [...PROOFREAD, ...FORMAL]
    return [...PROOFREAD, ...TIGHTEN]
  }

  private apply(text: string, rules: RewriteRule[], reasons: Set<string>): string {
    return rules.reduce((current, rule) => {
      const next = current.replace(rule.pattern, rule.replacement)
      if (next !== current) reasons.add(rule.reason)
      return next
    }, text)
  }

  /** On a refinement the latest AI version is edited; otherwise the last quoted block of the first request. */
  private findTextToEdit(messages: ChatMessage[]): string {
    for (const message of [...messages].reverse()) {
      if (message.role !== 'assistant') continue
      try {
        const { revised } = JSON.parse(message.content) as { revised?: unknown }
        if (typeof revised === 'string') return revised
      } catch {
        // not JSON, keep looking
      }
    }

    const firstRequest = messages.find((m) => m.role === 'user')?.content ?? ''
    const quoted = [...firstRequest.matchAll(/"""\n([\s\S]*?)\n"""/g)]
    return quoted.at(-1)?.[1] ?? firstRequest
  }

  private findLatestInstruction(messages: ChatMessage[]): string {
    const lastUser = messages.findLast((m) => m.role === 'user')?.content ?? ''
    return lastUser.match(/Instruction: (.*)/)?.[1] ?? ''
  }

  private estimateUsage(request: ChatCompletionRequest, completion: string) {
    const promptChars = request.messages.reduce((sum, m) => sum + m.content.length, 0)
    const prompt_tokens = Math.ceil(promptChars / 4)
    const completion_tokens = Math.ceil(completion.length / 4)
    return { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens }
  }

  private simulateLatency(signal?: AbortSignal): Promise<void> {
    const delay = MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS)
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Request aborted', 'AbortError'))
      if (signal?.aborted) return abort()
      const timer = setTimeout(resolve, delay)
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
}
