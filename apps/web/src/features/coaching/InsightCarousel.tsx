import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Lightbulb } from '@/components/icons/product'
import { AiMark, type InsightTone } from '@/components/AiInsight'
import { Button } from '@/components/ui/button'
import { spectrumEdgeClass } from '@/components/ui/cardAccent'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { cn } from '@/lib/utils'

export interface InsightCardAction {
  label: string
  variant?: 'default' | 'outline'
  onTap: () => void
}

export interface InsightCard {
  id: string
  /** `read` shows the Penda mark; `tip` shows the pro-tip lightbulb. */
  variant: 'read' | 'tip'
  tone: InsightTone
  /** Bold prefix, e.g. "Pro tip:". */
  label?: string
  text: string
  /** Supporting line under the primary read (brief-style cards). */
  secondary?: string
  /** Primary CTAs (solid / outline), used by the lead brief card. */
  actions?: InsightCardAction[]
  /** Ghost text action, e.g. "Ask Penda" on tip cards. */
  action?: { label: string; onTap: () => void }
  /** Trust affordance, explain what triggered this nudge. */
  onWhy?: () => void
}

function CardMark({ variant }: { variant: InsightCard['variant'] }) {
  if (variant === 'tip') {
    return (
      <span
        aria-hidden
        className="float-left mr-2.5 mt-0.5 flex size-8 items-center justify-center rounded-2xl"
        style={{ background: 'color-mix(in srgb, var(--apricot) 20%, transparent)' }}
      >
        <Lightbulb className="size-4" weight="duotone" style={{ color: 'var(--apricot)' }} />
      </span>
    )
  }
  return <AiMark className="float-left mr-2.5 mt-0.5 size-8" />
}

function InsightCardView({ card }: { card: InsightCard }) {
  const hasPillActions = (card.actions?.length ?? 0) > 0

  return (
    <div
      className={cn(
        spectrumEdgeClass,
        'rounded-[1.75rem] p-4 shadow-[var(--shadow-card)]',
      )}
    >
      <div className="min-w-0">
        <CardMark variant={card.variant} />
        <p className="text-base font-medium leading-snug text-foreground">
          {card.label && <span className="font-semibold">{card.label} </span>}
          {card.text}
        </p>
        {card.secondary && (
          <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{card.secondary}</p>
        )}
        {(hasPillActions || card.action || card.onWhy) && (
          <div className="mt-3 flex clear-both flex-wrap items-center gap-2">
            {card.actions?.map((a) => (
              <Button
                key={a.label}
                type="button"
                size="sm"
                variant={a.variant ?? 'default'}
                onClick={(e) => {
                  captureOverlayOrigin(e.currentTarget)
                  a.onTap()
                }}
              >
                {a.label}
              </Button>
            ))}
            {card.action && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  captureOverlayOrigin(e.currentTarget)
                  card.action!.onTap()
                }}
                className="-ml-1 h-auto px-1 py-0.5 text-primary hover:bg-transparent"
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
                className="h-auto px-1 py-0.5 text-xs text-muted-foreground hover:bg-transparent"
              >
                Why this?
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Swipeable Penda insights: the grounded weekly brief leads, followed by
 * companion signals and pro tips. One card shows at a time with page dots.
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
    <section aria-label="Penda insights" className="-mt-8 flex flex-col gap-2">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card) => (
          <div
            key={card.id}
            className="w-[calc(100%-0.75rem)] min-w-[calc(100%-0.75rem)] shrink-0 snap-center"
          >
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
