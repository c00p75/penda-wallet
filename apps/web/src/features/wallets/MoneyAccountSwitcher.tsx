import { useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CurrencyCombobox } from '@/components/CurrencyCombobox'
import { useWalletStore } from '@/store/walletStore'
import { cn } from '@/lib/utils'
import { useCreateWallet, useWallets } from './hooks'

/**
 * Top-left switcher for money accounts (DB: wallets). Creating another money
 * account never re-runs first-run onboarding.
 */
export function MoneyAccountSwitcher({ className }: { className?: string }) {
  const { data: wallets = [] } = useWallets()
  const currentWalletId = useWalletStore((s) => s.currentWalletId)
  const setCurrentWalletId = useWalletStore((s) => s.setCurrentWalletId)
  const createWallet = useCreateWallet()
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('ZMW')

  const current = wallets.find((w) => w.id === currentWalletId) ?? wallets[0] ?? null

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const created = await createWallet.mutateAsync({
        name: name.trim(),
        baseCurrency: currency,
      })
      setCurrentWalletId(created.id)
      setName('')
      setCreateOpen(false)
      toast(`Created "${created.name}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create money account.')
    }
  }

  if (!current) return null

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex max-w-[11rem] items-center gap-1.5 rounded-2xl bg-card px-3 py-2 text-left shadow-[var(--shadow-soft)] ring-1 ring-border/60 transition-transform active:scale-95',
              className,
            )}
            aria-label="Switch money account"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
              {current.name}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Money accounts</p>
          <div className="flex flex-col gap-0.5">
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setCurrentWalletId(w.id)
                  setMenuOpen(false)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{w.name}</span>
                {w.id === current.id && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            onClick={() => {
              setCurrency(current.base_currency || 'ZMW')
              setMenuOpen(false)
              setCreateOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-accent"
          >
            <Plus className="size-4" />
            Add money account
          </button>
        </PopoverContent>
      </Popover>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="border-0 ring-0">
          <SheetHeader>
            <SheetTitle>New money account</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4 px-4 pb-4">
            <p className="text-sm text-muted-foreground">
              A separate money space with its own wallets, budgets, and goals. This does not
              restart onboarding.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ma-name">Name</Label>
              <Input
                id="ma-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Personal, Family, Side hustle…"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Currency</Label>
              <CurrencyCombobox value={currency} onChange={setCurrency} />
            </div>
            <SheetFooter>
              <Button type="submit" disabled={createWallet.isPending || !name.trim()}>
                Create
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
