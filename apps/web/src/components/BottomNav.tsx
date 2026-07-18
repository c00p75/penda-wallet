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
      <Link key={to} to={to} aria-label={label} aria-current={active ? 'page' : undefined} className="flex flex-1 justify-center py-2">
        <Icon className={cn('size-6 transition-colors', active ? 'text-primary' : 'text-muted-foreground/60')} />
        <span className="sr-only">{label}</span>
      </Link>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="relative mx-auto max-w-md">
        {/*
          A real notch: the bar is masked with a circle cut into its top-center
          edge, sized a bit larger than the button so it nests inside the cut
          with an even gap all the way around — not a floating halo glued on
          top of a flat edge, which reads as a mismatched arch.
        */}
        <div
          className="flex items-center justify-around gap-1 rounded-t-[1.75rem] px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          style={{
            background: 'var(--card)',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
            borderTop: '1px solid var(--border)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 8px, transparent 40px, #000 40px)',
            maskImage: 'radial-gradient(circle at 50% 8px, transparent 40px, #000 40px)',
          }}
        >
          {LEFT.map(renderTab)}
          <div className="w-20 shrink-0" aria-hidden />
          {RIGHT.map(renderTab)}
        </div>

        {/*
          Traces the notch's cutout circle so the arc reads as bordered,
          matching the bar's own border. Clipped to its bottom half only —
          the top half floats above the bar and should stay borderless.
        */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-8 z-[5] mx-auto size-20 rounded-full"
          style={{ border: '1px solid var(--border)', clipPath: 'inset(40% 0 0 0)' }}
          aria-hidden
        />

        <button
          type="button"
          onClick={() => openChat()}
          aria-label="Ask Penda"
          className="absolute inset-x-0 -top-6 z-10 mx-auto flex size-16 items-center justify-center rounded-full text-primary-foreground transition-transform active:scale-95"
          style={{
            background:
              'linear-gradient(155deg, color-mix(in oklch, var(--primary) 65%, white 35%) 0%, var(--primary) 55%, color-mix(in oklch, var(--primary) 75%, black 25%) 100%)',
          }}
        >
          <Sparkles className="size-6" />
        </button>
      </div>
    </nav>
  )
}
