// Types mirror OpenRouter's chat completions API (OpenAI-compatible):
// https://openrouter.ai/docs/api-reference/chat-completion

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' }
}

export interface ChatCompletionChoice {
  index: number
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error' | null
  native_finish_reason: string | null
  message: {
    role: 'assistant'
    content: string | null
    refusal: string | null
  }
}

export interface ChatCompletionResponse {
  id: string
  provider: string
  model: string
  object: 'chat.completion'
  created: number
  choices: ChatCompletionChoice[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** Anything that can answer an OpenRouter chat completion: the mock today, the backend proxy later. */
export interface OpenRouterClient {
  createChatCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResponse>
}
