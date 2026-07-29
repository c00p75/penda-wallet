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
  ACCOUNT_KIND_OPTIONS,
  ACCOUNT_PROVIDER_OPTIONS,
  QUICK_POCKET_PRESETS,
  type Account,
  type AccountInput,
  type AccountKind,
  type AccountProvider,
} from './types'

interface AccountFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account | null
  existingNames?: string[]
  onSubmit: (input: AccountInput) => Promise<void>
  onArchive?: () => Promise<void>
  isSubmitting?: boolean
}

export function AccountForm({
  open,
  onOpenChange,
  account,
  existingNames = [],
  onSubmit,
  onArchive,
  isSubmitting,
}: AccountFormProps) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('cash')
  const [provider, setProvider] = useState<AccountProvider | 'none'>('none')
  const [icon, setIcon] = useState('💵')
  const [color, setColor] = useState<string | null>(null)
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (!open) return
    if (account) {
      setName(account.name)
      setKind(account.kind)
      setProvider(account.provider ?? 'none')
      setIcon(account.icon ?? '💵')
      setColor(account.color ?? null)
      setIsDefault(account.is_default)
    } else {
      setName('')
      setKind('cash')
      setProvider('none')
      setIcon('💵')
      setColor(null)
      setIsDefault(false)
    }
  }, [open, account])

  function applyPreset(preset: (typeof QUICK_POCKET_PRESETS)[number]) {
    setName(preset.name)
    setKind(preset.kind)
    setProvider(preset.provider ?? 'none')
    setIcon(preset.icon)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await onSubmit({
      name: name.trim(),
      kind,
      provider: provider === 'none' ? null : provider,
      icon,
      color,
      is_default: isDefault,
    })
    onOpenChange(false)
  }

  const unusedPresets = QUICK_POCKET_PRESETS.filter(
    (p) => !existingNames.some((n) => n.toLowerCase() === p.name.toLowerCase()),
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>{account ? 'Edit pocket' : 'Add pocket'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          {!account && unusedPresets.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Quick add</p>
              <div className="flex flex-wrap gap-2">
                {unusedPresets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-soft)]"
                  >
                    {p.icon} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pocket-name">Name</Label>
            <Input
              id="pocket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Airtel Money"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(kind === 'mobile_money' || kind === 'bank') && (
            <div className="flex flex-col gap-1.5">
              <Label>Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as AccountProvider | 'none')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {ACCOUNT_PROVIDER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.icon} {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
