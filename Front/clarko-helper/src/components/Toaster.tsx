import { useSyncExternalStore } from 'react'
import { toastService } from '../services/toastService'

/** Renders the app's toasts in the top right corner. Mounted once, in App. */
export function Toaster() {
  const toasts = useSyncExternalStore(toastService.subscribe, toastService.getSnapshot)

  return (
    <div className="toaster" aria-live="assertive" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast__icon" aria-hidden="true">
            {toast.kind === 'error' ? '!' : 'i'}
          </span>
          <span className="toast__message">{toast.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss"
            onClick={() => toastService.dismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
