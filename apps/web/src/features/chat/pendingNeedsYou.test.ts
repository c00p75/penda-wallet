import { beforeEach, describe, expect, it } from 'vitest'
import { loadNeedsYou } from './pendingNeedsYou'

describe('loadNeedsYou', () => {
  beforeEach(() => localStorage.clear())

  it('returns pending actions that are not yet resolved', () => {
    localStorage.setItem(
      'penda:chat:w1',
      JSON.stringify({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            text: 'Ok?',
            pendingActions: [
              {
                id: 'a1',
                kind: 'update',
                domain: 'transaction',
                summary: 'Change coffee to $4',
              },
            ],
          },
        ],
        actionStatus: {},
      }),
    )
    expect(loadNeedsYou('w1')).toEqual([
      expect.objectContaining({ preview: 'Change coffee to $4', messageId: 'm1' }),
    ])
  })

  it('skips confirmed actions', () => {
    localStorage.setItem(
      'penda:chat:w1',
      JSON.stringify({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            text: 'Ok?',
            pendingActions: [
              {
                id: 'a1',
                kind: 'update',
                domain: 'transaction',
                summary: 'Change coffee to $4',
              },
            ],
          },
        ],
        actionStatus: { a1: 'confirmed' },
      }),
    )
    expect(loadNeedsYou('w1')).toEqual([])
  })

  it('skips cancelled actions and returns empty for missing wallet', () => {
    expect(loadNeedsYou(undefined)).toEqual([])
    localStorage.setItem(
      'penda:chat:w1',
      JSON.stringify({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            text: 'Ok?',
            pendingActions: [{ id: 'a1', kind: 'delete', domain: 'goal', summary: 'Remove goal' }],
          },
        ],
        actionStatus: { a1: 'cancelled' },
      }),
    )
    expect(loadNeedsYou('w1')).toEqual([])
  })

  it('caps at 5 pending items and uses a default preview', () => {
    const pendingActions = Array.from({ length: 7 }, (_, i) => ({
      id: `a${i}`,
      kind: 'update' as const,
      domain: 'transaction' as const,
      summary: i === 0 ? '' : `Action ${i}`,
    }))
    localStorage.setItem(
      'penda:chat:w1',
      JSON.stringify({
        messages: [{ id: 'm1', role: 'assistant', text: 'Ok?', pendingActions }],
      }),
    )
    const items = loadNeedsYou('w1')
    expect(items).toHaveLength(5)
    expect(items[0]?.preview).toBe('Confirm a change')
  })

  it('returns empty on corrupt JSON', () => {
    localStorage.setItem('penda:chat:w1', '{')
    expect(loadNeedsYou('w1')).toEqual([])
  })
})
