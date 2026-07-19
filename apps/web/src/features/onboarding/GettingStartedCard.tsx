import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GettingStartedStep } from './gettingStarted'

type GettingStartedCardProps = {
  steps: GettingStartedStep[]
  onDismiss: () => void
  onStep: (id: GettingStartedStep['id']) => void
}

/**
 * Day-zero coach card: three concrete next actions so new users aren't
 * dropped into a full dashboard with nothing to do.
 * Plain edge so it doesn't compete with the spectrum insight carousel.
 */
export function GettingStartedCard({ steps, onDismiss, onStep }: GettingStartedCardProps) {
  const doneCount = steps.filter((s) => s.done).length

  return (
    <section className="relative flex flex-col gap-3 rounded-[1.75rem] bg-card p-4 shadow-[var(--shadow-card)] ring-1 ring-border/40">
      <div className="flex items-start justify-between gap-3 pr-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Finish setup
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {doneCount === 0
              ? 'A couple of leftover steps when you have a minute.'
              : `${doneCount} of ${steps.length} done. Keep going.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss getting started"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              disabled={step.done}
              onClick={() => onStep(step.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl bg-card/80 px-3 py-2.5 text-left transition-transform',
                step.done ? 'opacity-70' : 'active:scale-[0.99]',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done
                    ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {step.done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{step.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{step.detail}</span>
              </span>
              {!step.done && (
                <Button type="button" size="sm" variant="ghost" className="shrink-0 px-2 text-primary">
                  Go
                </Button>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
