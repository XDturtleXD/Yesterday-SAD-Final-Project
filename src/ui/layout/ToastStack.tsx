import { useEffect, useRef } from 'react'
import { useAppState } from '../../state/AppState'
import { useTranslation } from '../../i18n'

const TOAST_AUTO_DISMISS_MS = 5000

export function ToastStack() {
  const { toasts, dismissToast } = useAppState()
  const { t } = useTranslation()
  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.slice(-4).map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
          dismissLabel={t('common.dismiss')}
        />
      ))}
    </div>
  )
}

type ToastItemProps = {
  toast: {
    id: string
    title: string
    message?: string
  }
  onDismiss: (id: string) => void
  dismissLabel: string
}

function ToastItem({ toast, onDismiss, dismissLabel }: ToastItemProps) {
  const dismissRef = useRef(onDismiss)

  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      dismissRef.current(toast.id)
    }, TOAST_AUTO_DISMISS_MS)

    return () => window.clearTimeout(timeoutId)
  }, [toast.id])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900">{toast.title}</div>
          {toast.message && (
            <div className="mt-0.5 truncate text-xs text-slate-500">{toast.message}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="cursor-pointer rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  )
}
