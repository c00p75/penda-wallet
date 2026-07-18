import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-2 shrink-0 rounded-full bg-[var(--apricot)]" aria-hidden />
            Sit on this for 24h?
          </DialogTitle>
        </DialogHeader>
        <p className="rounded-2xl bg-[var(--apricot-soft)]/70 px-4 py-3 text-sm text-foreground/80">
          {formatMoney(amountMinor, currency)}
          {merchant ? ` at ${merchant}` : ''} is a big one. Want to sleep on it before it hits the ledger?
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => {
              onPause()
              onOpenChange(false)
            }}
          >
            Yes, remind me tomorrow
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
