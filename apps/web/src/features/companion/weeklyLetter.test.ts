import { describe, expect, it } from 'vitest'
import { buildWeeklyLetter } from './weeklyLetter'

describe('buildWeeklyLetter', () => {
  it('writes a narrative letter with win + next move', () => {
    const letter = buildWeeklyLetter({
      currency: 'ZMW',
      personaName: 'Amara',
      incomeMinor: 500000,
      expenseMinor: 320000,
      topCategoryName: 'Food',
      topCategoryMinor: 90000,
      winLine: 'You kept the no-takeout pact.',
      leakLine: 'Airtime top-ups added up.',
      nextMove: 'Park K200 toward Emergency fund.',
      periodStart: '2026-07-11',
      periodEnd: '2026-07-18',
    })
    expect(letter.title).toContain('Amara')
    expect(letter.body).toContain('ahead')
    expect(letter.body).toContain('Food')
    expect(letter.body).toContain('no-takeout')
    expect(letter.teaser).toContain('Amara')
    expect(letter.chatSeed).toContain('weekly letter')
  })
})
