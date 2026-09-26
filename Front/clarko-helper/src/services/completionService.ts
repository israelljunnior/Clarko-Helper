import type { NextWordRequest } from './api/contracts'

export type { NextWordRequest }

/** Next-word autocomplete. HelperApiService implements it against /api/helper/suggestionautocomplete. */
export interface CompletionService {
  /** Up to 3 continuations, most likely first, each ready to insert exactly at the cursor. */
  suggestNextWords(request: NextWordRequest, signal?: AbortSignal): Promise<string[]>
}
