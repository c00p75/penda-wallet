import { describe, expect, it } from 'vitest'
import { detectFamilyCompanionTips } from './familyCompanion'

describe('detectFamilyCompanionTips', () => {
  it('stays quiet outside family mode', () => {
    expect(
      detectFamilyCompanionTips({
        mode: 'individual',
        currency: 'ZMW',
        allowances: [
          { id: 'a1', name: 'Kids allowance', current_amount_minor: 90000, target_amount_minor: 100000 },
        ],
      }),
    ).toEqual([])
  })

  it('flags a nearly spent allowance', () => {
    const tips = detectFamilyCompanionTips({
      mode: 'family',
      currency: 'ZMW',
      allowances: [
        { id: 'a1', name: 'Kids allowance', current_amount_minor: 90000, target_amount_minor: 100000 },
      ],
    })
    expect(tips[0]!.text).toContain('Kids allowance')
    expect(tips[0]!.href).toBe('/family')
  })

  it('flags settle-up balances', () => {
    const tips = detectFamilyCompanionTips({
      mode: 'family',
      currency: 'ZMW',
      allowances: [],
      settleBalances: [{ name: 'Amara', netMinor: 25000 }],
    })
    expect(tips[0]!.text).toContain('Amara')
    expect(tips[0]!.href).toBe('/settle-up')
  })
})
