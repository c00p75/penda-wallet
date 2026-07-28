import { describe, expect, it } from 'vitest'
import {
  formatMilestoneSuggestionsForPrompt,
  suggestMilestones,
  type MilestoneSuggestion,
} from './suggestMilestones'

function ids(result: MilestoneSuggestion[]): string[] {
  return result.map((s) => s.id)
}

describe('suggestMilestones', () => {
  it('returns soft defaults when signals are thin', () => {
    const result = suggestMilestones({ mode: 'individual', max: 4 })
    expect(result.length).toBeGreaterThan(0)
    expect(ids(result)).toContain('emergency_fund')
    expect(ids(result)).toContain('move_out')
  })

  it('boosts business growth for business mode', () => {
    const result = suggestMilestones({ mode: 'business', max: 4 })
    expect(ids(result)[0]).toBe('start_business')
  })

  it('maps life_event wedding to a wedding milestone', () => {
    const result = suggestMilestones({
      mode: 'couple',
      lifeEventKind: 'wedding',
      max: 4,
    })
    expect(ids(result)[0]).toBe('wedding')
    expect(result[0].confidence).toBeGreaterThan(0.9)
  })

  it('suggests debt_freedom when there is open debt', () => {
    const result = suggestMilestones({
      mode: 'individual',
      hasOpenDebt: true,
      max: 4,
    })
    expect(ids(result)).toContain('debt_freedom')
  })

  it('deduces move_out from high housing share in individual mode', () => {
    const result = suggestMilestones({
      mode: 'individual',
      categorySpend: [
        { categoryName: 'Housing', totalMinor: 60_000 },
        { categoryName: 'Food & Drinks', totalMinor: 20_000 },
        { categoryName: 'Entertainment', totalMinor: 10_000 },
      ],
      max: 4,
    })
    expect(ids(result)).toContain('move_out')
  })

  it('deduces buy_car from high transport share', () => {
    const result = suggestMilestones({
      mode: 'individual',
      categorySpend: [
        { categoryName: 'Transportation', totalMinor: 40_000 },
        { categoryName: 'Food & Drinks', totalMinor: 30_000 },
        { categoryName: 'Housing', totalMinor: 30_000 },
      ],
      textBlob: 'uber bolt fuel petrol',
      max: 4,
    })
    expect(ids(result)).toContain('buy_car')
  })

  it('suppresses milestones already covered by existing goals', () => {
    const result = suggestMilestones({
      mode: 'individual',
      primaryGoals: ['build_emergency_fund'],
      existingGoalNames: ['Emergency buffer', 'Move out deposit'],
      max: 4,
    })
    expect(ids(result)).not.toContain('emergency_fund')
    expect(ids(result)).not.toContain('move_out')
  })

  it('honors primary_goals pay_off_debt', () => {
    const result = suggestMilestones({
      mode: 'individual',
      primaryGoals: ['pay_off_debt'],
      max: 3,
    })
    expect(ids(result)).toContain('debt_freedom')
  })

  it('surfaces education from school keywords in the spend blob', () => {
    const result = suggestMilestones({
      mode: 'family',
      textBlob: 'school fees tuition term 2',
      max: 4,
    })
    expect(ids(result)).toContain('education')
  })

  it('respects max', () => {
    const result = suggestMilestones({ mode: 'individual', max: 2 })
    expect(result.length).toBeLessThanOrEqual(2)
  })
})

describe('formatMilestoneSuggestionsForPrompt', () => {
  it('returns empty string for no suggestions', () => {
    expect(formatMilestoneSuggestionsForPrompt([])).toBe('')
  })

  it('lists labels and reasons without em dashes', () => {
    const text = formatMilestoneSuggestionsForPrompt([
      {
        id: 'move_out',
        label: 'Move out / first place',
        reason: 'Housing is a big slice of spend.',
        suggestedIcon: '🏠',
        confidence: 0.8,
      },
    ])
    expect(text).toContain('Move out / first place')
    expect(text).toContain('Housing is a big slice of spend.')
    expect(text).not.toContain('—')
  })
})
