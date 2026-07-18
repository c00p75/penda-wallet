import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type DateChipOption = {
  value: string
  label: ReactNode
  sublabel?: ReactNode
  icon?: ReactNode
}

type DateChipProps = {
  options: DateChipOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * Horizontal filter-pill / date-chip row. Active pill fills with iris.
 */
export function DateChip({ options, value, onChange, className }: DateChipProps) {
  return (
    <div
      className={cn(
        '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-4 transition-colors',
              opt.sublabel ? 'min-h-[3.75rem] min-w-[3.25rem] py-2.5' : 'h-10',
              active
                ? 'bg-primary text-primary-foreground shadow-[var(--shadow-soft)]'
                : 'border border-border/70 bg-card text-muted-foreground',
            )}
          >
            {active && opt.icon && (
              <span className="absolute -top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[var(--apricot)] text-white">
                {opt.icon}
              </span>
            )}
            <span className={cn('text-sm font-semibold', active && 'text-primary-foreground')}>
              {opt.label}
            </span>
            {opt.sublabel != null && (
              <span
                className={cn(
                  'text-[11px] font-medium',
                  active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {opt.sublabel}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
