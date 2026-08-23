import { CircleDashedIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ClioContextMeterProps {
  used?: number
  limit?: number
  className?: string
}

export function ClioContextMeter({ used, limit, className }: ClioContextMeterProps) {
  if (used === undefined || limit === undefined || limit <= 0) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <CircleDashedIcon aria-hidden="true" className="size-3.5" />
        <span>Context unavailable</span>
      </div>
    )
  }
  const percentage = Math.min(100, Math.max(0, (used / limit) * 100))
  return (
    <div className={cn('grid min-w-40 gap-1.5', className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium">Context</span>
        <span className="font-mono text-muted-foreground">{Math.round(percentage)}%</span>
      </div>
      <div
        aria-label={`${Math.round(percentage)} percent of context used`}
        aria-valuemax={limit}
        aria-valuemin={0}
        aria-valuenow={used}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}
