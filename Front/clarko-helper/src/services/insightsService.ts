/**
 * Clarko's insights: its thoughts about one paragraph, and a conversation about them. Answers stream in
 * piece by piece, so the popup can show Clarko "typing". ChatApiService implements it against the API's
 * POST /api/chat/insights.
 */

export type InsightRole = 'clarko' | 'author'

export interface InsightMessage {
  role: InsightRole
  content: string
}

export interface InsightsConversation {
  /** Earlier text in the document, for tone and topic. */
  context?: string
  /**
   * The conversation so far, oldest first. Empty asks for Clarko's first thoughts; otherwise the last
   * message is the author's, and Clarko answers it.
   */
  history: InsightMessage[]
}

export interface InsightsService {
  /**
   * Clarko's next message about `paragraph`, as text pieces in order.
   * Every message starts "Clarko thinks" or "Clarko feels".
   */
  stream(paragraph: string, conversation: InsightsConversation, signal?: AbortSignal): AsyncIterable<string>
}
