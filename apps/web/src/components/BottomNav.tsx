import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Clay3DIcon, type ClayGlyphName } from '@/components/Clay'

const ITEMS: { to: string; label: string; icon: ClayGlyphName; accent: string }[] = [
  { to: '/', label: 'Ledger', icon: 'wallet', accent: 'var(--iris)' },
  { to: '/budgets', label: 'Budgets', icon: 'piggybank', accent: '#22a45d' },
  { to: '/goals', label: 'Goals', icon: 'target', accent: '#eaa03c' },
  { to: '/challenges', label: 'Compete', icon: 'trophy', accent: '#e6b422' },
  { to: '/analytics', label: 'Analytics', icon: 'chart', accent: '#5b6ee6' },
]

export function BottomNav() {
  const location = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-stretch justify-around gap-1 rounded-[1.75rem] border border-white/50 bg-background/70 p-1.5 shadow-[0_12px_40px_rgba(43,40,120,0.18)] backdrop-blur-xl dark:border-white/10">
        {ITEMS.map(({ to, label, icon, accent }) => {
          const active = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 rounded-[1.25rem] py-2 text-[0.68rem] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Clay3DIcon
                name={icon}
                accent={active ? accent : 'var(--muted-foreground)'}
                size={active ? 30 : 26}
                dim={!active}
                className={cn('transition-all', active && '-translate-y-0.5')}
              />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
