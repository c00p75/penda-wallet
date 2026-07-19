/** Canonical corpus lives in @penda/money-core; this re-exports smoke coverage. */
import { describe, expect, it } from 'vitest'
import { parseMoMoText } from '@penda/money-core'

describe('parseMoMoText (web re-export)', () => {
  it('parses a send via the shared package', () => {
    const r = parseMoMoText('You have sent K250.00 to JOHN MULENGA. Fee: K5.00.', {
      now: new Date('2026-07-14T10:00:00Z'),
    })
    expect(r?.amountMinor).toBe(25000)
    expect(r?.type).toBe('expense')
  })
})
