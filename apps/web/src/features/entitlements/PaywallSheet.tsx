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
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            {copy.title} is a Premium feature
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <p className="text-sm text-muted-foreground">{copy.description}</p>
          <p className="text-sm text-muted-foreground">
            Premium isn't available to purchase yet — check back soon.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
