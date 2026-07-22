import { describe, expect, it } from 'vitest'
import { buildBalanceOpener, buildLogOpener, buildPlanOpener } from './walkthroughChat'

const NO_EM_DASH = /^[^—]*$/

describe('walkthrough openers', () => {
  describe('buildLogOpener', () => {
    it('introduces the persona and sells the "just talk" promise', () => {
      const opener = buildLogOpener({
        personality: 'balanced_coach',
        goals: [],
        currency: 'USD',
      })
      expect(opener).toContain('Amara')
      expect(opener.toLowerCase()).toContain('no spreadsheets')
    })

    it('speaks in character and names selected goals', () => {
      const opener = buildLogOpener({
        personality: 'drill_sergeant',
        goals: ['pay_off_debt', 'build_emergency_fund'],
        currency: 'USD',
      })
      expect(opener).toContain('Sarge')
      expect(opener.toLowerCase()).toContain('blunt')
      expect(opener.toLowerCase()).toContain('pay off debt')
      expect(opener.toLowerCase()).toContain('emergency fund')
    })

    it('guides with a concrete, currency-aware example', () => {
      expect(
        buildLogOpener({ personality: 'balanced_coach', goals: [], currency: 'USD' }),
      ).toContain('$4')
      expect(
        buildLogOpener({ personality: 'balanced_coach', goals: [], currency: 'ZMW' }),
      ).toMatch(/K4/)
    })

    it('never uses an em dash', () => {
      expect(
        buildLogOpener({
          personality: 'angry_mom',
          goals: ['track_spending'],
          currency: 'USD',
        }),
      ).toMatch(NO_EM_DASH)
    })
  })

  describe('buildBalanceOpener', () => {
    it('sells trust and asks for the real balance with an example', () => {
      const opener = buildBalanceOpener('USD')
      expect(opener.toLowerCase()).toContain('safe-to-spend')
      expect(opener).toContain('$1,200')
    })

    it('never uses an em dash', () => {
      expect(buildBalanceOpener('USD')).toMatch(NO_EM_DASH)
    })
  })

  describe('buildPlanOpener', () => {
    it('lists the drafted budgets and invites tweaks', () => {
      const opener = buildPlanOpener(
        [
          { label: 'Food', amount: 20_000 },
          { label: 'Transport', amount: 10_000 },
        ],
        'USD',
      )
      expect(opener).toContain('Food')
      expect(opener).toContain('Transport')
      expect(opener).toMatch(/looks good/)
    })

    it('asks for income and payday so Penda can plan around it', () => {
      const opener = buildPlanOpener([{ label: 'Food', amount: 20_000 }], 'USD')
      expect(opener.toLowerCase()).toContain('earn')
      expect(opener.toLowerCase()).toContain('paid')
    })

    it('falls back to the Plan tab when budgets are not seeded yet', () => {
      const opener = buildPlanOpener([], 'USD')
      expect(opener).toMatch(/Plan tab/)
      expect(opener.toLowerCase()).toContain('paid')
    })

    it('never uses an em dash', () => {
      expect(buildPlanOpener([{ label: 'Food', amount: 20_000 }], 'USD')).toMatch(NO_EM_DASH)
    })
  })
})
