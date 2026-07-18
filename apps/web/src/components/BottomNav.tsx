import type { ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChartColumn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { useChatStore } from '@/features/chat/chatStore'
import {
  ChatCircleIcon,
  PiggyBankIcon,
  SparkleIcon,
  TargetIcon,
  WalletIcon,
  type IconWeight,
} from '@/components/icons/product'

type PhosphorTabIcon = ComponentType<{ className?: string; weight?: IconWeight }>
type LucideTabIcon = ComponentType<{ className?: string; strokeWidth?: number }>

type Tab = {
  to: string
  label: string
} & ({ icon: PhosphorTabIcon; glyph?: 'phosphor' } | { icon: LucideTabIcon; glyph: 'lucide' })

// Two tabs sit on each side of the raised AI button. Profile lives in the
// AppHeader avatar on primary tabs, so the corner tab is Analytics.
const LEFT: Tab[] = [
  { to: '/', label: 'Home', icon: WalletIcon },
  { to: '/budgets', label: 'Budgets', icon: PiggyBankIcon },
]
const RIGHT: Tab[] = [
  { to: '/goals', label: 'Goals', icon: TargetIcon },
  { to: '/analytics', label: 'Analytics', icon: ChartColumn, glyph: 'lucide' },
]

export function BottomNav() {
  const location = useLocation()
  const openChat = useChatStore((s) => s.openChat)

  const renderTab = ({ to, label, icon: Icon, glyph = 'phosphor' }: Tab) => {
    const active = location.pathname === to
    return (
      <Link
        key={to}
        to={to}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-transform active:scale-95"
      >
        {active && (
          <span
            className="absolute top-0.5 size-1.5 rounded-full motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
            style={{ background: 'var(--apricot)' }}
            aria-hidden
          />
        )}
        {glyph === 'lucide' ? (
          <Icon
            className={cn(
              'size-[1.35rem] -scale-x-100 transition-colors',
              active ? 'text-primary' : 'text-muted-foreground/55',
            )}
            strokeWidth={active ? 2.4 : 1.75}
          />
        ) : (
          <Icon
            className={cn(
              'size-[1.35rem] transition-colors',
              active ? 'text-primary' : 'text-muted-foreground/55',
            )}
            weight={active ? 'fill' : 'duotone'}
          />
        )}
        <span
          className={cn(
            'text-[10px] font-medium leading-none tracking-wide',
            active ? 'text-primary' : 'text-muted-foreground/60',
          )}
        >
          {label}
        </span>
      </Link>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="relative mx-auto max-w-md">
        <div
          className="flex items-center justify-around gap-1 rounded-t-[1.75rem] px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          style={{
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
            borderTop: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
          }}
        >
          {LEFT.map(renderTab)}
          <div className="w-20 shrink-0" aria-hidden />
          {RIGHT.map(renderTab)}
        </div>

        <button
          type="button"
          onClick={(e) => {
            captureOverlayOrigin(e.currentTarget)
            openChat()
          }}
          aria-label="Ask Penda"
          className="absolute inset-x-0 -top-7 z-10 mx-auto flex size-[4.25rem] items-center justify-center rounded-full text-white transition-transform active:scale-95"
          style={{
            background:
              'linear-gradient(155deg, color-mix(in oklch, var(--primary) 55%, white 45%) 0%, var(--primary) 50%, color-mix(in oklch, var(--primary) 70%, black 30%) 100%)',
            boxShadow: 'var(--shadow-hero)',
          }}
        >
          {/* Twinkling sparkles mark this as AI; chat icon stays the primary glyph */}
          <SparkleIcon
            className="penda-sparkle absolute right-2.5 top-2 size-2.5 text-white/90"
            weight="fill"
            style={{ ['--twinkle-dur' as string]: '2.8s', ['--twinkle-delay' as string]: '0s' }}
          />
          <SparkleIcon
            className="penda-sparkle absolute bottom-3 left-2.5 size-2 text-white/80"
            weight="fill"
            style={{ ['--twinkle-dur' as string]: '3.4s', ['--twinkle-delay' as string]: '0.9s' }}
          />
          <ChatCircleIcon className="size-7" weight="fill" />
        </button>
      </div>
    </nav>
  )
}
