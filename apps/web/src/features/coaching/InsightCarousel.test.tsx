import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InsightCarousel, type InsightCard } from './InsightCarousel'

const weekRead: InsightCard = {
  id: 'week-read',
  variant: 'read',
  tone: 'default',
  text: 'You’ve spent ZMW 498.00 in the last 7 days.',
}

describe('InsightCarousel', () => {
  it('renders the weekly read as the leading card', () => {
    render(<InsightCarousel cards={[weekRead]} />)
    expect(screen.getByText(/spent ZMW 498\.00 in the last 7 days/i)).toBeInTheDocument()
  })

  it('shows no page dots when there is a single card', () => {
    render(<InsightCarousel cards={[weekRead]} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('renders tip cards with a short headline and muted body', () => {
    const cards: InsightCard[] = [
      weekRead,
      { id: 'tip', variant: 'tip', tone: 'warm', label: 'Pro tip:', text: 'Nice movie night money.' },
    ]
    render(<InsightCarousel cards={cards} />)
    expect(screen.getByText('Pro tip')).toBeInTheDocument()
    expect(screen.getByText(/Nice movie night money/)).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('fires the card action when its button is tapped', async () => {
    const user = userEvent.setup()
    const onTap = vi.fn()
    const cards: InsightCard[] = [
      weekRead,
      {
        id: 'tip',
        variant: 'tip',
        tone: 'warm',
        label: 'Pro tip:',
        text: 'Fund your goal.',
        action: { label: 'See goals', onTap },
      },
    ]
    render(<InsightCarousel cards={cards} />)
    await user.click(screen.getByRole('button', { name: /see goals/i }))
    expect(onTap).toHaveBeenCalledOnce()
  })

  it('renders brief secondary copy and pill CTAs on the lead card', async () => {
    const user = userEvent.setup()
    const primary = vi.fn()
    const secondary = vi.fn()
    const cards: InsightCard[] = [
      {
        ...weekRead,
        secondary: 'Cash is stretched. Let’s find the leak together.',
        actions: [
          { label: 'What should I do?', onTap: primary },
          { label: 'Log a purchase', variant: 'outline', onTap: secondary },
        ],
      },
    ]
    render(<InsightCarousel cards={cards} />)
    expect(screen.getByText(/Cash is stretched/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'What should I do?' }))
    await user.click(screen.getByRole('button', { name: 'Log a purchase' }))
    expect(primary).toHaveBeenCalledOnce()
    expect(secondary).toHaveBeenCalledOnce()
  })

  it('renders nothing when given no cards', () => {
    const { container } = render(<InsightCarousel cards={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
