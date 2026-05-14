import { useMemo, useState } from 'react'
import { cn } from '../utils/cn'

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] ?? '')
    .join('')
    .toUpperCase()
}

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string
  src?: string
  size?: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const fallback = useMemo(() => initials(name), [name])
  const showImg = !!src && !broken

  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-full bg-slate-900 text-white ring-1 ring-white/70',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={name}
      title={name}
    >
      {showImg ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs font-semibold">
          {fallback}
        </div>
      )}
    </div>
  )
}
