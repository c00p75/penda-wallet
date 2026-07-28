import { describe, expect, it } from 'vitest'
import { sanitizeUiEdits } from './uiEdits'

describe('sanitizeUiEdits', () => {
  it('keeps valid domain/summary pairs and drops junk', () => {
    expect(
      sanitizeUiEdits([
        { domain: 'budget', summary: '  Dog food set to K800  ' },
        { domain: 'nope', summary: 'x' },
        { domain: 'debt', summary: '' },
        { summary: 'missing domain' },
        null,
      ]),
    ).toEqual([{ domain: 'budget', summary: 'Dog food set to K800' }])
  })

  it('caps length and count', () => {
    const long = 'x'.repeat(300)
    expect(sanitizeUiEdits([{ domain: 'goal', summary: long }])[0]?.summary).toHaveLength(200)
    const many = Array.from({ length: 30 }, (_, i) => ({
      domain: 'budget' as const,
      summary: `edit ${i}`,
    }))
    expect(sanitizeUiEdits(many)).toHaveLength(20)
  })
})
