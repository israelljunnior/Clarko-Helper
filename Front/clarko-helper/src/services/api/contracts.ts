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

/** RFC 9457 problem details, which the API returns for every error. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  /** Present on validation problems: field name → messages. */
  errors?: Record<string, string[]>
}
