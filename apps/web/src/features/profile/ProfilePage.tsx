import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { BarChart3, Bell, LogOut, Settings as SettingsIcon, Trophy } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { AnalyticsContent } from '@/features/analytics/AnalyticsPage'
import { ChallengesContent } from '@/features/challenges/ChallengesPage'
import { SettingsContent } from './SettingsPage'
import { supabase } from '@/lib/supabase/client'

const TABS = [
  { value: 'analytics', label: 'Analytics', icon: BarChart3 },
  { value: 'compete', label: 'Compete', icon: Trophy },
  { value: 'settings', label: 'Settings', icon: SettingsIcon },
] as const

export function ProfilePage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('analytics')

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const fullName =
    (session.user.user_metadata?.full_name as string | undefined)?.trim() ||
    session.user.email?.split('@')[0] ||
    'You'
  const initial = fullName[0]?.toUpperCase() ?? 'P'
  const avatarUrl = session.user.user_metadata?.avatar_url as string | undefined

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />

      <section className="flex flex-col items-center gap-3 pt-2 text-center">
        <div
          className="relative grid size-24 place-items-center overflow-hidden rounded-full text-2xl font-bold text-[var(--iris)] shadow-[var(--shadow-card)] ring-4 ring-[var(--iris-soft)]"
          style={{ background: 'var(--iris-soft)' }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{wallet.name}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Link
            to="/challenges"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-2 text-xs font-semibold shadow-[var(--shadow-soft)]"
          >
            <Trophy className="size-3.5 text-[var(--apricot)]" />
            Compete
          </Link>
          <Link
            to="/activity"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-2 text-xs font-semibold shadow-[var(--shadow-soft)]"
          >
            <Bell className="size-3.5 text-[var(--iris)]" />
            Activity
          </Link>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-2 text-xs font-semibold shadow-[var(--shadow-soft)]"
          >
            <LogOut className="size-3.5 text-[var(--rose)]" />
            Sign out
          </button>
        </div>
      </section>

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        {TABS.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5 rounded-full">
            <Icon className="size-4" />
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {tab === 'analytics' && <AnalyticsContent />}
      {tab === 'compete' && <ChallengesContent />}
      {tab === 'settings' && <SettingsContent />}

      <BottomNav />
    </main>
  )
}
