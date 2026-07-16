import { BarChart3, PiggyBank, Target, Trophy, Wallet } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/', label: 'Ledger', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/challenges', label: 'Compete', icon: Trophy },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export function BottomNav() {
  const location = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-stretch justify-around gap-1 rounded-[1.75rem] border border-white/50 bg-background/70 p-1.5 shadow-[0_12px_40px_rgba(43,40,120,0.18)] backdrop-blur-xl dark:border-white/10">
        {ITEMS.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-[1.25rem] py-2 text-[0.68rem] font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'size-5 transition-transform',
                  active && 'drop-shadow-[0_2px_6px_color-mix(in_srgb,var(--primary)_45%,transparent)]',
                )}
              />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
