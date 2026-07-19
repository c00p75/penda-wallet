/**
 * Client-side mirror of supabase/functions/_shared/aiTrust.ts mutation policy.
 * Keep in sync when changing confirm rules.
 */

export const GRADUATE_THRESHOLD = 10
export const HIGH_IMPACT_AMOUNT_MINOR = 100_000

export type MutationKind = 'update' | 'delete'

export type AiTrust = {
  confirmed_ok: number
  confirmed_undone: number
  auto_loose: boolean
}

export type AiConsent = {
  act_without_confirm: boolean
}

export function mayActWithoutConfirm(consent: AiConsent, trust: AiTrust): boolean {
  return consent.act_without_confirm || trust.auto_loose
}

/** Deletes always confirm; high-impact updates always confirm; else trust/consent. */
export function mayAutoApplyMutation(
  kind: MutationKind,
  consent: AiConsent,
  trust: AiTrust,
  opts?: { highImpact?: boolean },
): boolean {
  if (kind === 'delete') return false
  if (opts?.highImpact) return false
  return mayActWithoutConfirm(consent, trust)
}

export function patchIsHighImpact(
  patch: Record<string, unknown>,
  before: Record<string, unknown>,
  thresholdMinor = HIGH_IMPACT_AMOUNT_MINOR,
): boolean {
  let moneyFieldsChanged = 0
  for (const [key, raw] of Object.entries(patch)) {
    if (key === '__before' || !key.endsWith('_minor')) continue
    moneyFieldsChanged += 1
    const after = Number(raw)
    const prev = Number(before[key])
    if (!Number.isFinite(after)) continue
    const prevSafe = Number.isFinite(prev) ? prev : 0
    if (Math.abs(after - prevSafe) >= thresholdMinor) return true
  }
  return moneyFieldsChanged >= 2
}

export function withSuccessfulConfirm(trust: AiTrust): { trust: AiTrust; graduated: boolean } {
  const next = { ...trust, confirmed_ok: trust.confirmed_ok + 1 }
  const graduated =
    !next.auto_loose && next.confirmed_ok >= GRADUATE_THRESHOLD && next.confirmed_undone === 0
  if (graduated) next.auto_loose = true
  return { trust: next, graduated }
}
