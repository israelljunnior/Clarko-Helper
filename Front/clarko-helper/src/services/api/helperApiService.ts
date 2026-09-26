import { BaseApiService } from './baseApiService'
import type { InterceptService } from './interceptService'
import type {
  NextWordRequest,
  NextWordResponse,
  SelectionRequest,
  SelectionResponse,
} from './contracts'
import type { CompletionService } from '../completionService'

/** The editor's two AI helpers: /api/helper/suggestionautocomplete and /api/helper/selectionautocomplete. */
export class HelperApiService extends BaseApiService implements CompletionService {
  constructor(http: InterceptService, apiBaseUrl: string) {
    super(http, apiBaseUrl, 'api/helper')
  }

  /** Up to 3 continuations for the line, most likely first, each ready to insert at the cursor. */
  async suggestNextWords(request: NextWordRequest, signal?: AbortSignal): Promise<string[]> {
    const response = await this.post<NextWordRequest, NextWordResponse>('suggestionautocomplete', request, signal)
    return response.suggestions
  }

  /** Rewrites the selected text following the instruction; `revised` is null when nothing should change. */
  refineSelection(request: SelectionRequest, signal?: AbortSignal): Promise<SelectionResponse> {
    return this.post<SelectionRequest, SelectionResponse>('selectionautocomplete', request, signal)
  }
}
