import { CHAT_PAGES, type ChatPage } from '@/features/chat/pageContext'

export interface ExplorablePage {
  page: ChatPage
  /** Matches the app's own nav/menu naming, not necessarily the page's internal name. */
  label: string
  blurb: string
  route: string
  /** ISO date. Only set for pages shipped after this feature existed. */
  addedAt?: string
}

/** Pages that aren't worth nudging users toward exploring. */
const EXCLUDED_PAGES = new Set<ChatPage>([
  'home',
  'settings',
  'profile',
  'notifications',
  'ai-actions',
  'goal-detail',
])

const PAGE_METADATA: Record<Exclude<ChatPage, 'home' | 'settings' | 'profile' | 'notifications' | 'ai-actions' | 'goal-detail'>, Omit<ExplorablePage, 'page'>> = {
  ledger: {
    label: 'Ledger',
    blurb: 'See every transaction laid out in one place.',
    route: '/transactions',
  },
  budgets: {
    label: 'Plan',
    blurb: 'Set spending limits and see how you’re tracking.',
    route: '/budgets',
  },
  goals: {
    label: 'Goals',
    blurb: 'Set a savings target and track your progress.',
    route: '/goals',
  },
  cashflow: {
    label: 'Cashflow',
    blurb: 'See money coming in and going out over time.',
    route: '/cashflow',
  },
  // Labeled "Compete" in the app's own menu, not "Challenges" - keep in sync.
  challenges: {
    label: 'Compete',
    blurb: 'Take on money challenges against friends or yourself.',
    route: '/challenges',
  },
  analytics: {
    label: 'Insights',
    blurb: 'Deeper analytics on your spending patterns.',
    route: '/analytics',
  },
  journal: {
    label: 'Journal',
    blurb: 'A running memory of what Penda’s learned about you.',
    route: '/journal',
  },
  simulator: {
    label: 'Simulator',
    blurb: 'Model what-if scenarios before you commit to them.',
    route: '/simulator',
  },
  business: {
    label: 'Business Hub',
    blurb: 'Track business income and expenses separately.',
    route: '/business',
  },
  missions: {
    label: 'Missions',
    blurb: 'Short-term money missions Penda sets with you.',
    route: '/missions',
  },
  activity: {
    label: 'Activity Log',
    blurb: 'A full history of what Penda’s done on your behalf.',
    route: '/activity',
  },
  family: {
    label: 'Family Hub',
    blurb: 'Share money goals and nudges with your household.',
    route: '/family',
  },
  'settle-up': {
    label: 'Settle Up',
    blurb: 'Split bills and settle up with friends.',
    route: '/settle-up',
  },
  radar: {
    label: 'Money Radar',
    blurb: 'Spot upcoming bills and subscriptions before they hit.',
    route: '/radar',
  },
}

/**
 * Explorable pages, derived from the app's own `CHAT_PAGES` route registry so
 * this list can't drift from the router. `pageRegistry.test.ts` asserts every
 * non-excluded page here has metadata, so a new route without a label fails a
 * test instead of silently never getting nudged.
 */
export const EXPLORABLE_PAGES: ExplorablePage[] = CHAT_PAGES.filter(
  (page): page is keyof typeof PAGE_METADATA => !EXCLUDED_PAGES.has(page) && page in PAGE_METADATA,
).map((page) => ({ page, ...PAGE_METADATA[page] }))
