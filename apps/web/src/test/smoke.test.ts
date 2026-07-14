import { describe, expect, it } from 'vitest'

// Verifies the Vitest harness itself runs. Real feature tests live next to
// their modules.
describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
