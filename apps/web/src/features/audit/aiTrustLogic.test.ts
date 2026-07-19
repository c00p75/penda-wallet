import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AI_CONSENT,
  DEFAULT_AI_TRUST,
  GRADUATE_THRESHOLD,
  HIGH_IMPACT_AMOUNT_MINOR,
  consentAfterUndo,
  mayActWithoutConfirm,
  mayAutoApplyMutation,
  normalizeAiConsent,
  normalizeAiTrust,
  patchIsHighImpact,
  withSuccessfulConfirm,
  withUndo,
} from './aiTrustLogic'

describe('normalizeAiTrust / normalizeAiConsent', () => {
  it('fills defaults and clamps negatives', () => {
    expect(normalizeAiTrust(null)).toEqual(DEFAULT_AI_TRUST)
    expect(normalizeAiTrust({ confirmed_ok: -3, confirmed_undone: 'x', auto_loose: 1 })).toEqual({
      confirmed_ok: 0,
      confirmed_undone: 0,
      auto_loose: true,
    })
  })

  it('defaults consent flags correctly', () => {
    expect(normalizeAiConsent(null)).toEqual(DEFAULT_AI_CONSENT)
    expect(normalizeAiConsent({ auto_log_sms: false, act_without_confirm: true })).toMatchObject({
      auto_log_sms: false,
      act_without_confirm: true,
      parse_clipboard: true,
      unprompted_coaching: true,
    })
  })
})

describe('graduation + undo', () => {
  it('graduates at threshold with zero undos', () => {
    const result = withSuccessfulConfirm({
      confirmed_ok: GRADUATE_THRESHOLD - 1,
      confirmed_undone: 0,
      auto_loose: false,
    })
    expect(result.graduated).toBe(true)
    expect(result.trust.auto_loose).toBe(true)
  })

  it('does not graduate when undos exist or already loose', () => {
    expect(
      withSuccessfulConfirm({
        confirmed_ok: GRADUATE_THRESHOLD - 1,
        confirmed_undone: 1,
        auto_loose: false,
      }).graduated,
    ).toBe(false)
    expect(
      withSuccessfulConfirm({
        confirmed_ok: 99,
        confirmed_undone: 0,
        auto_loose: true,
      }).graduated,
    ).toBe(false)
  })

  it('undo increments confirmed_undone and clears auto_loose', () => {
    expect(withUndo({ confirmed_ok: 12, confirmed_undone: 0, auto_loose: true })).toEqual({
      confirmed_ok: 12,
      confirmed_undone: 1,
      auto_loose: false,
    })
  })

  it('consentAfterUndo always revokes act_without_confirm', () => {
    expect(consentAfterUndo({ ...DEFAULT_AI_CONSENT, act_without_confirm: true }).act_without_confirm).toBe(
      false,
    )
  })
})

describe('mayAutoApplyMutation', () => {
  const trusted = {
    consent: { ...DEFAULT_AI_CONSENT, act_without_confirm: true },
    trust: DEFAULT_AI_TRUST,
  }

  it('never auto-applies deletes', () => {
    expect(mayAutoApplyMutation('delete', trusted.consent, trusted.trust)).toBe(false)
  })

  it('never auto-applies high-impact updates', () => {
    expect(mayAutoApplyMutation('update', trusted.consent, trusted.trust, { highImpact: true })).toBe(
      false,
    )
  })

  it('auto-applies small updates when consented or graduated', () => {
    expect(mayAutoApplyMutation('update', trusted.consent, trusted.trust)).toBe(true)
    expect(
      mayAutoApplyMutation('update', DEFAULT_AI_CONSENT, {
        ...DEFAULT_AI_TRUST,
        auto_loose: true,
      }),
    ).toBe(true)
    expect(mayAutoApplyMutation('update', DEFAULT_AI_CONSENT, DEFAULT_AI_TRUST)).toBe(false)
  })

  it('mayActWithoutConfirm is consent OR auto_loose', () => {
    expect(mayActWithoutConfirm(DEFAULT_AI_CONSENT, DEFAULT_AI_TRUST)).toBe(false)
    expect(mayActWithoutConfirm({ ...DEFAULT_AI_CONSENT, act_without_confirm: true }, DEFAULT_AI_TRUST)).toBe(
      true,
    )
  })
})

describe('patchIsHighImpact', () => {
  it('flags a single money field at/above threshold', () => {
    expect(
      patchIsHighImpact(
        { amount_minor: HIGH_IMPACT_AMOUNT_MINOR, __before: {} },
        { amount_minor: 0 },
      ),
    ).toBe(true)
    expect(
      patchIsHighImpact({ amount_minor: HIGH_IMPACT_AMOUNT_MINOR - 1 }, { amount_minor: 0 }),
    ).toBe(false)
  })

  it('flags multi money-field edits even when each delta is small', () => {
    expect(
      patchIsHighImpact(
        { amount_minor: 100, target_amount_minor: 200 },
        { amount_minor: 0, target_amount_minor: 0 },
      ),
    ).toBe(true)
  })

  it('ignores __before and non-_minor keys', () => {
    expect(
      patchIsHighImpact(
        { merchant: 'X', __before: { amount_minor: 0 }, amount_minor: 50 },
        { amount_minor: 0 },
      ),
    ).toBe(false)
  })
})
