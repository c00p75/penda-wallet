import { cn } from '@/lib/utils'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { useChatStore } from '@/features/chat/chatStore'

export type InsightTone = 'default' | 'warm' | 'attention'

/** Penda brand mark for insight cards — the app icon, not a generic AI glyph. */
export function AiMark({
  thinking = false,
  className,
}: {
  tone?: InsightTone
  thinking?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'block shrink-0 overflow-hidden rounded-2xl shadow-[var(--shadow-soft)] ring-1 ring-border/50',
        thinking && 'animate-pulse',
        className,
      )}
    >
      <img src="/icons/icon-192.png" alt="" className="size-full object-cover" />
    </span>
  )
}

interface AiInsightProps {
  children?: React.ReactNode
  tone?: InsightTone
  /** Show the thinking skeleton instead of content. */
  loading?: boolean
  className?: string
  /**
   * Plain-text insight sentence used when tapping to ask Penda more.
   * When omitted, the card is not tappable.
   */
  askText?: string
}

/**
 * The headline unit for the "AI speaks first" principle: the Penda mark
 * beside a single sentence about the user. Sits at the top of a page.
 * When `askText` is set, tap opens chat with that sentence as the seed.
 */
export function AiInsight({ children, tone = 'default', loading = false, className, askText }: AiInsightProps) {
  const openChat = useChatStore((s) => s.openChat)
  const tappable = !!askText && !loading

  const body = (
    <>
      <AiMark thinking={loading} className="mt-0.5 size-7" />
      {loading ? (
        <div className="flex flex-1 flex-col gap-2 py-1">
          <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded-full bg-muted" />
        </div>
      ) : (
        <p className="text-sm leading-snug">{children}</p>
      )}
    </>
  )

  const sharedClass = cn(
    'flex items-start gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] ring-1 ring-border/50',
    tone === 'warm' && 'bg-[var(--apricot-soft)]/40 ring-[var(--apricot)]/20',
    tone === 'attention' && 'bg-[var(--rose-soft)]/40 ring-[var(--rose)]/20',
    tone === 'default' && 'bg-[var(--iris-soft)]/30',
    tappable && 'cursor-pointer transition-all hover:shadow-[var(--shadow-card)] hover:ring-border/70 active:scale-[0.99]',
    className,
  )

  if (tappable) {
    return (
      <button
        type="button"
        className={sharedClass}
        onClick={(e) => {
          captureOverlayOrigin(e.currentTarget)
          openChat(`${askText} — tell me more / what should I do?`, { autoSend: true })
        }}
        aria-label="Ask Penda about this insight"
      >
        {body}
      </button>
    )
  }

  return <div className={sharedClass}>{body}</div>
}
