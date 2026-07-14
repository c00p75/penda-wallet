import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyCombobox } from '@/components/CurrencyCombobox'
import { useWalletStore } from '@/store/walletStore'
import { useCreateWallet } from './hooks'

export function OnboardingScreen() {
  const createWallet = useCreateWallet()
  const setCurrentWalletId = useWalletStore((s) => s.setCurrentWalletId)

  const [name, setName] = useState('My Wallet')
  const [currency, setCurrency] = useState('USD')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const created = await createWallet.mutateAsync({ name: name.trim(), baseCurrency: currency })
      setCurrentWalletId(created.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create your wallet.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Welcome to Penda
        </span>
        <h1 className="text-2xl font-semibold">Let's set up your wallet</h1>
        <p className="text-sm text-muted-foreground">
          This is where your transactions, budgets, and goals will live. You can add more wallets
          or invite others later.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-wallet-name">Wallet name</Label>
          <Input
            id="onboarding-wallet-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Wallet"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-currency">Currency</Label>
          <CurrencyCombobox id="onboarding-currency" value={currency} onChange={setCurrency} />
        </div>

        <Button type="submit" disabled={createWallet.isPending}>
          Get started
        </Button>
      </form>
    </main>
  )
}
