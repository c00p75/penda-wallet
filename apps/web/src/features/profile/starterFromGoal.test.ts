import { describe, expect, it } from 'vitest'
import { starterGoalFromPrimary } from './starterFromGoal'

describe('starterGoalFromPrimary', () => {
  it('seeds an emergency fund goal', () => {
    const g = starterGoalFromPrimary('build_emergency_fund')
    expect(g?.name).toBe('Emergency fund')
    expect(g?.target_amount_minor).toBeGreaterThan(0)
  })

  it('seeds a generic save goal', () => {
    expect(starterGoalFromPrimary('save_for_something')?.name).toBe('My savings goal')
  })

  it('seeds a track-spending reminder goal', () => {
    expect(starterGoalFromPrimary('track_spending')?.name).toBe('Know where it goes')
  })

  it('skips debt (seeded as a debt row) and null', () => {
    expect(starterGoalFromPrimary('pay_off_debt')).toBeNull()
    expect(starterGoalFromPrimary(null)).toBeNull()
  })
})
