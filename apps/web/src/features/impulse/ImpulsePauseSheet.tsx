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
      <SheetContent side="bottom" className="mx-auto max-w-md border-0 ring-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="grid size-2 shrink-0 rounded-full bg-[var(--apricot)]" aria-hidden />
            Sit on this for 24h?
          </SheetTitle>
        </SheetHeader>
        <p className="rounded-2xl bg-[var(--apricot-soft)]/70 px-5 py-3 text-sm text-foreground/80">
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
