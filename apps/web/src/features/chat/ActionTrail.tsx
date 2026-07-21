import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { CaretRightIcon, ProductIcon } from '@/components/icons/product'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toolUi } from './actionMeta'
import type { ChatAction, PendingAction } from './types'

interface ActionTrailProps {
  actions: ChatAction[]
  /** Close the sheet and navigate to a View link (avoids back-stack races). */
  onNavigateAway?: (href: string) => void
  busyActionId?: string | null
  resolveDisabled?: boolean
  onResolvePending?: (action: PendingAction, decision: 'confirm' | 'cancel') => void
  /** Extra footer actions (AI actions, undo, etc.). */
  footer?: React.ReactNode
  className?: string
}

export function ActionTrail({
  actions,
  onNavigateAway,
  busyActionId,
  resolveDisabled,
  onResolvePending,
  footer,
  className,
}: ActionTrailProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  if (actions.length === 0 && !footer) return null

  return (
    <div
      className={cn(
        'mr-auto flex max-w-[85%] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/80 text-sm shadow-[var(--shadow-soft)]',
        className,
      )}
      role="list"
      aria-label="Actions"
    >
      {actions.map((action, index) => (
        <ActionStepRow
          key={action.id}
          action={action}
          expanded={expandedId === action.id}
          showConnector={index < actions.length - 1 || !!footer}
          onToggle={() => setExpandedId((id) => (id === action.id ? null : action.id))}
          onNavigateAway={onNavigateAway}
          busy={busyActionId === action.id}
          resolveDisabled={resolveDisabled}
          onResolvePending={onResolvePending}
        />
      ))}
      {footer ? (
        <div className="flex flex-wrap gap-2 border-t border-border/40 bg-secondary/20 px-3 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

function ActionStepRow({
  action,
  expanded,
  showConnector,
  onToggle,
  onNavigateAway,
  busy,
  resolveDisabled,
  onResolvePending,
}: {
  action: ChatAction
  expanded: boolean
  showConnector: boolean
  onToggle: () => void
  onNavigateAway?: () => void
  busy?: boolean
  resolveDisabled?: boolean
  onResolvePending?: (action: PendingAction, decision: 'confirm' | 'cancel') => void
}) {
  const navigate = useNavigate()
  const meta = toolUi(action.tool)
  const detailEntries = action.details ? Object.entries(action.details) : []
  const isPending = action.status === 'pending'
  const expandable = !isPending && (detailEntries.length > 0 || !!action.viewHref)
  const statusLabel =
    action.status === 'running'
      ? 'In progress'
      : action.status === 'error'
        ? 'Failed'
        : action.status === 'pending'
          ? 'Needs confirmation'
          : action.status === 'cancelled'
            ? 'Cancelled'
            : action.status === 'confirmed'
              ? 'Applied'
              : 'Done'

  const HeaderTag = expandable ? 'button' : 'div'

  return (
    <div className="relative" role="listitem">
      {showConnector && (
        <span
          aria-hidden
          className="absolute top-9 bottom-0 left-[1.35rem] w-px bg-border/60"
        />
      )}
      <HeaderTag
        {...(expandable
          ? {
              type: 'button' as const,
              onClick: onToggle,
              'aria-expanded': expanded,
            }
          : {})}
        className={cn(
          'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
          expandable && 'hover:bg-secondary/50 active:bg-secondary/70',
          !expandable && 'cursor-default',
        )}
      >
        <span
          className={cn(
            'relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1',
            action.pendingKind === 'delete'
              ? 'bg-destructive/10 text-destructive ring-destructive/20'
              : action.pendingKind === 'update'
                ? 'bg-[var(--iris-soft)]/80 text-primary ring-primary/20'
                : 'bg-secondary text-foreground/80 ring-border/50',
          )}
        >
          {action.pendingKind === 'delete' ? (
            <Trash2 className="size-3" />
          ) : action.pendingKind === 'update' ? (
            <Pencil className="size-3" />
          ) : (
            <ProductIcon icon={meta.icon} weight="duotone" className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-foreground">{action.label}</span>
            <StatusGlyph status={action.status} />
            <span className="sr-only">{statusLabel}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{action.summary}</span>
        </span>
        {expandable && (
          <CaretRightIcon
            className={cn(
              'mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-90',
            )}
            weight="bold"
          />
        )}
      </HeaderTag>
      {isPending && onResolvePending && action.pendingKind && (
        <div className="flex gap-2 px-3 pb-2.5 pl-12">
          <Button
            type="button"
            size="sm"
            variant={action.pendingKind === 'delete' ? 'destructive' : 'default'}
            className="h-7 px-2.5 text-xs"
            disabled={busy || resolveDisabled}
            onClick={() =>
              onResolvePending(
                {
                  id: action.id,
                  kind: action.pendingKind!,
                  domain: action.domain,
                  summary: action.summary,
                  targetId: action.targetId,
                },
                'confirm',
              )
            }
          >
            {busy ? 'Working…' : action.pendingKind === 'delete' ? 'Delete' : 'Confirm'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={busy || resolveDisabled}
            onClick={() =>
              onResolvePending(
                {
                  id: action.id,
                  kind: action.pendingKind!,
                  domain: action.domain,
                  summary: action.summary,
                  targetId: action.targetId,
                },
                'cancel',
              )
            }
          >
            Cancel
          </Button>
        </div>
      )}
      {expanded && expandable && !isPending && (
        <div className="border-t border-border/40 bg-secondary/30 px-3 py-2.5 pl-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          {detailEntries.length > 0 && (
            <dl className="space-y-1">
              {detailEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-xs">
                  <dt className="shrink-0 text-muted-foreground">{key}</dt>
                  <dd className="min-w-0 break-words text-foreground/90">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {/* View lives in the trail footer (message.viewHref) so we don't show two. */}
          {action.viewHref &&
            (action.status === 'done' || action.status === 'confirmed') &&
            !onNavigateAway && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 h-7 px-2.5 text-xs"
                onClick={() => navigate(action.viewHref!)}
              >
                View
              </Button>
            )}
        </div>
      )}
    </div>
  )
}

function StatusGlyph({ status }: { status: ChatAction['status'] }) {
  if (status === 'running') {
    return <Loader2 className="size-3 shrink-0 animate-spin text-primary" aria-hidden />
  }
  if (status === 'error') {
    return <X className="size-3 shrink-0 text-destructive" aria-hidden />
  }
  if (status === 'pending') {
    return <Loader2 className="size-3 shrink-0 text-primary" aria-hidden />
  }
  if (status === 'cancelled') {
    return <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
  }
  return <Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
}
