import type { ProblemDetails } from './contracts'

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
}

export interface InterceptOptions {
  timeoutMs: number
  /** Called with a readable message whenever a request fails. The app shows it as a toast. */
  onError: (message: string) => void
}

/** One server-sent event from a streaming endpoint. `event` is "message" unless the server named it. */
export interface ServerSentEvent {
  event: string
  data: string
}

/** A failed API call, already reported to the author. `status` is 0 when no response arrived. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Splits a server-sent event block ("event: x\ndata: {...}") into its name and data. */
function parseEvent(block: string): ServerSentEvent | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  return data.length ? { event, data: data.join('\n') } : null
}

/**
 * Every API request passes through here. It adds the JSON headers and a timeout, turns any failure
 * (network, timeout, error status, unreadable body, an error event mid-stream) into one readable message,
 * reports it through `onError`, and throws an ApiError. Requests the editor cancels itself (the author
 * kept typing, closed a popup) are not failures: they are rethrown as they are, without a message.
 */
export class InterceptService {
  private readonly options: InterceptOptions

  constructor(options: InterceptOptions) {
    this.options = options
  }

  /** A JSON request and its JSON answer. */
  async send<TResult>(request: ApiRequest, signal?: AbortSignal): Promise<TResult> {
    const { response, done } = await this.open(request, 'application/json', signal)
    try {
      return (await response.json()) as TResult
    } catch (error) {
      if (signal?.aborted) throw error
      throw this.fail("The Clarko API sent an answer the editor couldn't read.", response.status)
    } finally {
      done()
    }
  }

  /**
   * A request answered with server-sent events, yielded as they arrive. The stream ends at the server's
   * `done` event; an `error` event is reported and thrown like any other failure. The timeout only covers
   * waiting for the answer to start, so a long answer isn't cut off halfway.
   */
  async *stream(request: ApiRequest, signal?: AbortSignal): AsyncGenerator<ServerSentEvent> {
    const { response, done } = await this.open(request, 'text/event-stream', signal)
    done()
    if (!response.body) throw this.fail("The Clarko API sent an answer the editor couldn't read.", response.status)

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    try {
      while (true) {
        const { value, done: finished } = await reader.read()
        if (finished) return
        buffer += value

        // Events are separated by a blank line; keep any incomplete one for the next read.
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const event = parseEvent(block)
          if (!event) continue
          if (event.event === 'done') return
          if (event.event === 'error') throw this.fail(this.readStreamError(event.data), response.status)
          yield event
        }
      }
    } catch (error) {
      if (signal?.aborted || error instanceof ApiError) throw error
      throw this.fail('The connection to the Clarko API dropped partway through the answer. Try again.', 0)
    } finally {
      void reader.cancel().catch(() => {})
    }
  }

  /**
   * Sends the request and checks the status. `done()` stops the timeout; `send` calls it once the body is
   * read, `stream` as soon as the answer starts.
   */
  private async open(request: ApiRequest, accept: string, signal?: AbortSignal) {
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), this.options.timeoutMs)
    const done = () => clearTimeout(timer)
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal

    let response: Response
    try {
      const hasBody = request.body !== undefined
      response = await fetch(request.url, {
        method: request.method,
        // Content-Type only with a body: a bare GET then needs no CORS preflight.
        headers: hasBody ? { Accept: accept, 'Content-Type': 'application/json' } : { Accept: accept },
        body: hasBody ? JSON.stringify(request.body) : undefined,
        signal: combined,
      })
    } catch (error) {
      done()
      if (signal?.aborted) throw error // cancelled by the editor on purpose
      if (timeout.signal.aborted) throw this.fail('The Clarko API took too long to answer. Try again.', 0)
      throw this.fail(`Couldn't reach the Clarko API at ${new URL(request.url).origin}. Is it running?`, 0)
    }

    if (!response.ok) {
      done()
      throw this.fail(await this.readProblem(response), response.status)
    }

    return { response, done }
  }

  private fail(message: string, status: number): ApiError {
    this.options.onError(message)
    return new ApiError(message, status)
  }

  /** The most useful line from the API's problem details, or a fallback by status code. */
  private async readProblem(response: Response): Promise<string> {
    try {
      const problem = (await response.json()) as ProblemDetails
      const firstValidationError = Object.values(problem.errors ?? {}).flat()[0]
      const message = firstValidationError ?? problem.detail ?? problem.title
      if (message) return message
    } catch {
      // No JSON body; fall through to the status-based message.
    }
    return response.status >= 500
      ? `The Clarko API had a problem (${response.status}). Try again.`
      : `The Clarko API rejected the request (${response.status}).`
  }

  private readStreamError(data: string): string {
    try {
      const { message } = JSON.parse(data) as { message?: unknown }
      if (typeof message === 'string' && message) return message
    } catch {
      // Not JSON; use the generic message.
    }
    return 'The Clarko API stopped partway through the answer. Try again.'
  }
}
