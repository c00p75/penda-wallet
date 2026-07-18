import { Navigate } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { WalletConfigPanel } from '@/features/wallets/WalletConfigPanel'
import { SettingsContent } from './SettingsPage'

export function ProfilePage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const fullName =
    (session.user.user_metadata?.full_name as string | undefined)?.trim() ||
    session.user.email?.split('@')[0] ||
    'You'
  const initial = fullName[0]?.toUpperCase() ?? 'P'
  const avatarUrl = session.user.user_metadata?.avatar_url as string | undefined

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Profile" subtitle="You and your wallet" />

      <section className="flex flex-col items-center gap-3 text-center">
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
          <h2 className="text-2xl font-bold tracking-tight">{fullName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{wallet.name}</p>
        </div>
      </section>

      <SettingsContent walletPanel={<WalletConfigPanel wallet={wallet} />} />

      <BottomNav />
    </main>
  )
}
