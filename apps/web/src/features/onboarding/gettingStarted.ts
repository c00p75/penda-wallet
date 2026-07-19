/** First-run walkthrough + residual Home checklist for skipped steps. */

export type GettingStartedState = {
  /** User hid the card. */
  dismissed: boolean
  /** Completed balance step (or reconciled). */
  balanceTouched: boolean
  /** Completed plan step in onboarding. */
  planPeeked: boolean
}

const DEFAULT_STATE: GettingStartedState = {
  dismissed: false,
  balanceTouched: false,
  planPeeked: false,
}

export type WalkthroughPhase = 'log' | 'balance' | 'plan' | 'done'

export type WalkthroughState = {
  phase: WalkthroughPhase
  skippedLog: boolean
  skippedBalance: boolean
}

function storageKey(walletId: string) {
  return `penda:getting-started:${walletId}`
}

function walkthroughKey(walletId: string) {
  return `penda:onboarding-walkthrough:${walletId}`
}

export function loadGettingStarted(walletId: string): GettingStartedState {
  try {
    const raw = localStorage.getItem(storageKey(walletId))
    if (!raw) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw) as Partial<GettingStartedState>
    return {
      dismissed: !!parsed.dismissed,
      balanceTouched: !!parsed.balanceTouched,
      planPeeked: !!parsed.planPeeked,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveGettingStarted(walletId: string, state: GettingStartedState) {
  try {
    localStorage.setItem(storageKey(walletId), JSON.stringify(state))
  } catch {
    // Private mode / quota: checklist is best-effort.
  }
}

export function patchGettingStarted(
  walletId: string,
  patch: Partial<GettingStartedState>,
): GettingStartedState {
  const next = { ...loadGettingStarted(walletId), ...patch }
  saveGettingStarted(walletId, next)
  return next
}

export function loadWalkthrough(walletId: string): WalkthroughState | null {
  try {
    const raw = localStorage.getItem(walkthroughKey(walletId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WalkthroughState>
    if (parsed.phase !== 'log' && parsed.phase !== 'balance' && parsed.phase !== 'plan' && parsed.phase !== 'done') {
      return null
    }
    return {
      phase: parsed.phase,
      skippedLog: !!parsed.skippedLog,
      skippedBalance: !!parsed.skippedBalance,
    }
  } catch {
    return null
  }
}

export function saveWalkthrough(walletId: string, state: WalkthroughState) {
  try {
    localStorage.setItem(walkthroughKey(walletId), JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function clearWalkthrough(walletId: string) {
  try {
    localStorage.removeItem(walkthroughKey(walletId))
  } catch {
    // ignore
  }
}

export function isWalkthroughActive(walletId: string): boolean {
  const state = loadWalkthrough(walletId)
  return !!state && state.phase !== 'done'
}

/**
 * After the interactive onboarding walkthrough, leave a residual checklist
 * only when the user skipped log or balance. Otherwise dismiss it.
 */
export function finalizeWalkthroughChecklist(
  walletId: string,
  input: { skippedLog: boolean; skippedBalance: boolean; hasTransactions: boolean },
): GettingStartedState {
  const needsResidual =
    (input.skippedLog && !input.hasTransactions) || input.skippedBalance
  return patchGettingStarted(walletId, {
    dismissed: !needsResidual,
    balanceTouched: !input.skippedBalance,
    planPeeked: true,
  })
}

export type GettingStartedStepId = 'log' | 'balance' | 'plan'

export type GettingStartedStep = {
  id: GettingStartedStepId
  title: string
  detail: string
  done: boolean
}

export function buildGettingStartedSteps(input: {
  state: GettingStartedState
  hasTransactions: boolean
  hasReconciled: boolean
}): GettingStartedStep[] {
  const balanceDone = input.state.balanceTouched || input.hasReconciled
  return [
    {
      id: 'log',
      title: 'Log a purchase',
      detail: 'Tell Penda what you spent, typing or voice.',
      done: input.hasTransactions,
    },
    {
      id: 'balance',
      title: 'Set your balance',
      detail: 'Share what you actually have so the numbers stay honest.',
      done: balanceDone,
    },
    {
      id: 'plan',
      title: 'Peek at your plan',
      detail: 'Starter budgets are ready. Tweak them anytime.',
      done: input.state.planPeeked,
    },
  ]
}

export function isGettingStartedComplete(steps: GettingStartedStep[]): boolean {
  return steps.every((s) => s.done)
}

/** True while the wallet has no history yet. */
export function isDayZero(transactionCount: number): boolean {
  return transactionCount === 0
}
