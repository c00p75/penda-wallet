import { PiggyBank, Sparkles, Target, User, Wallet } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/features/chat/chatStore'

// Two tabs sit on each side of the raised AI button. Profile opens a
// tab-switcher (Analytics, Compete, Settings) rather than a single page.
const LEFT = [
  { to: '/', label: 'Ledger', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
]
const RIGHT = [
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/profile', label: 'Profile', icon: User },
]

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
        className="relative flex flex-1 justify-center py-2.5 transition-transform active:scale-95"
      >
        {active && (
          <span
            className="absolute top-0.5 size-1.5 rounded-full motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
            style={{ background: 'var(--apricot)' }}
            aria-hidden
          />
        )}
        <Icon
          className={cn(
            'size-6 transition-colors',
            active ? 'text-primary' : 'text-muted-foreground/55',
          )}
        />
        <span className="sr-only">{label}</span>
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
          onClick={() => openChat()}
          aria-label="Ask Penda"
          className="absolute inset-x-0 -top-7 z-10 mx-auto flex size-[4.25rem] items-center justify-center rounded-full text-primary-foreground transition-transform active:scale-95"
          style={{
            background:
              'linear-gradient(155deg, color-mix(in oklch, var(--primary) 55%, white 45%) 0%, var(--primary) 50%, color-mix(in oklch, var(--primary) 70%, black 30%) 100%)',
            boxShadow: 'var(--shadow-hero)',
          }}
        >
          <Sparkles className="size-6" />
        </button>
      </div>
    </nav>
  )
}
