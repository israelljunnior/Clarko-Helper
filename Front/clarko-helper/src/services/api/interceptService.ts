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

/** A failed API call, already reported to the author. `status` is 0 when no response arrived. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Every API request passes through here. It adds the JSON headers and a timeout, turns any failure
 * (network, timeout, error status, unreadable body) into one readable message, reports it through
 * `onError`, and throws an ApiError. Requests the editor cancels itself (the author kept typing) are
 * not failures: they are rethrown as they are, without a message.
 */
export class InterceptService {
  private readonly options: InterceptOptions

  constructor(options: InterceptOptions) {
    this.options = options
  }

  async send<TResult>(request: ApiRequest, signal?: AbortSignal): Promise<TResult> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

    let response: Response
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: combined,
      })
    } catch (error) {
      if (signal?.aborted) throw error // cancelled by the editor on purpose
      if (timeout.aborted) throw this.fail('The Clarko API took too long to answer. Try again.', 0)
      throw this.fail(`Couldn't reach the Clarko API at ${new URL(request.url).origin}. Is it running?`, 0)
    }

    if (!response.ok) {
      throw this.fail(await this.readProblem(response), response.status)
    }

    try {
      return (await response.json()) as TResult
    } catch (error) {
      if (signal?.aborted) throw error
      throw this.fail("The Clarko API sent an answer the editor couldn't read.", response.status)
    }
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
}
