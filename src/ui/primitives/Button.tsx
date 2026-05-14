import { cn } from '../utils/cn'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600',
        size === 'sm' ? 'h-9 px-3 sm:h-8' : 'h-11 px-4 sm:h-9 sm:px-3.5',
        variant === 'primary' &&
          'border-slate-900 bg-slate-900 text-white hover:border-slate-800 hover:bg-slate-800 active:bg-slate-950',
        variant === 'secondary' &&
          'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-950',
        variant === 'danger' &&
          'border-rose-600 bg-rose-600 text-white hover:border-rose-500 hover:bg-rose-500 active:bg-rose-700',
        className,
      )}
    />
  )
}
