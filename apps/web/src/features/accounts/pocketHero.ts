import type { HeroTone } from '@/components/ui/hero-card'
import type { Account, AccountKind } from './types'

export function pocketHeroTone(kind: AccountKind): HeroTone {
  if (kind === 'cash') return 'mint'
  if (kind === 'mobile_money') return 'iris'
  if (kind === 'bank') return 'apricot'
  return 'sun'
}

export function pocketBalanceLabel(account: Account): string {
  return account.is_default ? `${account.name} · Default` : account.name
}
