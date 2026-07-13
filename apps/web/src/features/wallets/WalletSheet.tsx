import { useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import {
  useCreateWallet,
  useInviteWalletMember,
  useRemoveWalletMember,
  useWalletMembers,
  useWallets,
} from './hooks'
import type { Wallet, WalletRole } from './types'

interface WalletSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wallet: Wallet | undefined
}

export function WalletSheet({ open, onOpenChange, wallet }: WalletSheetProps) {
  const session = useAuthStore((s) => s.session)
  const { data: wallets = [] } = useWallets()
  const setCurrentWalletId = useWalletStore((s) => s.setCurrentWalletId)
  const { data: members = [] } = useWalletMembers(wallet?.id)
  const inviteMember = useInviteWalletMember(wallet?.id)
  const removeMember = useRemoveWalletMember(wallet?.id)
  const createWallet = useCreateWallet()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WalletRole>('editor')
  const [newWalletName, setNewWalletName] = useState('')

  const myRole = members.find((m) => m.user_id === session?.user.id)?.role
  const isOwner = myRole === 'owner'

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    try {
      await inviteMember.mutateAsync({ email: inviteEmail.trim(), role: inviteRole })
      toast(`Invited ${inviteEmail.trim()}.`)
      setInviteEmail('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not invite that email.')
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
      toast('You left the wallet.')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleCreateWallet(e: React.FormEvent) {
    e.preventDefault()
    if (!newWalletName.trim()) return
    try {
      const created = await createWallet.mutateAsync({ name: newWalletName.trim(), baseCurrency: 'USD' })
      setCurrentWalletId(created.id)
      setNewWalletName('')
      toast(`Created "${created.name}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create wallet.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Wallets</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wallet-switch">Current wallet</Label>
            <Select value={wallet?.id} onValueChange={setCurrentWalletId}>
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
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <Label>Members</Label>
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{member.display_name || member.email}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
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
                Leave wallet
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
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
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
            <Label htmlFor="new-wallet-name">Create a new wallet</Label>
            <div className="flex gap-2">
              <Input
                id="new-wallet-name"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                placeholder="Household"
                className="flex-1"
              />
              <Button type="submit" disabled={createWallet.isPending}>
                Create
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
