import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoMoPasteSheet, parsedToDraft } from './MoMoPasteSheet'
import { parseMoMoText } from './momoParser'

describe('parsedToDraft', () => {
  it('maps a parsed message onto a draft tagged as sms', () => {
    const parsed = parseMoMoText('You have sent K250.00 to JOHN MULENGA. Ref: PP123.', {
      now: new Date('2026-07-14T10:00:00Z'),
    })!
    const draft = parsedToDraft(parsed)
    expect(draft).toMatchObject({
      type: 'expense',
      amount_minor: 25000,
      merchant: 'JOHN MULENGA',
      source: 'sms',
    })
    expect(draft.description).toContain('PP123')
  })
})

describe('MoMoPasteSheet', () => {
  function setup() {
    const onParsed = vi.fn()
    const onFallbackToAi = vi.fn()
    render(
      <MoMoPasteSheet
        open
        onOpenChange={() => {}}
        onParsed={onParsed}
        onFallbackToAi={onFallbackToAi}
      />,
    )
    return { onParsed, onFallbackToAi }
  }

  it('parses a recognised message and emits a draft', async () => {
    const user = userEvent.setup()
    const { onParsed, onFallbackToAi } = setup()

    await user.type(
      screen.getByRole('textbox'),
      'You have received K500.00 from MARY BANDA. Balance K1,750.00.',
    )
    await user.click(screen.getByRole('button', { name: /read message/i }))

    expect(onParsed).toHaveBeenCalledOnce()
    expect(onParsed.mock.calls[0][0]).toMatchObject({ type: 'income', amount_minor: 50000 })
    expect(onFallbackToAi).not.toHaveBeenCalled()
  })

  it('offers the AI fallback when the message is unrecognised', async () => {
    const user = userEvent.setup()
    const { onParsed, onFallbackToAi } = setup()

    await user.type(screen.getByRole('textbox'), 'just some random note about nothing')
    await user.click(screen.getByRole('button', { name: /read message/i }))

    expect(onParsed).not.toHaveBeenCalled()
    const aiButton = await screen.findByRole('button', { name: /ask penda to read it/i })
    await user.click(aiButton)
    expect(onFallbackToAi).toHaveBeenCalledOnce()
  })
})
