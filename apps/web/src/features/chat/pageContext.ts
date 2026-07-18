/** Closed allowlist of pages that may be sent as chat pageContext. */
export const CHAT_PAGES = [
  'home',
  'ledger',
  'budgets',
  'goals',
  'goal-detail',
  'cashflow',
  'challenges',
  'analytics',
  'journal',
  'simulator',
  'settings',
  'profile',
  'business',
  'missions',
  'activity',
  'notifications',
  'ai-actions',
  'family',
  'settle-up',
] as const

export type ChatPage = (typeof CHAT_PAGES)[number]

export interface PageContext {
  page: ChatPage
  entityId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function pageContextFromPathname(pathname: string): PageContext | undefined {
  if (pathname === '/') return { page: 'home' }
  if (pathname === '/transactions') return { page: 'ledger' }
  if (pathname === '/budgets') return { page: 'budgets' }
  if (pathname === '/goals') return { page: 'goals' }
  const goalMatch = pathname.match(/^\/goals\/([^/]+)$/)
  if (goalMatch) {
    const entityId = goalMatch[1]
    return UUID_RE.test(entityId) ? { page: 'goal-detail', entityId } : { page: 'goals' }
  }
  if (pathname === '/cashflow') return { page: 'cashflow' }
  if (pathname === '/challenges') return { page: 'challenges' }
  if (pathname === '/analytics') return { page: 'analytics' }
  if (pathname === '/journal') return { page: 'journal' }
  if (pathname === '/simulator') return { page: 'simulator' }
  if (pathname === '/settings') return { page: 'settings' }
  if (pathname === '/profile') return { page: 'profile' }
  if (pathname === '/business') return { page: 'business' }
  if (pathname === '/missions') return { page: 'missions' }
  if (pathname === '/activity') return { page: 'activity' }
  if (pathname === '/notifications') return { page: 'notifications' }
  if (pathname === '/ai-actions') return { page: 'ai-actions' }
  if (pathname === '/family') return { page: 'family' }
  if (pathname === '/settle-up') return { page: 'settle-up' }
  return undefined
}

export function isValidPageContext(value: unknown): value is PageContext {
  if (!value || typeof value !== 'object') return false
  const v = value as { page?: unknown; entityId?: unknown }
  if (typeof v.page !== 'string' || !(CHAT_PAGES as readonly string[]).includes(v.page)) return false
  if (v.entityId != null && (typeof v.entityId !== 'string' || !UUID_RE.test(v.entityId))) return false
  return true
}
