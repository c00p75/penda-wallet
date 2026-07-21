import type { QueryClient } from '@tanstack/react-query'
import { fetchBudget, fetchBudgets } from '@/features/budgets/api'
import type { Budget } from '@/features/budgets/types'
import { fetchDebt, fetchDebts } from '@/features/debts/api'
import type { Debt } from '@/features/debts/types'
import { fetchSavingsGoal, fetchSavingsGoals } from '@/features/goals/api'
import type { SavingsGoal } from '@/features/goals/types'
import { fetchTransaction, fetchTransactions } from '@/features/transactions/api'
import type { Transaction } from '@/features/transactions/types'

export type PendaOpenKind = 'transaction' | 'budget' | 'debt' | 'goal'

export type PendaOpenState = {
  pendaOpen?: { kind: PendaOpenKind; id: string }
}

export type ParsedViewHref = {
  kind?: PendaOpenKind
  id?: string
}

export type ViewEntity = Transaction | Budget | Debt | SavingsGoal

/**
 * Entity kinds with a detail/edit sheet. View opens these on top of chat.
 * Hub-only links (journal, analytics, list pages without an id) still navigate.
 */
export const IN_CHAT_VIEW_KINDS = ['transaction', 'budget', 'debt', 'goal'] as const
export type InChatViewKind = (typeof IN_CHAT_VIEW_KINDS)[number]

export function isInChatViewKind(kind: PendaOpenKind | undefined): kind is InChatViewKind {
  return (
    kind === 'transaction' || kind === 'budget' || kind === 'debt' || kind === 'goal'
  )
}

/** Pull entity kind/id out of a chat View href for prefetch + location state. */
export function parseViewHref(href: string): ParsedViewHref {
  try {
    const url = new URL(href, 'http://local.invalid')
    const tx = url.searchParams.get('tx')
    if (url.pathname === '/transactions' && tx) {
      return { kind: 'transaction', id: tx }
    }
    const budget = url.searchParams.get('budget')
    if (url.pathname === '/budgets' && budget) {
      return { kind: 'budget', id: budget }
    }
    const debt = url.searchParams.get('debt')
    if (url.pathname === '/goals' && debt) {
      return { kind: 'debt', id: debt }
    }
    const goalMatch = /^\/goals\/([^/]+)$/.exec(url.pathname)
    if (goalMatch?.[1]) {
      return { kind: 'goal', id: goalMatch[1] }
    }
  } catch {
    /* ignore malformed hrefs */
  }
  return {}
}

export function pendaOpenStateFromHref(href: string): PendaOpenState | undefined {
  const { kind, id } = parseViewHref(href)
  if (!kind || !id) return undefined
  return { pendaOpen: { kind, id } }
}

/** Warm the destination list cache so View can open the item sheet immediately. */
export function prefetchViewHref(
  queryClient: QueryClient,
  walletId: string | undefined,
  href: string,
): void {
  if (!walletId) return
  const { kind } = parseViewHref(href)
  switch (kind) {
    case 'transaction':
      void queryClient.prefetchQuery({
        queryKey: ['transactions', walletId],
        queryFn: () => fetchTransactions(walletId),
      })
      break
    case 'budget':
      void queryClient.prefetchQuery({
        queryKey: ['budgets', walletId],
        queryFn: () => fetchBudgets(walletId),
      })
      break
    case 'debt':
      void queryClient.prefetchQuery({
        queryKey: ['debts', walletId],
        queryFn: () => fetchDebts(walletId),
      })
      break
    case 'goal':
      void queryClient.prefetchQuery({
        queryKey: ['savings-goals', walletId],
        queryFn: () => fetchSavingsGoals(walletId),
      })
      break
    default:
      break
  }
}

export function pendaOpenIdFromLocation(
  state: unknown,
  kind: PendaOpenKind,
): string | null {
  const open = (state as PendaOpenState | null)?.pendaOpen
  if (!open || open.kind !== kind) return null
  return open.id
}

/** Resolve an entity from React Query cache, then a single-row fetch. */
export async function resolveViewEntity(
  queryClient: QueryClient,
  walletId: string,
  kind: InChatViewKind,
  id: string,
): Promise<ViewEntity | null> {
  switch (kind) {
    case 'transaction': {
      const cached = queryClient.getQueryData<Transaction[]>(['transactions', walletId])
      return cached?.find((t) => t.id === id) ?? fetchTransaction(id)
    }
    case 'budget': {
      const cached = queryClient.getQueryData<Budget[]>(['budgets', walletId])
      return cached?.find((b) => b.id === id) ?? fetchBudget(id)
    }
    case 'debt': {
      const cached = queryClient.getQueryData<Debt[]>(['debts', walletId])
      return cached?.find((d) => d.id === id) ?? fetchDebt(id)
    }
    case 'goal': {
      const cached = queryClient.getQueryData<SavingsGoal[]>(['savings-goals', walletId])
      return cached?.find((g) => g.id === id) ?? fetchSavingsGoal(id)
    }
  }
}
