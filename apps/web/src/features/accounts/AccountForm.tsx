import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CARD_COLOR_SWATCHES } from '@/lib/heroGradient'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreatePocketProvider,
  useCreatePocketType,
  usePocketProviders,
  usePocketTypes,
} from './hooks'
import type { Account, AccountInput } from './types'

const NEW_OPTION = '__new__'
const NONE_OPTION = '__none__'

interface AccountFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string | undefined
  account?: Account | null
  existingNames?: string[]
  onSubmit: (input: AccountInput) => Promise<void>
  onArchive?: () => Promise<void>
  isSubmitting?: boolean
}

export function AccountForm({
  open,
  onOpenChange,
  walletId,
  account,
  existingNames = [],
  onSubmit,
  onArchive,
  isSubmitting,
}: AccountFormProps) {
  const { data: types = [] } = usePocketTypes(walletId)
  const { data: providers = [] } = usePocketProviders(walletId)
  const createType = useCreatePocketType(walletId)
  const createProvider = useCreatePocketProvider(walletId)

  const [name, setName] = useState('')
  const [kindId, setKindId] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [icon, setIcon] = useState('💵')
  const [color, setColor] = useState<string | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [addingType, setAddingType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [addingProvider, setAddingProvider] = useState(false)
  const [newProviderName, setNewProviderName] = useState('')

  useEffect(() => {
    if (!open) return
    setAddingType(false)
    setNewTypeName('')
    setAddingProvider(false)
    setNewProviderName('')
    if (account) {
      setName(account.name)
      setKindId(account.kind_id)
      setProviderId(account.provider_id)
      setIcon(account.icon ?? '💵')
      setColor(account.color ?? null)
      setIsDefault(account.is_default)
    } else {
      setName('')
      setKindId(null)
      setProviderId(null)
      setIcon('💵')
      setColor(null)
      setIsDefault(false)
    }
  }, [open, account])

  // Default a new pocket to the wallet's first Type once the list loads.
  useEffect(() => {
    if (!open || account || kindId || types.length === 0) return
    setKindId(types[0].id)
  }, [open, account, kindId, types])

  const cashType = types.find((t) => t.name.trim().toLowerCase() === 'cash')
  const showCashQuickAdd =
    !account && cashType != null && !existingNames.some((n) => n.toLowerCase() === 'cash')

  function applyCashQuickAdd() {
    if (!cashType) return
    setName('Cash')
    setKindId(cashType.id)
    setIcon('💵')
    setProviderId(null)
  }

  async function handleAddType() {
    if (!newTypeName.trim()) return
    const created = await createType.mutateAsync({ name: newTypeName.trim(), icon: null })
    setKindId(created.id)
    setAddingType(false)
    setNewTypeName('')
  }

  async function handleAddProvider() {
    if (!newProviderName.trim()) return
    const created = await createProvider.mutateAsync({ name: newProviderName.trim(), icon: null })
    setProviderId(created.id)
    setAddingProvider(false)
    setNewProviderName('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await onSubmit({
      name: name.trim(),
      kind_id: kindId,
      provider_id: providerId,
      icon,
      color,
      is_default: isDefault,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>{account ? 'Edit pocket' : 'Add pocket'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          {showCashQuickAdd && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Quick add</p>
              <button
                type="button"
                onClick={applyCashQuickAdd}
                className="self-start rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-soft)]"
              >
                💵 Cash
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pocket-name">Name</Label>
            <Input
              id="pocket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cash"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select
              value={kindId ?? ''}
              onValueChange={(v) => (v === NEW_OPTION ? setAddingType(true) : setKindId(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.icon ? `${t.icon} ` : ''}
                    {t.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_OPTION}>+ New type…</SelectItem>
              </SelectContent>
            </Select>
            {addingType && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Crypto wallet"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newTypeName.trim() || createType.isPending}
                  onClick={() => void handleAddType()}
                >
                  Add
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAddingType(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select
              value={providerId ?? NONE_OPTION}
              onValueChange={(v) => {
                if (v === NEW_OPTION) setAddingProvider(true)
                else setProviderId(v === NONE_OPTION ? null : v)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_OPTION}>None</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon ? `${p.icon} ` : ''}
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_OPTION}>+ New provider…</SelectItem>
              </SelectContent>
            </Select>
            {addingProvider && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  placeholder="Revolut"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newProviderName.trim() || createProvider.isPending}
                  onClick={() => void handleAddProvider()}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingProvider(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pocket-icon">Icon</Label>
            <Input
              id="pocket-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={8}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Card color</Label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={cn(
                  'rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium',
                  color === null && 'border-primary text-primary',
                )}
              >
                Auto
              </button>
              {CARD_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Use ${swatch}`}
                  className={cn(
                    'size-8 shrink-0 rounded-full ring-offset-2 ring-offset-background',
                    color === swatch && 'ring-2 ring-primary',
                  )}
                  style={{ background: swatch }}
                />
              ))}
              <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-dashed border-border/70">
                <input
                  type="color"
                  value={color ?? '#6c63ff'}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Custom card color"
                />
                <span aria-hidden className="pointer-events-none grid size-full place-items-center text-xs">
                  🎨
                </span>
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Default pocket for new transactions
          </label>

          <SheetFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {account ? 'Save' : 'Add pocket'}
            </Button>
            {account && onArchive && !account.is_default && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => void onArchive()}
              >
                Archive pocket
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
