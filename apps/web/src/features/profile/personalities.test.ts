import { describe, expect, it } from 'vitest'
import {
  PERSONALITIES,
  personalityMeta,
  resolveAiPersonality,
} from './types'

describe('resolveAiPersonality', () => {
  it('keeps active personas', () => {
    expect(resolveAiPersonality('funny_comedian')).toBe('funny_comedian')
    expect(resolveAiPersonality('balanced_coach')).toBe('balanced_coach')
  })

  it('maps retired personas onto the active cast', () => {
    expect(resolveAiPersonality('gen_z')).toBe('funny_comedian')
    expect(resolveAiPersonality('wise_mentor')).toBe('analyst')
    expect(resolveAiPersonality('chill_friend')).toBe('balanced_coach')
    expect(resolveAiPersonality('gogo')).toBe('angry_mom')
  })

  it('falls back for unknown values', () => {
    expect(resolveAiPersonality('not_a_persona')).toBe('balanced_coach')
    expect(resolveAiPersonality(null)).toBe('balanced_coach')
  })
})

describe('PERSONALITIES picker', () => {
  it('exposes six active personas including Bobo, not Zee', () => {
    expect(PERSONALITIES).toHaveLength(6)
    expect(PERSONALITIES.map((p) => p.value)).toEqual([
      'hustler',
      'balanced_coach',
      'analyst',
      'angry_mom',
      'drill_sergeant',
      'funny_comedian',
    ])
    expect(PERSONALITIES.some((p) => p.name === 'Bobo')).toBe(true)
    expect(PERSONALITIES.some((p) => p.name === 'Zee')).toBe(false)
  })

  it('resolves legacy profile values to picker meta', () => {
    expect(personalityMeta('gen_z').name).toBe('Bobo')
    expect(personalityMeta('gogo').name).toBe('Mama Rose')
  })
})
