import { Sparkles } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { FEATURE_COPY, type PremiumFeature } from './types'

interface PaywallSheetProps {
  feature: PremiumFeature | null
  onOpenChange: (open: boolean) => void
}

export function PaywallSheet({ feature, onOpenChange }: PaywallSheetProps) {
  if (!feature) return null
  const copy = FEATURE_COPY[feature]

  return (
    <Sheet open={!!feature} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="sr-only">{copy.title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Aspirational preview card — sells the feature instead of blocking it */}
          <div
            className="flex flex-col gap-2 rounded-2xl p-5 text-white shadow-lg"
            style={{
              background:
                'linear-gradient(150deg, color-mix(in srgb, var(--iris) 88%, #000) 0%, var(--iris) 55%, var(--hero-glow) 130%)',
            }}
          >
            <span className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] opacity-90">
              <Sparkles className="size-3.5" />
              Penda+
            </span>
            <h3 className="text-xl font-semibold leading-tight">{copy.title}</h3>
            <p className="text-sm opacity-90">{copy.description}</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Try the magic once — then Premium unlocks it for good. Purchase isn’t live yet; your free
            preview is saved on this device.
          </p>

          {feature === 'receipt-scan' && (
            <Button
              variant="outline"
              onClick={() => {
                localStorage.setItem('penda:preview:receipt-scan', '1')
                onOpenChange(false)
              }}
            >
              Preview once on this device
            </Button>
          )}

          <Button onClick={() => onOpenChange(false)}>Sounds good</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
