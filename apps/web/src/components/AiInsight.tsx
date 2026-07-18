import { cn } from '@/lib/utils'
import { useChatStore } from '@/features/chat/chatStore'

export type InsightTone = 'default' | 'warm' | 'attention'

const ORB_GRADIENT: Record<InsightTone, string> = {
  default: 'conic-gradient(from 210deg, var(--iris), var(--hero-glow), var(--apricot), var(--iris))',
  warm: 'conic-gradient(from 200deg, var(--apricot), var(--iris), var(--apricot))',
  attention: 'radial-gradient(circle at 38% 32%, var(--rose), var(--apricot))',
}

export function AiOrb({
  tone = 'default',
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
      className={cn('block shrink-0 rounded-full', thinking && 'penda-orb-spin', className)}
      style={{
        backgroundImage: ORB_GRADIENT[tone],
        boxShadow: '0 0 14px color-mix(in srgb, var(--iris) 45%, transparent)',
      }}
    />
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
 * The headline unit for the "AI speaks first" principle: a living orb beside a
 * single sentence Penda wrote about the user. Sits at the top of a page.
 * When `askText` is set, tap opens chat with that sentence as the seed.
 */
export function AiInsight({ children, tone = 'default', loading = false, className, askText }: AiInsightProps) {
  const openChat = useChatStore((s) => s.openChat)
  const tappable = !!askText && !loading

  const body = (
    <>
      <AiOrb tone={tone} thinking={loading} className="mt-0.5 size-7" />
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
    'flex items-start gap-3 rounded-2xl border bg-background/60 p-3.5 shadow-sm backdrop-blur-md text-left',
    tappable && 'cursor-pointer transition-colors hover:bg-background/80 active:scale-[0.99]',
    className,
  )

  if (tappable) {
    return (
      <button
        type="button"
        className={sharedClass}
        onClick={() => openChat(`${askText} — tell me more / what should I do?`, { autoSend: true })}
        aria-label="Ask Penda about this insight"
      >
        {body}
      </button>
    )
  }

  return <div className={sharedClass}>{body}</div>
}
