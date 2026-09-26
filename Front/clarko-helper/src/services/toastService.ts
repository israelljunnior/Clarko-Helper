export type ToastKind = 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const DISMISS_AFTER_MS = 6000
const MAX_VISIBLE = 3

type Listener = () => void

/**
 * A tiny app-wide store for the toasts shown in the top right corner. Anything can call `error()`;
 * the <Toaster /> component subscribes and renders them.
 */
class ToastService {
  private toasts: Toast[] = []
  private readonly listeners = new Set<Listener>()
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>()
  private nextId = 1

  error(message: string) {
    this.show(message, 'error')
  }

  info(message: string) {
    this.show(message, 'info')
  }

  show(message: string, kind: ToastKind) {
    // The same message again (e.g. every autocomplete request while the API is down) restarts the
    // existing toast's timer instead of stacking copies.
    const existing = this.toasts.find((toast) => toast.message === message && toast.kind === kind)
    if (existing) {
      this.scheduleDismiss(existing.id)
      return
    }

    const toast: Toast = { id: this.nextId++, kind, message }
    const dropped = this.toasts.slice(0, Math.max(0, this.toasts.length - MAX_VISIBLE + 1))
    dropped.forEach((old) => this.clearTimer(old.id))

    this.toasts = [...this.toasts.slice(dropped.length), toast]
    this.scheduleDismiss(toast.id)
    this.emit()
  }

  dismiss(id: number) {
    this.clearTimer(id)
    const next = this.toasts.filter((toast) => toast.id !== id)
    if (next.length === this.toasts.length) return
    this.toasts = next
    this.emit()
  }

  // Arrow functions so React's useSyncExternalStore can take them unbound.
  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.toasts

  private scheduleDismiss(id: number) {
    this.clearTimer(id)
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), DISMISS_AFTER_MS),
    )
  }

  private clearTimer(id: number) {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }
}

export const toastService = new ToastService()
