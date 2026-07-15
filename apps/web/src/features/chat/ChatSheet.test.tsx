import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatSheet } from './ChatSheet'

// ChatSheet reaches for network/media-backed hooks; stub them so we can render
// it and assert what the user actually sees.
vi.mock('./hooks', () => ({
  useSendChatMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('./useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({ state: 'idle', supportsLive: false, start: vi.fn(), stop: vi.fn() }),
}))
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: undefined }),
}))
vi.mock('@/lib/useKeyboardInset', () => ({
  useKeyboardInset: () => 0,
}))

function renderSheet(currency: string) {
  return render(<ChatSheet open onOpenChange={() => {}} walletId="w1" currency={currency} />)
}

describe('ChatSheet currency in the UI', () => {
  it('renders the placeholder in Kwacha', () => {
    renderSheet('ZMW')
    expect(screen.getByPlaceholderText('I spent K12 on coffee...')).toBeInTheDocument()
    expect(screen.getByText(/spent K12 on coffee/)).toBeInTheDocument()
  })

  it('renders the placeholder in dollars', () => {
    renderSheet('USD')
    expect(screen.getByPlaceholderText('I spent $12 on coffee...')).toBeInTheDocument()
  })

  it('does not leak a hardcoded dollar sign when a non-dollar currency is set', () => {
    renderSheet('ZMW')
    expect(screen.queryByPlaceholderText(/\$/)).toBeNull()
  })
})
