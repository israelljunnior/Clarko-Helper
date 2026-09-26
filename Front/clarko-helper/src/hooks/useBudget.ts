import { useEffect, useState } from 'react'
import { budgetApi, type BudgetResponse } from '../services/api'

/** The API caches OpenRouter's numbers and adds each request's cost, so asking often is cheap. */
const REFRESH_MS = 10_000

/**
 * The latest budget from the API, refreshed every few seconds and whenever the tab gets focus again.
 * Stays at the last known value when a refresh fails (the interceptor already shows the error).
 */
export function useBudget() {
  const [budget, setBudget] = useState<BudgetResponse | null>(null)

  useEffect(() => {
    let inFlight: AbortController | null = null

    const refresh = async () => {
      if (inFlight) return // still waiting on the previous one
      const controller = new AbortController()
      inFlight = controller
      try {
        setBudget(await budgetApi.getBudget(controller.signal))
      } catch {
        // Keep showing the last known budget.
      } finally {
        if (inFlight === controller) inFlight = null
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      inFlight?.abort()
    }
  }, [])

  return budget
}
