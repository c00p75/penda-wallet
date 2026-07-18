import { BarChart3, PiggyBank, Sparkles, Target, Wallet } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/features/chat/chatStore'

// Two tabs sit on each side of the raised AI button. Profile lives in the
// header avatar; Analytics is a first-class destination here.
const LEFT = [
  { to: '/', label: 'Ledger', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
]
const RIGHT = [
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

/**
 * Solid dock with an upward center hump — filled SVG material that cradles
 * the AI button. Not a punched cutout / mask.
 *
 * viewBox 375×80 (rough phone width units). Flat top at y=28, arch peaks at y=6.
 */
function DockShape() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox="0 0 375 80"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="
          M0 28
          H118
          C138 28 148 6 187.5 6
          C227 6 237 28 257 28
          H375
          V80
          H0
          Z
        "
      />
    </svg>
  )
}

export function BottomNav() {
  const location = useLocation()
  const openChat = useChatStore((s) => s.openChat)

  const renderTab = ({ to, label, icon: Icon }: (typeof LEFT)[number]) => {
    const active = location.pathname === to
    return (
      <Link
        key={to}
        to={to}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className="relative z-10 flex flex-1 items-center justify-center transition-transform active:scale-95"
      >
        <Icon
          className={cn(
            'size-6 transition-opacity',
            active ? 'text-white opacity-100' : 'text-white/55',
          )}
          strokeWidth={active ? 2.35 : 2}
        />
        <span className="sr-only">{label}</span>
      </Link>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="relative mx-auto max-w-md">
        <div
          className="relative text-[#141414] dark:text-[#0a0a0a]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Flat icon row sits on the lower band of the dock */}
          <div className="relative h-[4.5rem]">
            <DockShape />
            <div className="absolute inset-x-0 bottom-0 flex h-[3.25rem] items-center px-1">
              {LEFT.map(renderTab)}
              <div className="w-[4.75rem] shrink-0" aria-hidden />
              {RIGHT.map(renderTab)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openChat()}
          aria-label="Ask Penda"
          className="absolute inset-x-0 top-0 z-10 mx-auto flex size-16 -translate-y-[30%] items-center justify-center rounded-full text-white transition-transform active:scale-95"
          style={{
            background:
              'linear-gradient(155deg, color-mix(in oklch, var(--primary) 45%, white 55%) 0%, var(--primary) 48%, color-mix(in oklch, var(--primary) 72%, black 28%) 100%)',
            boxShadow: 'var(--shadow-hero)',
          }}
        >
          <Sparkles className="size-6" />
        </button>
      </div>
    </nav>
  )
}
