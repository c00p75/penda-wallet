import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InsightCarousel, type InsightCard } from './InsightCarousel'

const weekRead: InsightCard = {
  id: 'week-read',
  variant: 'read',
  tone: 'default',
  text: 'You’ve spent ZMW 498.00 in the last 7 days.',
}

const tipA: InsightCard = { id: 'a', variant: 'tip', tone: 'default', text: 'Card A' }
const tipB: InsightCard = { id: 'b', variant: 'tip', tone: 'default', text: 'Card B' }

/** The native scroll container InsightCarousel drives via scrollTo/onScroll. */
function getScroller(container: HTMLElement): HTMLElement {
  const el = container.querySelector('section[aria-label="Penda insights"] > div')
  if (!el) throw new Error('scroller not found')
  return el as HTMLElement
}

function stubScrollGeometry(el: HTMLElement, { scrollLeft, clientWidth = 300, scrollWidth = 600 } = {} as {
  scrollLeft: number
  clientWidth?: number
  scrollWidth?: number
}) {
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, configurable: true, writable: true })
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

  describe('auto-advance', () => {
    afterEach(() => {
      vi.useRealTimers()
      // @ts-expect-error - test-only cleanup of a stub we may have added
      delete window.matchMedia
    })

    it('auto-advances to the next card after a few seconds', async () => {
      vi.useFakeTimers()
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      const { container } = render(<InsightCarousel cards={[tipA, tipB]} />)
      stubScrollGeometry(getScroller(container), { scrollLeft: 0 })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })

      expect(scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
    })

    it('wraps back to the first card once the interval reaches the last one', async () => {
      vi.useFakeTimers()
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      const { container } = render(<InsightCarousel cards={[tipA, tipB]} />)
      const scroller = getScroller(container)

      // Simulate the browser having settled the smooth scroll onto the last card.
      stubScrollGeometry(scroller, { scrollLeft: 300 })
      fireEvent.scroll(scroller)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })

      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
    })

    it('pauses auto-advance for a full interval after a manual dot tap', async () => {
      vi.useFakeTimers()
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      const { container } = render(<InsightCarousel cards={[tipA, tipB]} />)
      const scroller = getScroller(container)
      stubScrollGeometry(scroller, { scrollLeft: 0 })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      fireEvent.click(screen.getAllByRole('tab')[1])
      scrollTo.mockClear()
      // Browser settles the manual scroll onto card 2.
      stubScrollGeometry(scroller, { scrollLeft: 300 })
      fireEvent.scroll(scroller)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(scrollTo).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(scrollTo).toHaveBeenCalledTimes(1)
    })

    it('does not auto-advance when the user prefers reduced motion', async () => {
      vi.useFakeTimers()
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      render(<InsightCarousel cards={[tipA, tipB]} />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })

      expect(scrollTo).not.toHaveBeenCalled()
    })
  })

  describe('edge wrap-around', () => {
    it('wraps to the first card when swiping forward past the last one', () => {
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      const { container } = render(<InsightCarousel cards={[tipA, tipB]} />)
      const scroller = getScroller(container)
      stubScrollGeometry(scroller, { scrollLeft: 300 })

      fireEvent.touchStart(scroller, { touches: [{ clientX: 200 }] })
      fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 100 }] })

      expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' })
    })

    it('wraps to the last card when swiping backward past the first one', () => {
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      const { container } = render(<InsightCarousel cards={[tipA, tipB]} />)
      const scroller = getScroller(container)
      stubScrollGeometry(scroller, { scrollLeft: 0 })

      fireEvent.touchStart(scroller, { touches: [{ clientX: 100 }] })
      fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 200 }] })

      expect(scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
    })

    it('ignores a small touch movement that does not cross the swipe threshold', () => {
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      const { container } = render(<InsightCarousel cards={[tipA, tipB]} />)
      const scroller = getScroller(container)
      stubScrollGeometry(scroller, { scrollLeft: 300 })

      fireEvent.touchStart(scroller, { touches: [{ clientX: 200 }] })
      fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 190 }] })

      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('wraps to the first card when scrolling forward past the last one with a wheel gesture', () => {
      const scrollTo = vi.fn()
      Element.prototype.scrollTo = scrollTo
      const { container } = render(<InsightCarousel cards={[tipA, tipB]} />)
      const scroller = getScroller(container)
      stubScrollGeometry(scroller, { scrollLeft: 300 })

      fireEvent.wheel(scroller, { deltaX: 50, deltaY: 0 })

      expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' })
    })
  })
})
