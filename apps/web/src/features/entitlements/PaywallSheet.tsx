import { useState } from 'react'
import { Sparkle } from '@/components/icons/product'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FEATURE_COPY, type PremiumFeature } from './types'

const INTEREST_KEY = 'penda:premium-interest'

interface PaywallSheetProps {
  feature: PremiumFeature | null
  onOpenChange: (open: boolean) => void
  /** Receipt scan only, opens the camera/file picker for the one free preview. */
  onPreviewOnce?: () => void
}

export function PaywallSheet({ feature, onOpenChange, onPreviewOnce }: PaywallSheetProps) {
  const [interested, setInterested] = useState(() => {
    try {
      return localStorage.getItem(INTEREST_KEY) === '1'
    } catch {
      return false
    }
  })

  if (!feature) return null
  const copy = FEATURE_COPY[feature]

  function notifyMe() {
    try {
      localStorage.setItem(INTEREST_KEY, '1')
    } catch {
      /* ignore */
    }
    setInterested(true)
  }

  return (
    <Dialog open={!!feature} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">{copy.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div
            className="relative isolate flex flex-col gap-2 overflow-hidden rounded-[1.5rem] p-5 text-white"
            style={{
              background:
                'linear-gradient(145deg, var(--iris-hero-from) 0%, var(--iris-hero-to) 100%)',
              boxShadow: 'var(--shadow-hero)',
            }}
          >
            <span className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] opacity-90">
              <Sparkle className="size-3.5" weight="fill" />
              Penda+
            </span>
            <h3 className="text-xl font-semibold leading-tight">{copy.title}</h3>
            <p className="text-sm opacity-90">{copy.description}</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Checkout isn’t wired yet (needs Stripe keys). Leave your interest and we’ll unlock
            purchase as soon as billing is live.
          </p>

          {feature === 'receipt-scan' && onPreviewOnce && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                onPreviewOnce()
              }}
            >
              Preview once
            </Button>
          )}

          {interested ? (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              You’re on the list, thanks.
            </p>
          ) : (
            <Button variant="secondary" onClick={notifyMe}>
              Notify me when purchase is live
            </Button>
          )}

          <Button onClick={() => onOpenChange(false)}>Sounds good</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
