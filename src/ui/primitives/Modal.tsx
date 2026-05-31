import { useEffect } from 'react'
import { cn } from '../utils/cn'

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-lg',
  bodyClassName,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidthClassName?: string
  bodyClassName?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30"
      />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div
          className={cn(
            'flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl',
            maxWidthClassName,
          )}
        >
          <div className="shrink-0 border-b border-slate-200 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
          </div>
          <div className={cn('min-h-0 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
          {footer && <div className="shrink-0 border-t border-slate-200 px-5 py-4">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
