import { describe, expect, it } from 'vitest'
import { retargetCheckinMessage } from './checkinMessage'

describe('retargetCheckinMessage', () => {
  it('strips any "A note from X:" prefix and renames the speaker', () => {
    const input =
      'A note from Zee: Hey. Zee here with your week (2026-07-12 → 2026-07-19). This week ran short.'
    expect(retargetCheckinMessage(input, 'Musa')).toBe(
      'Hey. Musa here with your week (2026-07-12 → 2026-07-19). This week ran short.',
    )
  })

  it('retargets multi-word persona names', () => {
    expect(
      retargetCheckinMessage('A note from Mama Rose: Mama Rose here. Cut the takeout.', 'Sam'),
    ).toBe('Sam here. Cut the takeout.')
  })

  it('leaves unrelated name mentions alone', () => {
    expect(retargetCheckinMessage('You lent Amara K200 last week.', 'Musa')).toBe(
      'You lent Amara K200 last week.',
    )
  })
})
