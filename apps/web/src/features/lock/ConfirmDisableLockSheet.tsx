import { useEffect, useRef, useState } from 'react'
import { Fingerprint } from '@/components/icons/product'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLockStore } from '@/store/lockStore'
import { verifyPin } from '@/lib/lockCrypto'
import { verifyBiometric } from './webauthn'

/**
 * Require PIN/biometric before turning balance privacy off — otherwise anyone
 * with the unlocked device can disable the gate from Settings.
 */
export function ConfirmDisableLockSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { pinSalt, pinHash, credentialId, disable } = useLockStore()
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
    if (ok) {
      disable()
      onOpenChange(false)
    } else {
      setError('Biometric didn’t work — enter your PIN.')
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault()
    if (!pinSalt || !pinHash || busy) return
    setBusy(true)
    const ok = await verifyPin(pin, pinSalt, pinHash)
    setBusy(false)
    if (ok) {
      disable()
      onOpenChange(false)
    } else {
      setError('Wrong PIN.')
      setPin('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Turn off balance privacy?</DialogTitle>
          <DialogDescription>
            Confirm with {hasBiometric ? 'biometrics or your PIN' : 'your PIN'} before balances stay visible.
          </DialogDescription>
        </DialogHeader>

        {hasBiometric && (
          <Button variant="outline" onClick={attemptBiometric} disabled={busy} className="gap-2 rounded-2xl shadow-[var(--shadow-soft)]">
            <Fingerprint className="size-4" weight="duotone" />
            Confirm with biometrics
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
            {busy ? 'Checking…' : 'Turn off privacy'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
