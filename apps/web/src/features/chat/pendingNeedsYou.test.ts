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
})
