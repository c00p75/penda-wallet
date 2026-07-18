import { useEffect, useRef, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLockStore } from '@/store/lockStore'
import { verifyPin } from '@/lib/lockCrypto'
import { verifyBiometric } from './webauthn'

/**
 * The reveal gate: biometric first (auto-attempted on open when a credential is
 * registered), with a PIN fallback always available. Success flips the global
 * unlocked flag so every masked balance reveals at once.
 */
export function UnlockSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pinSalt, pinHash, credentialId, setUnlocked } = useLockStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const biometricTried = useRef(false)

  const hasBiometric = !!credentialId

  useEffect(() => {
    if (!open) {
      setPin('')
      setError(null)
      biometricTried.current = false
      return
    }
    // Auto-offer biometric once per open when it's set up.
    if (hasBiometric && !biometricTried.current) {
      biometricTried.current = true
      void attemptBiometric()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function attemptBiometric() {
    if (!credentialId) return
    setBusy(true)
    setError(null)
    const ok = await verifyBiometric(credentialId)
    setBusy(false)
    if (ok) setUnlocked(true)
    else setError('Biometric unlock didn’t work — enter your PIN.')
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault()
    if (!pinSalt || !pinHash || busy) return
    setBusy(true)
    const ok = await verifyPin(pin, pinSalt, pinHash)
    setBusy(false)
    if (ok) {
      setUnlocked(true)
    } else {
      setError('Wrong PIN.')
      setPin('')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex flex-col gap-4 border-0 px-5 pb-6 ring-0">
        <SheetHeader>
          <SheetTitle>Reveal balances</SheetTitle>
          <SheetDescription>Your balances are hidden. Unlock to show them.</SheetDescription>
        </SheetHeader>

        {hasBiometric && (
          <Button variant="outline" onClick={attemptBiometric} disabled={busy} className="gap-2 rounded-2xl shadow-[var(--shadow-soft)]">
            <Fingerprint className="size-4" />
            Unlock with biometrics
          </Button>
        )}

        <form onSubmit={submitPin} className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-secondary/30 p-4 shadow-[var(--shadow-soft)]">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus={!hasBiometric}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''))
              setError(null)
            }}
            placeholder={hasBiometric ? 'Or enter your PIN' : 'Enter your PIN'}
            aria-label="PIN"
          />
          {error && <p className="text-sm text-[var(--rose)]">{error}</p>}
          <Button type="submit" disabled={busy || pin.length < 4}>
            {busy ? 'Checking…' : 'Unlock'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** Mounted once, app-wide, so any masked balance can trigger the unlock sheet. */
export function LockPrompt() {
  const prompting = useLockStore((s) => s.prompting)
  const dismissPrompt = useLockStore((s) => s.dismissPrompt)
  return <UnlockSheet open={prompting} onOpenChange={(open) => !open && dismissPrompt()} />
}
