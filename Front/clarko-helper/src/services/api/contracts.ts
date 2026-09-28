// Request and response bodies of the Clarko API, mirroring API/Clarko-API/Clarko-API/HelperContracts.cs.
// The API serializes JSON in camelCase.

/** POST /api/helper/suggestionautocomplete */
export interface NextWordRequest {
  /** The line up to the cursor, untrimmed: a trailing space means a new word starts. */
  line: string
  /** Earlier text in the document, for tone and topic. */
  context?: string
}

export interface NextWordResponse {
  suggestions: string[]
}

/** POST /api/helper/selectionautocomplete */
export interface SelectionRequest {
  selectedText: string
  instruction: string
  /** The paragraph around the selection, for tone and meaning only. */
  context?: string
  /** Earlier turns for the same selection, oldest first, so refinements build on each other. */
  history?: RefinementTurn[]
}

export interface RefinementTurn {
  instruction: string
  revised: string | null
}

export interface SelectionResponse {
  /** Null when the model thinks no change is needed. */
  revised: string | null
  reason: string
}

/** POST /api/helper/search */
export interface SearchRequest {
  /** What to find: exact text, or an idea when no exact match exists. Up to 300 characters. */
  query: string
  /** The document, one entry per top-level paragraph or heading, in order. */
  paragraphs: string[]
}

export interface SearchResponse {
  /** "exact": the text itself, found without the model. "related": passages the model judged related. */
  kind: 'exact' | 'related' | 'none'
  matches: SearchMatch[]
}

/** `start` and `length` are character offsets into paragraph `paragraph`; `text` is that slice of it. */
export interface SearchMatch {
  paragraph: number
  start: number
  length: number
  text: string
  /** Why a related passage matches (related results only). */
  reason?: string | null
}

/** GET /api/budget: the app's AI spend against its cap, in USD. */
export interface BudgetResponse {
  spentUsd: number
  limitUsd: number
  remainingUsd: number
  /** True once suggestions are paused because too little budget is left. */
  exhausted: boolean
}

/** POST /api/chat/insights, answered with server-sent events. */
export interface InsightsRequest {
  /** The paragraph the conversation is about. */
  paragraph: string
  context?: string
  /** Oldest first; empty for Clarko's first thoughts, otherwise ends with the author's question. */
  history: { role: 'author' | 'clarko'; content: string }[]
}

/** The data of each streamed event: the next piece of Clarko's message. */
export interface InsightsStreamPiece {
  text: string
}

/** RFC 9457 problem details, which the API returns for every error. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  /** Present on validation problems: field name → messages. */
  errors?: Record<string, string[]>
}
