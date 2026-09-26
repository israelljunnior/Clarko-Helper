import type { ChatMessage, OpenRouterClient } from './openRouterClient'

export interface TextSuggestion {
  revised: string
  reason: string
}

export interface SelectionEditRequest {
  selectedText: string
  /** The paragraph around the selection, sent for context only. */
  context: string
  /** Every instruction so far, oldest first. The last one is answered now. */
  steps: string[]
  /** The AI's answer to each earlier step (null when it suggested no change). */
  previousVersions: (string | null)[]
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini'

const RESPONSE_FORMAT = `Respond only with JSON: {"revised": string | null, "reason": string}.
Use null for "revised" when no change is needed. Keep "reason" under 12 words.`

const SELECTION_PROMPT = `You are Clarko, a co-author editing a passage the author selected in a Markdown document.
Rewrite only the selected text, following the author's instruction. The surrounding paragraph is context:
never include it in your answer. Keep Markdown syntax, the author's voice and the meaning unless asked otherwise.
When the author refines, apply the new instruction to your latest version.
${RESPONSE_FORMAT}`

/** Builds prompts for both AI flows and turns OpenRouter responses into suggestions. */
export class SuggestionService {
  private readonly client: OpenRouterClient
  private readonly model: string

  constructor(client: OpenRouterClient, model: string = DEFAULT_MODEL) {
    this.client = client
    this.model = model
  }

  suggestForSelection(
    request: SelectionEditRequest,
    signal?: AbortSignal,
  ): Promise<TextSuggestion | null> {
    const [firstStep, ...refinements] = request.steps
    const messages: ChatMessage[] = [
      { role: 'system', content: SELECTION_PROMPT },
      {
        role: 'user',
        content:
          `Paragraph (context only):\n"""\n${request.context}\n"""\n\n` +
          `Selected text:\n"""\n${request.selectedText}\n"""\n\n` +
          `Instruction: ${firstStep}`,
      },
    ]

    // Replaying earlier turns lets "shorter", then "more formal" build on each other.
    refinements.forEach((instruction, i) => {
      const revised = request.previousVersions[i] ?? null
      messages.push({ role: 'assistant', content: JSON.stringify({ revised, reason: '' }) })
      messages.push({ role: 'user', content: `Instruction: ${instruction}` })
    })

    return this.complete(messages, request.selectedText, signal)
  }

  private async complete(
    messages: ChatMessage[],
    original: string,
    signal?: AbortSignal,
  ): Promise<TextSuggestion | null> {
    const response = await this.client.createChatCompletion(
      {
        model: this.model,
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages,
      },
      signal,
    )

    const content = response.choices[0]?.message.content
    if (!content) return null

    const suggestion = this.parse(content)
    if (!suggestion || suggestion.revised.trim() === original.trim()) return null
    return suggestion
  }

  private parse(content: string): TextSuggestion | null {
    try {
      // Models sometimes wrap JSON in code fences even when asked not to.
      const json: unknown = JSON.parse(content.replace(/```(?:json)?/g, '').trim())
      if (typeof json !== 'object' || json === null) return null

      const { revised, reason } = json as Record<string, unknown>
      if (typeof revised !== 'string' || revised.length === 0) return null
      return { revised, reason: typeof reason === 'string' ? reason : 'Suggested edit' }
    } catch {
      return null
    }
  }
}
