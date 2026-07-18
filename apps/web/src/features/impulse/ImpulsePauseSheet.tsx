import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'

interface ImpulsePauseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  amountMinor: number
  currency: string
  merchant: string | null
  onPause: () => void
  onProceed: () => void
}

export function ImpulsePauseSheet({
  open,
  onOpenChange,
  amountMinor,
  currency,
  merchant,
  onPause,
  onProceed,
}: ImpulsePauseSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Sit on this for 24h?</SheetTitle>
        </SheetHeader>
        <p className="px-4 text-sm text-muted-foreground">
          {formatMoney(amountMinor, currency)}
          {merchant ? ` at ${merchant}` : ''} is a big one. Want to sleep on it before it hits the ledger?
        </p>
        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => {
              onPause()
              onOpenChange(false)
            }}
          >
            Yes — remind me tomorrow
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onProceed()
              onOpenChange(false)
            }}
          >
            Log it anyway
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
