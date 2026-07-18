import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BarChart3, Settings as SettingsIcon, Trophy } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { AnalyticsContent } from '@/features/analytics/AnalyticsPage'
import { ChallengesContent } from '@/features/challenges/ChallengesPage'
import { SettingsContent } from './SettingsPage'

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

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 bg-background p-4 pb-24">
      <AppHeader />

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        {TABS.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5">
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
