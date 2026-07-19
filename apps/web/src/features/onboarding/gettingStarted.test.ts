import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildGettingStartedSteps,
  finalizeWalkthroughChecklist,
  isDayZero,
  isGettingStartedComplete,
  isWalkthroughActive,
  loadWalkthrough,
  saveWalkthrough,
  clearWalkthrough,
} from './gettingStarted'

describe('gettingStarted helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('treats zero transactions as day zero', () => {
    expect(isDayZero(0)).toBe(true)
    expect(isDayZero(1)).toBe(false)
  })

  it('marks log done from transactions and balance from reconcile', () => {
    const steps = buildGettingStartedSteps({
      state: { dismissed: false, balanceTouched: false, planPeeked: false },
      hasTransactions: true,
      hasReconciled: true,
    })
    expect(steps.find((s) => s.id === 'log')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'balance')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'plan')?.done).toBe(false)
    expect(isGettingStartedComplete(steps)).toBe(false)
  })

  it('tracks an active walkthrough until done', () => {
    saveWalkthrough('w1', { phase: 'log', skippedLog: false, skippedBalance: false })
    expect(isWalkthroughActive('w1')).toBe(true)
    expect(loadWalkthrough('w1')?.phase).toBe('log')
    saveWalkthrough('w1', { phase: 'done', skippedLog: true, skippedBalance: false })
    expect(isWalkthroughActive('w1')).toBe(false)
    clearWalkthrough('w1')
    expect(loadWalkthrough('w1')).toBeNull()
  })

  it('dismisses residual checklist when nothing was skipped', () => {
    const state = finalizeWalkthroughChecklist('w1', {
      skippedLog: false,
      skippedBalance: false,
      hasTransactions: true,
    })
    expect(state.dismissed).toBe(true)
    expect(state.planPeeked).toBe(true)
  })

  it('keeps residual checklist when log or balance was skipped', () => {
    const state = finalizeWalkthroughChecklist('w1', {
      skippedLog: true,
      skippedBalance: false,
      hasTransactions: false,
    })
    expect(state.dismissed).toBe(false)
    expect(state.balanceTouched).toBe(true)
  })

  it('dismisses residual when log was skipped but transactions already exist', () => {
    const state = finalizeWalkthroughChecklist('w1', {
      skippedLog: true,
      skippedBalance: false,
      hasTransactions: true,
    })
    expect(state.dismissed).toBe(true)
  })

  it('keeps residual when only balance was skipped', () => {
    const state = finalizeWalkthroughChecklist('w1', {
      skippedLog: false,
      skippedBalance: true,
      hasTransactions: true,
    })
    expect(state.dismissed).toBe(false)
    expect(state.balanceTouched).toBe(false)
    expect(state.planPeeked).toBe(true)
  })

  it('marks complete only when every step is done', () => {
    const incomplete = buildGettingStartedSteps({
      state: { dismissed: false, balanceTouched: true, planPeeked: true },
      hasTransactions: false,
      hasReconciled: false,
    })
    expect(isGettingStartedComplete(incomplete)).toBe(false)

    const complete = buildGettingStartedSteps({
      state: { dismissed: false, balanceTouched: true, planPeeked: true },
      hasTransactions: true,
      hasReconciled: false,
    })
    expect(isGettingStartedComplete(complete)).toBe(true)
  })

  it('treats balanceTouched or reconcile as balance done', () => {
    const viaTouch = buildGettingStartedSteps({
      state: { dismissed: false, balanceTouched: true, planPeeked: false },
      hasTransactions: false,
      hasReconciled: false,
    })
    expect(viaTouch.find((s) => s.id === 'balance')?.done).toBe(true)

    const viaReconcile = buildGettingStartedSteps({
      state: { dismissed: false, balanceTouched: false, planPeeked: false },
      hasTransactions: false,
      hasReconciled: true,
    })
    expect(viaReconcile.find((s) => s.id === 'balance')?.done).toBe(true)
  })

  it('rejects corrupt walkthrough payloads', () => {
    localStorage.setItem('penda:onboarding-walkthrough:w1', '{"phase":"nope"}')
    expect(loadWalkthrough('w1')).toBeNull()
    localStorage.setItem('penda:onboarding-walkthrough:w1', '{')
    expect(loadWalkthrough('w1')).toBeNull()
  })
})
