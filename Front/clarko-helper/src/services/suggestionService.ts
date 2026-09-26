import type { HelperApiService } from './api/helperApiService'

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

/**
 * Turns the popup's edit session into a call to the API's selection endpoint. The API owns the
 * prompts and the model; this only maps the session's steps onto the request and the answer back.
 */
export class SuggestionService {
  private readonly api: HelperApiService

  constructor(api: HelperApiService) {
    this.api = api
  }

  async suggestForSelection(request: SelectionEditRequest, signal?: AbortSignal): Promise<TextSuggestion | null> {
    const instruction = request.steps.at(-1)
    if (!instruction) return null

    // Earlier steps become the history, so "shorter" then "more formal" build on each other.
    const history = request.steps.slice(0, -1).map((step, i) => ({
      instruction: step,
      revised: request.previousVersions[i] ?? null,
    }))

    const response = await this.api.refineSelection(
      { selectedText: request.selectedText, instruction, context: request.context, history },
      signal,
    )

    const revised = response.revised
    if (!revised || revised.trim() === request.selectedText.trim()) return null
    return { revised, reason: response.reason || 'Suggested edit' }
  }
}
