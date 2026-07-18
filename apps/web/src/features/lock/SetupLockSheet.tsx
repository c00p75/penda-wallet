import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/store/authStore'
import { useLockStore } from '@/store/lockStore'
import { generateSalt, hashPin } from '@/lib/lockCrypto'
import { isBiometricAvailable, registerBiometric } from './webauthn'

/** Enable flow: set a PIN (confirmed) and optionally register biometrics. */
export function SetupLockSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useAuthStore((s) => s.session)
  const enable = useLockStore((s) => s.enable)

  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [useBio, setUseBio] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPin('')
    setConfirm('')
    setError(null)
    void isBiometricAvailable().then((available) => {
      setBioAvailable(available)
      setUseBio(available)
    })
  }, [open])

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 8)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.')
      return
    }
    if (pin !== confirm) {
      setError('PINs don’t match.')
      return
    }
    setBusy(true)
    try {
      const pinSalt = generateSalt()
      const pinHash = await hashPin(pin, pinSalt)
      let credentialId: string | null = null
      if (useBio && bioAvailable && session) {
        credentialId = await registerBiometric(session.user.id, session.user.email ?? 'Penda user')
        if (!credentialId) toast('Saved with PIN — biometrics were skipped.')
      }
      enable({ pinSalt, pinHash, credentialId })
      toast('Balance lock on. Tap a hidden balance to reveal it.')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex flex-col gap-4 border-0 px-5 pb-6 ring-0">
        <SheetHeader>
          <SheetTitle>Set up balance lock</SheetTitle>
          <SheetDescription>
            Pick a PIN to reveal your balances. It’s stored only on this device — never sent to Penda.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lock-pin">PIN (4–8 digits)</Label>
            <Input
              id="lock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(digitsOnly(e.target.value))
                setError(null)
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lock-pin-confirm">Confirm PIN</Label>
            <Input
              id="lock-pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={confirm}
              onChange={(e) => {
                setConfirm(digitsOnly(e.target.value))
                setError(null)
              }}
            />
          </div>

          {bioAvailable && (
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-[var(--iris-soft)]/50 p-4 shadow-[var(--shadow-soft)]">
              <div className="pr-3">
                <p className="text-sm font-medium">Also use biometrics</p>
                <p className="text-xs text-muted-foreground">Face ID / fingerprint, with the PIN as backup.</p>
              </div>
              <Switch checked={useBio} onCheckedChange={setUseBio} />
            </div>
          )}

          {error && <p className="text-sm text-[var(--rose)]">{error}</p>}

          <Button type="submit" disabled={busy}>
            {busy ? 'Setting up…' : 'Turn on balance lock'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
