/**
 * Pure AI trust / auto-apply rules mirrored from
 * supabase/functions/_shared/aiTrust.ts. Keep in sync with the edge copy.
 */

export interface AiTrust {
  confirmed_ok: number
  confirmed_undone: number
  auto_loose: boolean
}

export interface AiConsent {
  auto_log_sms: boolean
  act_without_confirm: boolean
  parse_clipboard: boolean
  unprompted_coaching: boolean
}

export const DEFAULT_AI_TRUST: AiTrust = {
  confirmed_ok: 0,
  confirmed_undone: 0,
  auto_loose: false,
}

export const GRADUATE_THRESHOLD = 10

/** Money-field delta that always requires a confirm card (aligned with impulse pause). */
export const HIGH_IMPACT_AMOUNT_MINOR = 100_000

export type MutationKind = 'update' | 'delete'

export const DEFAULT_AI_CONSENT: AiConsent = {
  auto_log_sms: true,
  act_without_confirm: false,
  parse_clipboard: true,
  unprompted_coaching: true,
}

export function normalizeAiTrust(raw: unknown): AiTrust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_TRUST }
  const o = raw as Record<string, unknown>
  return {
    confirmed_ok: Math.max(0, Number(o.confirmed_ok) || 0),
    confirmed_undone: Math.max(0, Number(o.confirmed_undone) || 0),
    auto_loose: Boolean(o.auto_loose),
  }
}

export function normalizeAiConsent(raw: unknown): AiConsent {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    auto_log_sms: o.auto_log_sms !== false,
    act_without_confirm: Boolean(o.act_without_confirm),
    parse_clipboard: o.parse_clipboard !== false,
    unprompted_coaching: o.unprompted_coaching !== false,
  }
}

export function mayActWithoutConfirm(consent: AiConsent, trust: AiTrust): boolean {
  return consent.act_without_confirm || trust.auto_loose
}

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
  const next: AiTrust = {
    ...trust,
    confirmed_ok: trust.confirmed_ok + 1,
  }
  const graduated =
    !next.auto_loose && next.confirmed_ok >= GRADUATE_THRESHOLD && next.confirmed_undone === 0
  if (graduated) next.auto_loose = true
  return { trust: next, graduated }
}

export function withUndo(trust: AiTrust): AiTrust {
  return {
    confirmed_ok: trust.confirmed_ok,
    confirmed_undone: trust.confirmed_undone + 1,
    auto_loose: false,
  }
}

/** Consent patch after undo: always revoke act_without_confirm. */
export function consentAfterUndo(consent: AiConsent): AiConsent {
  return { ...consent, act_without_confirm: false }
}
