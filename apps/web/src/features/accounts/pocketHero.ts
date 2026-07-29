import type { HeroTone } from '@/components/ui/hero-card'
import type { Account } from './types'

const HERO_TONES: HeroTone[] = ['mint', 'iris', 'apricot', 'sun', 'rose']

/** Deterministic tone per pocket Type so "Auto" coloring stays varied across arbitrary, user-defined types. */
export function pocketHeroTone(kindId: string | null): HeroTone {
  if (!kindId) return HERO_TONES[0]
  let hash = 0
  for (let i = 0; i < kindId.length; i++) {
    hash = (hash * 31 + kindId.charCodeAt(i)) | 0
  }
  return HERO_TONES[Math.abs(hash) % HERO_TONES.length]
}

export function pocketBalanceLabel(account: Account): string {
  return account.is_default ? `${account.name} · Default` : account.name
}
