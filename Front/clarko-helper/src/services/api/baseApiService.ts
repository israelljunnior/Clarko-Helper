import type { InterceptService } from './interceptService'

/**
 * Common ground for services that talk to one area of the Clarko API. Subclasses name their
 * endpoints; every call goes through the shared InterceptService, which handles errors and toasts.
 */
export abstract class BaseApiService {
  protected readonly http: InterceptService
  /** The API base URL plus this service's route prefix, e.g. http://localhost:5294/api/helper. */
  protected readonly baseUrl: string

  protected constructor(http: InterceptService, apiBaseUrl: string, routePrefix: string) {
    this.http = http
    this.baseUrl = `${apiBaseUrl}/${routePrefix.replace(/^\/+|\/+$/g, '')}`
  }

  protected get<TResult>(path: string, signal?: AbortSignal): Promise<TResult> {
    return this.http.send<TResult>({ method: 'GET', url: this.url(path) }, signal)
  }

  protected post<TBody, TResult>(path: string, body: TBody, signal?: AbortSignal): Promise<TResult> {
    return this.http.send<TResult>({ method: 'POST', url: this.url(path), body }, signal)
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`
  }
}
