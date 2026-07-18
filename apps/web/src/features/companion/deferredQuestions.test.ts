import { describe, expect, it } from 'vitest'
import {
  dueDeferredQuestions,
  parseBusySignal,
  shouldDeferQuestion,
} from './deferredQuestions'

describe('shouldDeferQuestion', () => {
  it('defers during confirms, streaming, or busy signal', () => {
    expect(shouldDeferQuestion({ hasPendingConfirm: true, isStreaming: false })).toBe(true)
    expect(shouldDeferQuestion({ hasPendingConfirm: false, isStreaming: true })).toBe(true)
    expect(shouldDeferQuestion({ hasPendingConfirm: false, isStreaming: false, userSaidBusy: true })).toBe(
      true,
    )
    expect(shouldDeferQuestion({ hasPendingConfirm: false, isStreaming: false })).toBe(false)
  })
})

describe('dueDeferredQuestions', () => {
  it('returns pending questions past askAfter', () => {
    const now = new Date('2026-07-18T12:00:00Z')
    const due = dueDeferredQuestions(
      [
        {
          id: '1',
          question: 'Who was that for?',
          status: 'pending',
          createdAt: '2026-07-18T11:00:00Z',
          askAfter: '2026-07-18T11:30:00Z',
        },
        {
          id: '2',
          question: 'Too soon',
          status: 'pending',
          createdAt: '2026-07-18T11:50:00Z',
          askAfter: '2026-07-18T13:00:00Z',
        },
        {
          id: '3',
          question: 'Done',
          status: 'answered',
          createdAt: '2026-07-18T10:00:00Z',
          askAfter: '2026-07-18T10:30:00Z',
        },
      ],
      now,
    )
    expect(due.map((q) => q.id)).toEqual(['1'])
  })
})

describe('parseBusySignal', () => {
  it('detects busy phrases', () => {
    expect(parseBusySignal("I'm busy right now")).toBe(true)
    expect(parseBusySignal('log K12 coffee')).toBe(false)
  })
})
