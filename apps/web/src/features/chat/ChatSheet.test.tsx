import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChatSheet } from './ChatSheet'
import type { ChatResponse, ConfirmActionResponse } from './types'

const { sendMock, confirmMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  confirmMock: vi.fn(),
}))

// ChatSheet reaches for network/media-backed hooks; stub them so we can render
// it and assert what the user actually sees.
vi.mock('./hooks', () => ({
  useSendChatMessage: () => ({ mutateAsync: sendMock, isPending: false }),
  useConfirmAiAction: () => ({ mutateAsync: confirmMock, isPending: false }),
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

function reply(overrides: Partial<ChatResponse>): ChatResponse {
  return { conversationId: 'c1', reply: 'Okay.', transaction: null, ...overrides }
}

async function send(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

beforeEach(() => {
  sendMock.mockReset()
  confirmMock.mockReset()
})

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

describe('ChatSheet staged edit/delete confirmation', () => {
  const pending = {
    id: 'a1',
    kind: 'update' as const,
    domain: 'transaction',
    summary: 'Update the expense of K10.00 — amount: K10.00 → K15.00.',
  }

  it('shows a confirm card when the reply stages an update, and does not claim it is done', async () => {
    sendMock.mockResolvedValue(reply({ reply: 'Want me to change it to K15?', pendingActions: [pending] }))
    renderSheet('ZMW')

    await send('actually it was K15 not K10')

    expect(await screen.findByText(pending.summary)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // Nothing is applied until the user taps.
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('applies the change only when the user confirms', async () => {
    sendMock.mockResolvedValue(reply({ pendingActions: [pending] }))
    confirmMock.mockResolvedValue({
      ok: true,
      status: 'confirmed',
      domain: 'transaction',
      summary: pending.summary,
    } satisfies ConfirmActionResponse)
    renderSheet('ZMW')

    await send('fix it')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith({ actionId: 'a1', decision: 'confirm' }),
    )
    expect(await screen.findByText('Applied')).toBeInTheDocument()
    expect(screen.getByText(/^Done —/)).toBeInTheDocument()
  })

  it('does not apply the change when the user cancels', async () => {
    sendMock.mockResolvedValue(reply({ pendingActions: [pending] }))
    confirmMock.mockResolvedValue({
      ok: false,
      status: 'cancelled',
      domain: 'transaction',
      summary: pending.summary,
    } satisfies ConfirmActionResponse)
    renderSheet('ZMW')

    await send('never mind')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith({ actionId: 'a1', decision: 'cancel' }),
    )
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })
})
