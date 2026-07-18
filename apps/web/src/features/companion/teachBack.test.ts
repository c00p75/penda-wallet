import { describe, expect, it } from 'vitest'
import { matchTeachBack, parseTeachBackReply } from './teachBack'

describe('matchTeachBack', () => {
  const rules = [
    {
      match_type: 'merchant_contains' as const,
      match_value: 'Uber',
      category_id: 'transport',
      category_name: 'Transport',
    },
  ]

  it('confirms when a rule matched', () => {
    const m = matchTeachBack({
      merchant: 'Uber Trip',
      categoryId: 'transport',
      rules,
      day: '2026-07-18',
    })
    expect(m?.message).toContain('Transport')
    expect(m?.message).toContain('Uber')
    expect(m?.dedupeKey).toContain('uber')
  })

  it('skips already-confirmed keys', () => {
    const key = 'teach-back:merchant_contains:uber:2026-07-18'
    expect(
      matchTeachBack({
        merchant: 'Uber Trip',
        categoryId: 'transport',
        rules,
        day: '2026-07-18',
        confirmedKeys: new Set([key]),
      }),
    ).toBeNull()
  })
})

describe('parseTeachBackReply', () => {
  it('parses yes/no', () => {
    expect(parseTeachBackReply('yes')).toBe('yes')
    expect(parseTeachBackReply('wrong')).toBe('no')
  })
})
