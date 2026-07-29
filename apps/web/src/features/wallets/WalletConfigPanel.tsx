import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CurrencyCombobox } from '@/components/CurrencyCombobox'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import { PaywallSheet } from '@/features/entitlements/PaywallSheet'
import {
  defaultAccountId,
  useAccounts,
  useArchiveAccount,
  useCreateAccount,
  useUpdateAccount,
} from '@/features/accounts/hooks'
import { AccountForm } from '@/features/accounts/AccountForm'
import { PocketProviderManager, PocketTypeManager } from '@/features/accounts/PocketAttributeManager'
import type { Account, AccountInput } from '@/features/accounts/types'
import {
  useCreateWallet,
  useInviteWalletMember,
  useRemoveWalletMember,
  useUpdateWallet,
  useWalletMembers,
  useWallets,
} from './hooks'
import type { Wallet, WalletRole } from './types'

const PREMIUM_REQUIRED_PREFIX = 'PREMIUM_REQUIRED:'

interface WalletConfigPanelProps {
  wallet: Wallet
}

export function WalletConfigPanel({ wallet }: WalletConfigPanelProps) {
  const session = useAuthStore((s) => s.session)
  const { data: wallets = [] } = useWallets()
  const setCurrentWalletId = useWalletStore((s) => s.setCurrentWalletId)
  const { data: members = [] } = useWalletMembers(wallet.id)
  const { data: accounts = [] } = useAccounts(wallet.id)
  const inviteMember = useInviteWalletMember(wallet.id)
  const removeMember = useRemoveWalletMember(wallet.id)
  const createWallet = useCreateWallet()
  const updateWallet = useUpdateWallet()
  const createAccount = useCreateAccount(wallet.id)
  const updateAccount = useUpdateAccount(wallet.id)
  const archiveAccount = useArchiveAccount(wallet.id)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WalletRole>('editor')
  const [newWalletName, setNewWalletName] = useState('')
  const [newWalletCurrency, setNewWalletCurrency] = useState('USD')
  const [showSharedWalletsPaywall, setShowSharedWalletsPaywall] = useState(false)
  const [settingsName, setSettingsName] = useState(wallet.name)
  const [settingsCurrency, setSettingsCurrency] = useState(wallet.base_currency)
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)

  const myRole = members.find((m) => m.user_id === session?.user.id)?.role
  const isOwner = myRole === 'owner'

  useEffect(() => {
    setSettingsName(wallet.name)
    setSettingsCurrency(wallet.base_currency)
  }, [wallet])

  const walletSettingsDirty =
    settingsName.trim() !== wallet.name || settingsCurrency !== wallet.base_currency

  async function handleSaveWalletSettings() {
    if (!settingsName.trim()) return
    try {
      await updateWallet.mutateAsync({
        id: wallet.id,
        name: settingsName.trim(),
        baseCurrency: settingsCurrency,
      })
      toast('Money account updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    try {
      await inviteMember.mutateAsync({ email: inviteEmail.trim(), role: inviteRole })
      toast(`Invited ${inviteEmail.trim()}.`)
      setInviteEmail('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not invite that email.'
      if (message.startsWith(PREMIUM_REQUIRED_PREFIX)) {
        setShowSharedWalletsPaywall(true)
      } else {
        toast.error(message)
      }
    }
  }

  async function handleRemove(userId: string) {
    try {
      await removeMember.mutateAsync(userId)
      toast('Member removed.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleLeave() {
    if (!session) return
    try {
      await removeMember.mutateAsync(session.user.id)
      toast('You left the money account.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleCreateWallet(e: React.FormEvent) {
    e.preventDefault()
    if (!newWalletName.trim()) return
    try {
      const created = await createWallet.mutateAsync({
        name: newWalletName.trim(),
        baseCurrency: newWalletCurrency,
      })
      setCurrentWalletId(created.id)
      setNewWalletName('')
      setNewWalletCurrency('USD')
      toast(`Created "${created.name}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create money account.')
    }
  }

  async function handleAccountSubmit(input: AccountInput) {
    try {
      if (editingAccount) {
        await updateAccount.mutateAsync({ id: editingAccount.id, input })
        toast('Pocket updated.')
      } else {
        await createAccount.mutateAsync(input)
        toast('Pocket added.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
      throw error
    }
  }

  return (
    <>
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wallet-switch">Current money account</Label>
          <Select value={wallet.id} onValueChange={setCurrentWalletId}>
            <SelectTrigger id="wallet-switch" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {wallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Tip: switch money accounts from the top-left of Home too.
          </p>
        </div>

        {isOwner && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-secondary/40 p-4 shadow-[var(--shadow-soft)]">
            <Label>Money account settings</Label>
            <Input
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              placeholder="Personal, Family…"
            />
            <CurrencyCombobox value={settingsCurrency} onChange={setSettingsCurrency} />
            {walletSettingsDirty && (
              <>
                <p className="text-xs text-muted-foreground">
                  Changing currency only affects how amounts are labeled going forward, it
                  won&apos;t convert past entries.
                </p>
                <Button size="sm" onClick={handleSaveWalletSettings} disabled={updateWallet.isPending}>
                  Save
                </Button>
              </>
            )}
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Pockets in this account</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setEditingAccount(null)
                setAccountFormOpen(true)
              }}
            >
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pockets under this money account (Cash, mobile money, bank…). Default for new logs:{' '}
            {accounts.find((a) => a.id === defaultAccountId(accounts))?.name ?? 'Cash'}.
          </p>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => {
                setEditingAccount(account)
                setAccountFormOpen(true)
              }}
              className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/30 px-3 py-2.5 text-left text-sm"
            >
              <span className="truncate">
                {account.icon ? `${account.icon} ` : ''}
                {account.name}
                {account.is_default ? ' · Default' : ''}
              </span>
              <span className="text-xs text-muted-foreground">Edit</span>
            </button>
          ))}
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">No pockets yet. Add Cash to get started.</p>
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label>Pocket types</Label>
          <p className="text-xs text-muted-foreground">
            Add, rename, or delete the Types pockets can use (Cash, Mobile money, Bank…).
          </p>
          <PocketTypeManager walletId={wallet.id} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Providers</Label>
          <p className="text-xs text-muted-foreground">
            Your banks, mobile money operators, or other providers — fully custom to you.
          </p>
          <PocketProviderManager walletId={wallet.id} />
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label>Members</Label>
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/30 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">{member.display_name || member.email}</p>
                <p className="text-xs text-muted-foreground">
                  {member.role === 'viewer'
                    ? 'Coach / advisor (view only)'
                    : member.role === 'editor'
                      ? 'Editor'
                      : member.role}
                </p>
              </div>
              {isOwner && member.user_id !== session?.user.id && (
                <Button variant="ghost" size="sm" onClick={() => handleRemove(member.user_id)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!isOwner && (
            <Button variant="outline" size="sm" className="mt-1" onClick={handleLeave}>
              Leave money account
            </Button>
          )}
        </div>

        {isOwner && (
          <>
            <Separator />
            <form onSubmit={handleInvite} className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Invite by email</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="roommate@example.com"
                  className="flex-1"
                />
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as WalletRole)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor: can log and edit</SelectItem>
                    <SelectItem value="viewer">Coach / advisor: view only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviteMember.isPending}>
                Send invite
              </Button>
              <p className="text-xs text-muted-foreground">
                They need an existing Penda account with this email.
              </p>
            </form>
          </>
        )}

        <Separator />

        <form onSubmit={handleCreateWallet} className="flex flex-col gap-2">
          <Label htmlFor="new-wallet-name">Create another money account</Label>
          <Input
            id="new-wallet-name"
            value={newWalletName}
            onChange={(e) => setNewWalletName(e.target.value)}
            placeholder="Household"
          />
          <CurrencyCombobox value={newWalletCurrency} onChange={setNewWalletCurrency} />
          <Button type="submit" disabled={createWallet.isPending}>
            Create
          </Button>
          <p className="text-xs text-muted-foreground">
            Starts with a Cash pocket. Does not restart onboarding.
          </p>
        </form>
      </section>

      <AccountForm
        open={accountFormOpen}
        onOpenChange={(open) => {
          setAccountFormOpen(open)
          if (!open) setEditingAccount(null)
        }}
        walletId={wallet.id}
        account={editingAccount}
        existingNames={accounts.map((a) => a.name)}
        onSubmit={handleAccountSubmit}
        onArchive={
          editingAccount
            ? async () => {
                try {
                  await archiveAccount.mutateAsync(editingAccount.id)
                  toast('Pocket archived.')
                  setAccountFormOpen(false)
                  setEditingAccount(null)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Something went wrong.')
                }
              }
            : undefined
        }
        isSubmitting={
          createAccount.isPending || updateAccount.isPending || archiveAccount.isPending
        }
      />

      <PaywallSheet
        feature={showSharedWalletsPaywall ? 'shared-wallets' : null}
        onOpenChange={(open) => !open && setShowSharedWalletsPaywall(false)}
      />
    </>
  )
}
