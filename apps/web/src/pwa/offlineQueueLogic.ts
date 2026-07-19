/** Pure helpers for offline queue caps, ordering, and idempotent flush. */

export const MAX_PENDING_CHAT = 10
export const MAX_PENDING_AI_CONFIRMS = 20

export function assertUnderCap(count: number, max: number, label: string): void {
  if (count >= max) {
    throw new Error(`Too many queued ${label}, reconnect and try again.`)
  }
}

/** Ids of prior queued confirms for the same action (latest decision wins). */
export function confirmIdsToReplace(
  existing: Array<{ id: string; action_id: string }>,
  actionId: string,
): string[] {
  return existing.filter((item) => item.action_id === actionId).map((item) => item.id)
}

export function sortByQueuedAt<T extends { queued_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.queued_at < b.queued_at ? -1 : a.queued_at > b.queued_at ? 1 : 0))
}

export function totalPendingCount(tx: number, chat: number, confirms: number): number {
  return tx + chat + confirms
}

/**
 * True when a confirm flush failure should drop the queue item instead of
 * retrying forever (already resolved / lost race / gone).
 */
export function shouldDropFailedAiConfirm(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /already resolved|no longer exists|not found|404|409/i.test(message)
}
