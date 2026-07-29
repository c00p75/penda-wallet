import type { Icon } from '@phosphor-icons/react'
import {
  Bank,
  ChartBar,
  ClipboardText,
  Notebook,
  PiggyBank,
  Receipt,
  Sparkle,
  SquaresFour,
  Wallet,
} from '@/components/icons/product'
import type { ChatAction, PendingAction } from './types'

export interface ToolUiMeta {
  domain: string
  /** Short label shown in the collapsed trail row. */
  label: string
  icon: Icon
  /** Progress copy while the tool is in flight. */
  progress: string
}

const DEFAULT_META: ToolUiMeta = {
  domain: 'general',
  label: 'Working on it',
  icon: Sparkle,
  progress: 'Working on it…',
}

export const TOOL_UI: Record<string, ToolUiMeta> = {
  create_transaction: {
    domain: 'transaction',
    label: 'Logged transaction',
    icon: Receipt,
    progress: 'Logging that…',
  },
  create_debt: {
    domain: 'debt',
    label: 'Recorded debt',
    icon: Bank,
    progress: 'Recording the debt…',
  },
  log_borrowed_or_lent_money: {
    domain: 'debt',
    label: 'Recorded loan',
    icon: Bank,
    progress: 'Recording the loan…',
  },
  log_debt_payment: {
    domain: 'debt',
    label: 'Logged payment',
    icon: Bank,
    progress: 'Logging the payment…',
  },
  create_budget: {
    domain: 'budget',
    label: 'Created budget',
    icon: Wallet,
    progress: 'Setting up a budget…',
  },
  create_goal: {
    domain: 'goal',
    label: 'Created goal',
    icon: PiggyBank,
    progress: 'Setting up a goal…',
  },
  create_category: {
    domain: 'category',
    label: 'Created category',
    icon: SquaresFour,
    progress: 'Adding a category…',
  },
  create_recurring_transaction: {
    domain: 'recurring',
    label: 'Created recurring',
    icon: Receipt,
    progress: 'Setting up recurring…',
  },
  create_pact: {
    domain: 'pact',
    label: 'Created pact',
    icon: ClipboardText,
    progress: 'Creating a pact…',
  },
  set_balance: {
    domain: 'reconciliation',
    label: 'Confirm balance',
    icon: Wallet,
    progress: 'Preparing balance…',
  },
  query_records: {
    domain: 'query',
    label: 'Looked that up',
    icon: ClipboardText,
    progress: 'Looking that up…',
  },
  get_spending_summary: {
    domain: 'summary',
    label: 'Tallied spend',
    icon: ChartBar,
    progress: 'Tallying your spend…',
  },
  convert_currency: {
    domain: 'fx',
    label: 'Converted currency',
    icon: ChartBar,
    progress: 'Checking the exchange rate…',
  },
  update_record: {
    domain: 'record',
    label: 'Proposed update',
    icon: Sparkle,
    progress: 'Preparing an update…',
  },
  delete_record: {
    domain: 'record',
    label: 'Proposed deletion',
    icon: Sparkle,
    progress: 'Preparing a deletion…',
  },
  save_memory: {
    domain: 'memory',
    label: 'Remembered that',
    icon: Notebook,
    progress: 'Remembering that…',
  },
  teach_categorization: {
    domain: 'memory',
    label: 'Taught Penda',
    icon: Sparkle,
    progress: 'Learning that…',
  },
  money_habit: {
    domain: 'goal',
    label: 'Saved via habit',
    icon: PiggyBank,
    progress: 'Applying habits…',
  },
}

export function toolUi(tool: string): ToolUiMeta {
  return TOOL_UI[tool] ?? DEFAULT_META
}

export function viewHrefFor(domain: string, targetId?: string): string | undefined {
  switch (domain) {
    case 'transaction':
    case 'reconciliation':
      return targetId
        ? `/transactions?tx=${encodeURIComponent(targetId)}`
        : '/transactions'
    case 'budget':
      return targetId ? `/budgets?budget=${encodeURIComponent(targetId)}` : '/budgets'
    case 'recurring':
      return targetId
        ? `/budgets?tab=recurring&recurring=${encodeURIComponent(targetId)}`
        : '/budgets?tab=recurring'
    case 'pact':
      return '/budgets#pacts'
    case 'goal':
      return targetId ? `/goals/${targetId}` : '/goals'
    case 'debt':
      // IOUs live on the Goals page debts tab (not settle-up splits).
      return targetId
        ? `/goals?debt=${encodeURIComponent(targetId)}`
        : '/goals?tab=debts'
    case 'memory':
      return '/journal'
    case 'summary':
    case 'query':
      return '/analytics'
    default:
      return undefined
  }
}

/** List/hub page only (no deep-link that reopens an edit sheet). */
export function listHrefFor(domain: string): string | undefined {
  switch (domain) {
    case 'transaction':
    case 'reconciliation':
      return '/transactions'
    case 'budget':
      return '/budgets'
    case 'pact':
      return '/budgets#pacts'
    case 'recurring':
      return '/budgets?tab=recurring'
    case 'goal':
      return '/goals'
    case 'debt':
      return '/goals?tab=debts'
    case 'memory':
      return '/journal'
    case 'summary':
    case 'query':
      return '/analytics'
    default:
      return undefined
  }
}

/** Label for leaving chat to the list/hub page. */
export function listLabelFor(domain: string): string | undefined {
  switch (domain) {
    case 'transaction':
    case 'reconciliation':
      return 'View transactions'
    case 'budget':
    case 'pact':
      return 'View budgets'
    case 'recurring':
      return 'View recurring'
    case 'goal':
      return 'View goals'
    case 'debt':
      return 'View debts'
    case 'memory':
      return 'View journal'
    case 'summary':
    case 'query':
      return 'View analytics'
    default:
      return undefined
  }
}

/** Attach view links to actions that touch a navigable domain. */
export function withViewHrefs(actions: ChatAction[]): ChatAction[] {
  return actions.map((action) => {
    if (action.status === 'error' || action.status === 'running') return action
    // Deletes have no item left to open; send View to the list/hub instead.
    const href =
      action.viewHref ??
      (action.tool === 'delete_record'
        ? listHrefFor(action.domain)
        : viewHrefFor(action.domain, action.targetId))
    return href ? { ...action, viewHref: href } : action
  })
}

/** Turn a live/running step into a completed one when the turn finishes. */
const STAGING_TRAIL_TOOLS = new Set([
  'update_record',
  'delete_record',
  'set_balance',
  'create_budget',
  'create_goal',
  'create_debt',
  'create_recurring_transaction',
  'create_pact',
])

export function finalizeLiveActions(steps: ChatAction[]): ChatAction[] {
  return withViewHrefs(
    steps
      .filter((s) => !STAGING_TRAIL_TOOLS.has(s.tool))
      .map((s) => (s.status === 'running' ? { ...s, status: 'done' as const } : s)),
  )
}

export function pendingTool(kind: PendingAction['kind'], domain?: string): string {
  if (kind === 'delete') return 'delete_record'
  if (kind === 'reconcile') return 'set_balance'
  if (kind === 'create') {
    if (domain === 'recurring') return 'create_recurring_transaction'
    if (domain === 'budget') return 'create_budget'
    if (domain === 'goal') return 'create_goal'
    if (domain === 'debt') return 'create_debt'
    if (domain === 'pact') return 'create_pact'
    return 'create_budget'
  }
  return 'update_record'
}

function pendingLabel(kind: PendingAction['kind']): string {
  if (kind === 'delete') return 'Proposed deletion'
  if (kind === 'reconcile') return 'Confirm balance'
  if (kind === 'create') return 'Proposed create'
  return 'Proposed update'
}

/** Map staged pending actions into trail rows so confirms live in one composition. */
export function pendingToTrailActions(
  pending: PendingAction[],
  statusMap: Record<string, 'confirmed' | 'cancelled'>,
): ChatAction[] {
  return pending.map((p) => {
    const resolved = statusMap[p.id]
    return {
      id: p.id,
      tool: pendingTool(p.kind, p.domain),
      domain: p.domain,
      label: pendingLabel(p.kind),
      summary: p.summary,
      status: resolved ?? 'pending',
      pendingKind: p.kind,
      targetId: p.targetId,
      viewHref:
        resolved === 'confirmed'
          ? p.kind === 'delete'
            ? listHrefFor(p.domain)
            : p.kind === 'reconcile'
              ? // targetId here is still the stage-time wallet-id placeholder, not
                // the adjustment transaction confirm creates; the fresh "Done"
                // message built from the confirm response carries the real link.
                undefined
              : viewHrefFor(p.domain, p.targetId)
          : undefined,
    }
  })
}

/** Merge completed tool steps with pending confirm rows (pending last). */
export function mergeTrailActions(
  actions: ChatAction[] | undefined,
  pending: PendingAction[] | undefined,
  statusMap: Record<string, 'confirmed' | 'cancelled'>,
): ChatAction[] {
  const completed = withViewHrefs(actions ?? [])
  const pendingRows = pending?.length ? pendingToTrailActions(pending, statusMap) : []
  return [...completed, ...pendingRows]
}
