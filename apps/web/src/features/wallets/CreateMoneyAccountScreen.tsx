import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyCombobox } from '@/components/CurrencyCombobox'
import { useWalletStore } from '@/store/walletStore'
import { useCreateWallet } from './hooks'

/**
 * Shown when the user finished first-run onboarding but has no money accounts
 * left (e.g. left/deleted the last one). Does not re-run the onboarding quiz.
 */
export function CreateMoneyAccountScreen() {
  const createWallet = useCreateWallet()
  const setCurrentWalletId = useWalletStore((s) => s.setCurrentWalletId)
  const [name, setName] = useState('Personal')
  const [currency, setCurrency] = useState('ZMW')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const created = await createWallet.mutateAsync({
        name: name.trim(),
        baseCurrency: currency,
      })
      setCurrentWalletId(created.id)
      toast(`Created "${created.name}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create money account.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 bg-background px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create a money account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need at least one money account. Add pockets like Cash or mobile money inside it
          next.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="create-ma-name">Name</Label>
          <Input
            id="create-ma-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Currency</Label>
          <CurrencyCombobox value={currency} onChange={setCurrency} />
        </div>
        <Button type="submit" disabled={createWallet.isPending || !name.trim()}>
          Continue
        </Button>
      </form>
    </main>
  )
}
