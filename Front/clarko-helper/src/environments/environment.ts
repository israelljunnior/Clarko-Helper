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

/**
 * Default settings: the API's `http` launch profile (API/Clarko-API/Clarko-API/Properties/launchSettings.json).
 * Set VITE_API_BASE_URL (for example in a `.env.local` file) to point the editor at another API.
 */
export const environment: Environment = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5294').replace(/\/+$/, ''),
  requestTimeoutMs: 35_000,
}
