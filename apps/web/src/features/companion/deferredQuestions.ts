export type DeferredQuestionStatus = 'pending' | 'asked' | 'dismissed' | 'answered'

export interface DeferredQuestion {
  id: string
  question: string
  /** Optional context (merchant, amount, tool) for resurfacing. */
  context?: Record<string, unknown>
  status: DeferredQuestionStatus
  createdAt: string
  /** ISO time, don't ask before this. */
  askAfter: string
}

/**
 * Chat is mid-flow (logging, confirming), stash clarifying questions instead
 * of blocking the user.
 */
export function shouldDeferQuestion(opts: {
  hasPendingConfirm: boolean
  isStreaming: boolean
  userSaidBusy?: boolean
}): boolean {
  if (opts.userSaidBusy) return true
  if (opts.hasPendingConfirm) return true
  if (opts.isStreaming) return true
  return false
}

/** Pending questions that are due, oldest first. */
export function dueDeferredQuestions(
  items: DeferredQuestion[],
  now = new Date(),
): DeferredQuestion[] {
  const nowIso = now.toISOString()
  return items
    .filter((q) => q.status === 'pending' && q.askAfter <= nowIso)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function buildDeferPrompt(question: string): string {
  return `I'll ask later: ${question.trim()}`
}

export function parseBusySignal(text: string): boolean {
  return /\b(busy|later|not now|in a meeting|driving|can't talk)\b/i.test(text)
}
