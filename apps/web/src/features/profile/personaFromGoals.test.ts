import { describe, expect, it } from 'vitest'
import { personaFromGoals } from './personaFromGoals'

describe('personaFromGoals', () => {
  it('defaults to balanced_coach when no goals are selected', () => {
    expect(personaFromGoals([])).toBe('balanced_coach')
  })

  it('maps each single goal to its persona', () => {
    expect(personaFromGoals(['pay_off_debt'])).toBe('drill_sergeant')
    expect(personaFromGoals(['track_spending'])).toBe('analyst')
    expect(personaFromGoals(['save_for_something'])).toBe('hustler')
    expect(personaFromGoals(['build_emergency_fund'])).toBe('balanced_coach')
  })

  it('picks the highest-priority goal when several are selected', () => {
    expect(personaFromGoals(['build_emergency_fund', 'pay_off_debt'])).toBe('drill_sergeant')
    expect(personaFromGoals(['save_for_something', 'track_spending'])).toBe('analyst')
    expect(personaFromGoals(['build_emergency_fund', 'save_for_something'])).toBe('hustler')
  })

  it('ignores selection order for priority', () => {
    expect(personaFromGoals(['track_spending', 'pay_off_debt'])).toBe('drill_sergeant')
    expect(personaFromGoals(['pay_off_debt', 'track_spending'])).toBe('drill_sergeant')
  })
})
