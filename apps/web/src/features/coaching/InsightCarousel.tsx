import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Lightbulb } from '@/components/icons/product'
import { AiMark, type InsightTone } from '@/components/AiInsight'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface InsightCard {
  id: string
  /** `read` shows the Penda mark; `tip` shows the pro-tip lightbulb. */
  variant: 'read' | 'tip'
  tone: InsightTone
  /** Bold prefix, e.g. "Pro tip:". */
  label?: string
  text: string
  action?: { label: string; onTap: () => void }
  /** Trust affordance, explain what triggered this nudge. */
  onWhy?: () => void
}

function InsightCardView({ card }: { card: InsightCard }) {
  return (
    <div className="flex h-full items-start gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)]">
      {card.variant === 'tip' ? (
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: 'color-mix(in srgb, var(--apricot) 20%, transparent)' }}
        >
          <Lightbulb className="size-4" weight="duotone" style={{ color: 'var(--apricot)' }} />
        </span>
      ) : (
        <AiMark className="mt-0.5 size-7" />
      )}
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-sm leading-snug">
          {card.label && <span className="font-semibold">{card.label} </span>}
          {card.text}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {card.action && (
            <Button
              variant="ghost"
              size="sm"
              onClick={card.action.onTap}
              className="-mb-1 self-start px-0 text-primary hover:bg-transparent"
            >
              {card.action.label}
              <ArrowRight className="size-4" />
            </Button>
          )}
          {card.onWhy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={card.onWhy}
              className="-mb-1 self-start px-0 text-xs text-muted-foreground hover:bg-transparent"
            >
              Why this?
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The "AI speaks first" headline unit, upgraded to a swipeable deck: the grounded
 * weekly read leads, followed by proactive pro tips. One card shows at a time with
 * page dots; when there's only one card it reads exactly like the old single unit.
 */
export function InsightCarousel({ cards }: { cards: InsightCard[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  function handleScroll() {
    const el = scrollerRef.current
    if (!el) return
    setActive(Math.round(el.scrollLeft / el.clientWidth))
  }

  function goTo(index: number) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  if (cards.length === 0) return null

  return (
    <section aria-label="Penda insights" className="flex flex-col gap-2">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-[0.5rem]"
      >
        {cards.map((card) => (
          <div key={card.id} className="w-full shrink-0 snap-center">
            <InsightCardView card={card} />
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="flex justify-center gap-1.5" role="tablist" aria-label="Insight pages">
          {cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Show insight ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === active ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}
