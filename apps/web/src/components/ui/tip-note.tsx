import type { ReactNode } from 'react'
import { Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A plain onboarding/helper note. Deliberately NOT the `AiInsight` "AI speaks
 * first" surface: use this for fixed guidance in empty states where there is no
 * user data to personalize from yet, so canned copy doesn't masquerade as a
 * generated, personalized insight (and doesn't wear the Penda mark).
 */
export function TipNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[1.5rem] bg-muted/40 p-4 text-left ring-1 ring-border/50',
        className,
      )}
    >
      <span
        aria-hidden
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <Lightbulb className="size-4" />
      </span>
      <p className="text-sm leading-snug text-muted-foreground">{children}</p>
    </div>
  )
}
