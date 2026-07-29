/** Ordering helpers for the home carousel (pockets + summary cards), backed by `profile.home_card_order`. */

export function pocketCardId(accountId: string): string {
  return `pocket:${accountId}`
}

/**
 * Applies a saved order on top of the cards currently eligible to show.
 * Ids no longer eligible (archived pocket, summary card that stopped applying) are dropped;
 * ids never seen before (new pocket, newly-applicable summary card) are appended at the end.
 */
export function resolveCardOrder(defaultIds: string[], savedOrder: string[]): string[] {
  const savedValid = savedOrder.filter((id) => defaultIds.includes(id))
  const missing = defaultIds.filter((id) => !savedValid.includes(id))
  return [...savedValid, ...missing]
}

/** Moves one card id to the front of a saved order, keeping the rest in place. */
export function moveCardToFront(savedOrder: string[], id: string): string[] {
  return [id, ...savedOrder.filter((existing) => existing !== id)]
}
