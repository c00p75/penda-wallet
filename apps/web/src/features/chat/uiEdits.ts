/** A money-record change made in the app UI (e.g. View sheet) during a chat. */
export interface UiEdit {
  domain: 'transaction' | 'budget' | 'debt' | 'goal' | 'recurring' | 'pact' | 'category'
  /** Short human summary for the model, e.g. "Dog food budget set to K800". */
  summary: string
}

const UI_EDIT_DOMAINS = new Set<UiEdit['domain']>([
  'transaction',
  'budget',
  'debt',
  'goal',
  'recurring',
  'pact',
  'category',
])

/** Clamp / validate client uiEdits before sending to chat-message. */
export function sanitizeUiEdits(raw: unknown): UiEdit[] {
  if (!Array.isArray(raw)) return []
  const out: UiEdit[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const domain = (item as { domain?: unknown }).domain
    const summary = (item as { summary?: unknown }).summary
    if (typeof domain !== 'string' || !UI_EDIT_DOMAINS.has(domain as UiEdit['domain'])) continue
    if (typeof summary !== 'string') continue
    const cleaned = summary.trim().slice(0, 200)
    if (!cleaned) continue
    out.push({ domain: domain as UiEdit['domain'], summary: cleaned })
    if (out.length >= 20) break
  }
  return out
}
