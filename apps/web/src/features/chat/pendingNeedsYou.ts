import type { ChatMessage, PendingAction } from './types'

export type NeedsYouItem = {
  messageId: string
  action: PendingAction
  preview: string
}

interface StoredChat {
  messages?: ChatMessage[]
  actionStatus?: Record<string, 'confirmed' | 'cancelled'>
}

function storageKeyFor(walletId: string) {
  return `penda:chat:${walletId}`
}

/** Pending AI confirms the user still owes a Yes/Cancel on, surfaced on Home. */
export function loadNeedsYou(walletId: string | undefined): NeedsYouItem[] {
  if (!walletId) return []
  try {
    const raw = localStorage.getItem(storageKeyFor(walletId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredChat
    const status = parsed.actionStatus ?? {}
    const items: NeedsYouItem[] = []
    for (const message of parsed.messages ?? []) {
      for (const action of message.pendingActions ?? []) {
        if (status[action.id]) continue
        items.push({
          messageId: message.id,
          action,
          preview: action.summary || 'Confirm a change',
        })
      }
    }
    return items.slice(0, 5)
  } catch {
    return []
  }
}
