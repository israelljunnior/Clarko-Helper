import { BaseApiService } from './baseApiService'
import type { InterceptService } from './interceptService'
import type { InsightsRequest, InsightsStreamPiece } from './contracts'
import type { InsightsConversation, InsightsService } from '../insightsService'

/** Clarko's insights conversation: POST /api/chat/insights, answered as server-sent events. */
export class ChatApiService extends BaseApiService implements InsightsService {
  constructor(http: InterceptService, apiBaseUrl: string) {
    super(http, apiBaseUrl, 'api/chat')
  }

  async *stream(paragraph: string, conversation: InsightsConversation, signal?: AbortSignal): AsyncIterable<string> {
    const body: InsightsRequest = { paragraph, context: conversation.context, history: conversation.history }
    for await (const event of this.postStream('insights', body, signal)) {
      const { text } = JSON.parse(event.data) as InsightsStreamPiece
      if (text) yield text
    }
  }
}
