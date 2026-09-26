import { environment } from '../../environments/environment'
import { toastService } from '../toastService'
import { HelperApiService } from './helperApiService'
import { InterceptService } from './interceptService'

/** One interceptor for the whole app, so every request reports its errors the same way. */
const http = new InterceptService({
  timeoutMs: environment.requestTimeoutMs,
  onError: (message) => toastService.error(message),
})

export const helperApi = new HelperApiService(http, environment.apiBaseUrl)

export { ApiError } from './interceptService'
export type * from './contracts'
