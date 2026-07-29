import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import type { TransactionLinkage } from './transactionLinkage'
import type { Transaction } from './types'

interface DeleteTransactionDialogProps {
  transaction: Transaction | null
  linkage: TransactionLinkage
  reverseLinked: boolean
  onReverseLinkedChange: (value: boolean) => void
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending?: boolean
}

export function DeleteTransactionDialog({
  transaction,
  linkage,
  reverseLinked,
  onReverseLinkedChange,
  onOpenChange,
  onConfirm,
  isPending,
}: DeleteTransactionDialogProps) {
  const label = transaction?.merchant || transaction?.description || 'this transaction'

  return (
    <AlertDialog open={!!transaction} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
          <AlertDialogDescription>Remove "{label}"? This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>

        {transaction && linkage && (
          <label className="flex items-start gap-3 rounded-2xl bg-muted/60 px-3.5 py-3 text-sm">
            <Switch
              checked={reverseLinked}
              onCheckedChange={onReverseLinkedChange}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">
              {linkage.kind === 'transfer' ? (
                <>
                  Also remove the matching entry in <strong>{linkage.otherPocketLabel}</strong>, returning
                  the money to <strong>{linkage.sourcePocketLabel}</strong>.
                </>
              ) : (
                <>
                  Also reverse this payment on <strong>"{linkage.debtName}"</strong>, adding{' '}
                  <strong>{formatMoney(linkage.amountMinor, transaction.currency)}</strong> back to the
                  balance.
                </>
              )}
            </span>
          </label>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() => onConfirm()}
            className={cn(buttonVariants({ variant: 'destructive' }), 'flex-1 rounded-full')}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
