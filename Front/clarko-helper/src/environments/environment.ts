/** Settings the app needs to talk to the outside world. */
export interface Environment {
  /** Where the Clarko API runs, without a trailing slash. */
  apiBaseUrl: string
  /**
   * How long to wait for the API before giving up. A bit longer than the API's own 30 s limit for the
   * model, so the API gets the chance to answer with a clear "took too long" message first.
   */
  requestTimeoutMs: number
}


export const environment: Environment = {
  apiBaseUrl: ('http://localhost:5294').replace(/\/+$/, ''),
  requestTimeoutMs: 35_000,
}
