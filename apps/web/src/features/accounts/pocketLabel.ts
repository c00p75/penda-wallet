import type { Account } from './types'

/** Short label for activity subtitles, e.g. "📱 Airtel Money". */
export function pocketLabel(
  accounts: Account[],
  accountId: string | null | undefined,
): string | null {
  if (!accountId) return null
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return null
  return account.icon ? `${account.icon} ${account.name}` : account.name
}
