import { describe, expect, it } from 'vitest'

/** Mirrors graduation rules in supabase/functions/_shared/aiTrust.ts */
const GRADUATE_THRESHOLD = 10

function withSuccessfulConfirm(trust: {
  confirmed_ok: number
  confirmed_undone: number
  auto_loose: boolean
}) {
  const next = { ...trust, confirmed_ok: trust.confirmed_ok + 1 }
  const graduated =
    !next.auto_loose && next.confirmed_ok >= GRADUATE_THRESHOLD && next.confirmed_undone === 0
  if (graduated) next.auto_loose = true
  return { trust: next, graduated }
}

describe('AI trust graduation', () => {
  it('graduates at 10 confirms with no undos', () => {
    let trust = { confirmed_ok: 9, confirmed_undone: 0, auto_loose: false }
    const result = withSuccessfulConfirm(trust)
    expect(result.graduated).toBe(true)
    expect(result.trust.auto_loose).toBe(true)
    expect(result.trust.confirmed_ok).toBe(10)
  })

  it('does not graduate when undos exist', () => {
    const result = withSuccessfulConfirm({
      confirmed_ok: 9,
      confirmed_undone: 1,
      auto_loose: false,
    })
    expect(result.graduated).toBe(false)
    expect(result.trust.auto_loose).toBe(false)
  })
})
