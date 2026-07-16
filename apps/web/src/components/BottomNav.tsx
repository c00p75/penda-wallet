import { BarChart3, Home, PiggyBank, Target, Trophy } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/', label: 'Home', icon: Home, isCenter: true },
  { to: '/challenges', label: 'Compete', icon: Trophy },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export function BottomNav() {
  const location = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-[2rem] p-1.5"
        style={{
          background: 'color-mix(in oklch, var(--card) 95%, transparent)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
        }}
      >
        {ITEMS.map(({ to, label, icon: Icon, isCenter }) => {
          const active = location.pathname === to

          if (isCenter) {
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex size-12 -my-1 items-center justify-center rounded-full transition-all shadow-lg',
                  active
                    ? 'bg-primary shadow-primary/40'
                    : 'bg-accent/90 text-accent-foreground hover:bg-accent',
                )}
                style={active ? { boxShadow: '0 0 20px color-mix(in oklch, var(--primary) 60%, transparent)' } : undefined}
              >
                <Icon className={cn('size-5', active ? 'text-primary-foreground' : 'text-accent-foreground/70')} />
              </Link>
            )
          }

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-[1.5rem] py-2 text-[0.65rem] font-medium transition-all',
                active ? 'text-card-foreground' : 'text-card-foreground/40 hover:text-card-foreground/70',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className="size-5 transition-all"
                style={
                  active
                    ? { filter: 'drop-shadow(0 2px 8px color-mix(in oklch, var(--card-foreground) 30%, transparent))' }
                    : undefined
                }
              />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
