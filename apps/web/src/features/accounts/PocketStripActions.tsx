import { Plus, ArrowLeftRight } from 'lucide-react'

interface PocketStripActionsProps {
  canTransfer: boolean
  onAdd: () => void
  onTransfer: () => void
  showHeading?: boolean
}

/** Compact Add / Transfer controls above the shared home carousel. */
export function PocketStripActions({
  canTransfer,
  onAdd,
  onTransfer,
  showHeading = true,
}: PocketStripActionsProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      {showHeading ? <h2 className="text-sm font-semibold">Pockets</h2> : <span />}
      <div className="flex items-center gap-3">
        {canTransfer && (
          <button
            type="button"
            onClick={onTransfer}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftRight className="size-3.5" />
            Transfer
          </button>
        )}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>
    </div>
  )
}
