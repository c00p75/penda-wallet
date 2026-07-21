import type { ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChartColumn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { useChatStore } from '@/features/chat/chatStore'
import { AiSparkles } from '@/components/icons/AiSparkles'
import {
  PiggyBankIcon,
  TargetIcon,
  WalletIcon,
  type IconWeight,
} from '@/components/icons/product'

type PhosphorTabIcon = ComponentType<{ className?: string; weight?: IconWeight }>
type LucideTabIcon = ComponentType<{ className?: string; strokeWidth?: number }>

type Tab = {
  to: string
  label: string
  /** Paths that also light this tab (nested plan destinations). */
  match?: string[]
} & ({ icon: PhosphorTabIcon; glyph?: 'phosphor' } | { icon: LucideTabIcon; glyph: 'lucide' })

// Home · Plan · Ask · Insights · Goals. Ask stays the raised center; Compete /
// suite hubs live in the menu so chrome stays companion-first.
const LEFT: Tab[] = [
  { to: '/', label: 'Home', icon: WalletIcon },
  { to: '/budgets', label: 'Plan', icon: PiggyBankIcon, match: ['/budgets', '/cashflow'] },
]
const RIGHT: Tab[] = [
  { to: '/analytics', label: 'Insights', icon: ChartColumn, glyph: 'lucide' },
  { to: '/goals', label: 'Goals', icon: TargetIcon, match: ['/goals'] },
]

export function BottomNav() {
  const location = useLocation()
  const openChat = useChatStore((s) => s.openChat)

  const renderTab = ({ to, label, icon: Icon, glyph = 'phosphor', match }: Tab) => {
    const active =
      location.pathname === to ||
      (match?.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`)) ??
        false)
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
          className="penda-ai-pill absolute inset-x-0 -top-7 z-10 mx-auto flex size-[4.25rem] items-center justify-center rounded-full text-foreground transition-transform active:scale-95"
        >
          <AiSparkles className="size-8" />
        </button>
      </div>
    </nav>
  )
}
