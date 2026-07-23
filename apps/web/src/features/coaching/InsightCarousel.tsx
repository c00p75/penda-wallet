import { useEffect, useRef, useState, type TouchEvent, type WheelEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Lightbulb } from '@/components/icons/product'
import { AiMark, type InsightTone } from '@/components/AiInsight'
import { Button } from '@/components/ui/button'
import { spectrumEdgeClass } from '@/components/ui/cardAccent'
import { PersonaAvatar } from '@/features/profile/PersonaAvatar'
import type { AiPersonality } from '@/features/profile/types'
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
  /**
   * Short title for tip-style cards (e.g. "Pro tip", "Musa").
   * When set, `text` renders as the muted supporting line under it.
   */
  label?: string
  /** Headline when there is no `label`; otherwise the supporting body. */
  text: string
  /** Supporting line under the headline on brief-style cards (no `label`). */
  secondary?: string
  /** Primary CTAs (solid / outline), used by the lead brief card. */
  actions?: InsightCardAction[]
  /** Ghost text action, e.g. "Ask Penda" on tip cards. */
  action?: { label: string; onTap: () => void }
  /** Trust affordance, explain what triggered this nudge. */
  onWhy?: () => void
  /** When set, shows the companion face instead of the tip/AI mark. */
  persona?: { value: AiPersonality; accent: string }
}

function CardMark({
  variant,
  persona,
}: {
  variant: InsightCard['variant']
  persona?: InsightCard['persona']
}) {
  if (persona) {
    return (
      <PersonaAvatar
        value={persona.value}
        accent={persona.accent}
        size={32}
        className="shrink-0"
      />
    )
  }
  if (variant === 'tip') {
    return (
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: 'color-mix(in srgb, var(--apricot) 20%, transparent)' }}
      >
        <Lightbulb className="size-4" weight="duotone" style={{ color: 'var(--iris)' }} />
      </span>
    )
  }
  return <AiMark className="size-8 shrink-0" />
}

function InsightCardView({ card }: { card: InsightCard }) {
  const hasPillActions = (card.actions?.length ?? 0) > 0
  // Tip cards: short label as headline, `text` as muted body (matches the week brief).
  // Brief cards: `text` as headline, optional `secondary` as muted body.
  const title = card.label ? card.label.replace(/\s*:$/, '') : card.text
  const body = card.label ? card.text : card.secondary

  return (
    <div
      className={cn(
        spectrumEdgeClass,
        'rounded-[1.75rem] p-4 shadow-[var(--shadow-card)]',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {card.label ? (
          <>
            {/* Short name/label beside the mark; body uses the full card width. */}
            <div className="flex items-center gap-2.5">
              <CardMark variant={card.variant} persona={card.persona} />
              <p className="min-w-0 text-base font-medium leading-snug text-foreground">{title}</p>
            </div>
            {body && (
              <p className="text-sm leading-snug text-foreground">{body}</p>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2.5">
            <CardMark variant={card.variant} persona={card.persona} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium leading-snug text-foreground">{title}</p>
              {body && (
                <p className="mt-1.5 text-sm leading-snug text-foreground">{body}</p>
              )}
            </div>
          </div>
        )}
        {(hasPillActions || card.action || card.onWhy) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
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

/** How long each card stays up before auto-advancing. */
const ADVANCE_MS = 6000
/** Ignore further edge-wrap triggers for a bit so one swipe doesn't fire twice. */
const WRAP_COOLDOWN_MS = 600
const SWIPE_THRESHOLD_PX = 40

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Swipeable Penda insights: the grounded weekly brief leads, followed by
 * companion signals and pro tips. One card shows at a time with page dots.
 * Auto-advances every few seconds (pausing whenever the user navigates
 * manually) and wraps at both ends, so swiping past the last card lands on
 * the first and swiping back from the first lands on the last.
 */
export function InsightCarousel({ cards }: { cards: InsightCard[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const touchStartXRef = useRef<number | null>(null)
  const wrapCooldownRef = useRef(false)
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

  // Every manual or automatic move restarts this effect, which is what gives
  // manual navigation its "pause" - the next auto-advance is always a full
  // ADVANCE_MS after whatever last changed `active`.
  useEffect(() => {
    if (cards.length <= 1 || prefersReducedMotion()) return
    const id = setInterval(() => {
      goTo(active === cards.length - 1 ? 0 : active + 1)
    }, ADVANCE_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cards.length])

  function triggerWrap(index: number) {
    if (wrapCooldownRef.current) return
    wrapCooldownRef.current = true
    goTo(index)
    setTimeout(() => {
      wrapCooldownRef.current = false
    }, WRAP_COOLDOWN_MS)
  }

  function edgePositions() {
    const el = scrollerRef.current
    if (!el) return { atStart: false, atEnd: false }
    return {
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    }
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    const { atStart, atEnd } = edgePositions()
    if (atEnd && e.deltaX > 0) triggerWrap(0)
    else if (atStart && e.deltaX < 0) triggerWrap(cards.length - 1)
  }

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current
    touchStartXRef.current = null
    if (startX == null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    const delta = startX - endX
    const { atStart, atEnd } = edgePositions()
    if (atEnd && delta > SWIPE_THRESHOLD_PX) triggerWrap(0)
    else if (atStart && delta < -SWIPE_THRESHOLD_PX) triggerWrap(cards.length - 1)
  }

  if (cards.length === 0) return null

  return (
    <section aria-label="Penda insights" className="-mt-8 flex flex-col gap-2">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
