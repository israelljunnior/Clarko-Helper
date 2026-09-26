import { useSyncExternalStore } from 'react'
import { budgetApi, type BudgetResponse } from '../services/api'

/** Pause between the end of one budget call and the start of the next. */
const REFRESH_MS = 10_000

type Listener = () => void

/**
 * One polling loop for the whole app, however many components read the budget. A call starts only
 * after the previous one has finished (answered or failed), and the next is scheduled REFRESH_MS
 * after that, so a slow API never gets overlapping or back-to-back requests.
 */
class BudgetStore {
  private budget: BudgetResponse | null = null
  private readonly listeners = new Set<Listener>()
  private inFlight: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopTimer: ReturnType<typeof setTimeout> | undefined

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    clearTimeout(this.stopTimer) // re-subscribed before a scheduled stop, e.g. StrictMode's remount
    if (this.listeners.size === 1 && !this.inFlight && this.timer === undefined) this.start()

    return () => {
      this.listeners.delete(listener)
      // Stop a tick later, so an immediate re-subscribe (StrictMode, fast remounts) keeps the same loop.
      if (this.listeners.size === 0) this.stopTimer = setTimeout(() => this.stop())
    }
  }

  getSnapshot = () => this.budget

  private start() {
    document.addEventListener('visibilitychange', this.onVisible)
    void this.refresh()
  }

  private stop() {
    if (this.listeners.size > 0) return
    document.removeEventListener('visibilitychange', this.onVisible)
    clearTimeout(this.timer)
    this.timer = undefined
    this.inFlight?.abort()
    this.inFlight = null
  }

  /** Back on the tab: refresh now instead of waiting, unless a call is already on its way. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.inFlight) return
    clearTimeout(this.timer)
    void this.refresh()
  }

  private async refresh() {
    this.timer = undefined
    const controller = new AbortController()
    this.inFlight = controller
    try {
      this.budget = await budgetApi.getBudget(controller.signal)
      this.listeners.forEach((listener) => listener())
    } catch {
      // Keep showing the last known budget; the interceptor already reported the error.
    } finally {
      if (this.inFlight === controller) this.inFlight = null
    }

    // Schedule the next call only now that this one is done, and only while someone is listening.
    if (!controller.signal.aborted && this.listeners.size > 0) {
      this.timer = setTimeout(() => void this.refresh(), REFRESH_MS)
    }
  }
}

const budgetStore = new BudgetStore()

/** The latest AI budget from the API, shared by every component that shows it. */
export function useBudget() {
  return useSyncExternalStore(budgetStore.subscribe, budgetStore.getSnapshot)
}
