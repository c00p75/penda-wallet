import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ChatSheet } from './ChatSheet'
import type { ChatResponse, ConfirmActionResponse } from './types'

const { sendMock, confirmMock, streamMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  confirmMock: vi.fn(),
  streamMock: vi.fn(),
}))

// ChatSheet reaches for network/media-backed hooks; stub them so we can render
// it and assert what the user actually sees.
vi.mock('./hooks', () => ({
  useSendChatMessage: () => ({ mutateAsync: sendMock, isPending: false }),
  useConfirmAiAction: () => ({ mutateAsync: confirmMock, isPending: false }),
  invalidateAfterChatResponse: vi.fn(),
}))
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    sendChatMessageStream: streamMock,
  }
})
vi.mock('./useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({ state: 'idle', supportsLive: false, start: vi.fn(), stop: vi.fn() }),
}))
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: undefined }),
}))
vi.mock('@/features/memory/hooks', () => ({
  useMemories: () => ({ data: [] }),
}))
vi.mock('@/features/pacts/hooks', () => ({
  usePacts: () => ({ data: [] }),
}))
vi.mock('@/features/entitlements/hooks', () => ({
  useEntitlement: () => ({ isPremium: true, data: { receipt_scan_preview_used: false } }),
}))
vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => ({ data: [] }),
}))
vi.mock('@/features/receipts/hooks', () => ({
  useUploadReceipt: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/transactions/hooks', () => ({
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmReceiptItems: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/useKeyboardInset', () => ({
  useKeyboardInset: () => 0,
}))
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
    }),
    removeChannel: vi.fn(),
  },
}))
vi.mock('@/pwa/offlineQueue', () => ({
  enqueueChatMessage: vi.fn(),
  enqueueAiConfirm: vi.fn(),
}))
vi.mock('@/store/authStore', () => ({
  useAuthStore: (sel: (s: { session: null }) => unknown) => sel({ session: null }),
}))

function renderSheet(currency: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChatSheet open onOpenChange={() => {}} walletId="w1" currency={currency} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
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
  streamMock.mockReset()
  // Default stream path: deliver whatever sendMock is configured to resolve.
  streamMock.mockImplementation(
    async (
      _walletId: string,
      _message: string,
      _conversationId: string | undefined,
      _pageContext: unknown,
      handlers: { onDone: (r: ChatResponse) => void },
    ) => {
      const result = await sendMock()
      handlers.onDone(result)
    },
  )
  localStorage.clear()
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

describe('ChatSheet auto-send (Penda speaks first)', () => {
  it('sends the seed immediately when autoSend is set, and reports it consumed', async () => {
    sendMock.mockResolvedValue(reply({ reply: 'Here are a few ideas…' }))
    const onConsumed = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ChatSheet
            open
            onOpenChange={() => {}}
            walletId="w1"
            currency="ZMW"
            initialInput="Help me plan my budget"
            autoSend
            onAutoSendConsumed={onConsumed}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(streamMock).toHaveBeenCalled())
    expect(streamMock).toHaveBeenCalledWith(
      'w1',
      'Help me plan my budget',
      undefined,
      undefined,
      expect.any(Object),
      expect.any(AbortSignal),
    )
    // The seed shows as the user's turn and Penda replies first.
    expect(screen.getByText('Help me plan my budget')).toBeInTheDocument()
    expect(await screen.findByText('Here are a few ideas…')).toBeInTheDocument()
    expect(onConsumed).toHaveBeenCalledTimes(1)
    // Fires once, not on every re-render while the sheet is open.
    expect(streamMock).toHaveBeenCalledTimes(1)
  })

  it('only prefills the input (no send) when autoSend is not set', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ChatSheet
            open
            onOpenChange={() => {}}
            walletId="w1"
            currency="ZMW"
            initialInput="I spent K12 on coffee"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('textbox')).toHaveValue('I spent K12 on coffee')
    expect(streamMock).not.toHaveBeenCalled()
  })

  it('does not leave the seed in the input after autoSend is consumed', async () => {
    sendMock.mockResolvedValue(reply({ reply: 'On it.' }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const seed = 'That cash-in is large. Tell me more / what should I do?'
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ChatSheet
            open
            onOpenChange={() => {}}
            walletId="w1"
            currency="ZMW"
            initialInput={seed}
            autoSend
            onAutoSendConsumed={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(streamMock).toHaveBeenCalledTimes(1))
    // Simulate store after consumeAutoSend: autoSend false, prefill may still be set.
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ChatSheet
            open
            onOpenChange={() => {}}
            walletId="w1"
            currency="ZMW"
            initialInput={seed}
            autoSend={false}
            onAutoSendConsumed={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(streamMock).toHaveBeenCalledTimes(1)
  })
})

describe('ChatSheet action trail', () => {
  it('renders durable action rows under the reply and expands details on tap', async () => {
    sendMock.mockResolvedValue(
      reply({
        reply: 'Logged it.',
        actions: [
          {
            id: 't1',
            tool: 'create_transaction',
            domain: 'transaction',
            label: 'Logged expense',
            summary: 'Coffee · K12.00',
            status: 'done',
            viewHref: '/transactions',
            details: { Merchant: 'Coffee', Amount: 'K12.00' },
          },
        ],
      }),
    )
    renderSheet('ZMW')

    await send('spent K12 on coffee')

    expect(await screen.findByText('Logged expense')).toBeInTheDocument()
    expect(screen.getByText('Coffee · K12.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Logged expense/i }))
    expect(await screen.findByText('Merchant')).toBeInTheDocument()
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
  })

  it('shows Undo for creates and auto-applied updates in the trail footer', async () => {
    sendMock.mockResolvedValue(
      reply({
        reply: 'Done — updated and logged.',
        autoApplied: true,
        actions: [
          {
            id: 'pending-auto-1',
            tool: 'update_record',
            domain: 'transaction',
            label: 'Updated',
            summary: 'Amount K10 → K12',
            status: 'done',
            targetId: 'tx1',
          },
          {
            id: 't2',
            tool: 'create_transaction',
            domain: 'transaction',
            label: 'Logged expense',
            summary: 'Snack · K5.00',
            status: 'done',
            targetId: 'tx2',
          },
        ],
      }),
    )
    renderSheet('ZMW')

    await send('fix the amount and log a snack')

    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})

describe('ChatSheet staged edit/delete confirmation', () => {
  const pending = {
    id: 'a1',
    kind: 'update' as const,
    domain: 'transaction',
    summary: 'Update the expense of K10.00, amount: K10.00 → K15.00.',
  }

  it('shows a confirm card when the reply stages an update, and does not claim it is done', async () => {
    sendMock.mockResolvedValue(reply({ reply: 'Want me to change it to K15?', pendingActions: [pending] }))
    renderSheet('ZMW')

    await send('actually it was K15 not K10')

    expect(await screen.findByText(pending.summary)).toBeInTheDocument()
    expect(screen.getByText('Proposed update')).toBeInTheDocument()
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
    expect(screen.getByText(/^Done\. /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
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

describe('ChatSheet failed sends', () => {
  it('shows a Retry action on failure, and retrying resends the same text', async () => {
    // Non-network error so we hit the retry bubble (network errors queue offline).
    // Stream fails, then JSON fallback also fails.
    streamMock.mockRejectedValueOnce(new Error('server busy'))
    sendMock.mockRejectedValueOnce(new Error('server busy'))
    renderSheet('ZMW')

    await send('spent K12 on coffee')
    expect(await screen.findByText('Something went wrong: server busy')).toBeInTheDocument()

    sendMock.mockResolvedValueOnce(reply({ reply: 'Logged it.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Logged it.')).toBeInTheDocument()
    expect(screen.queryByText(/Something went wrong/)).toBeNull()
    expect(streamMock).toHaveBeenLastCalledWith(
      'w1',
      'spent K12 on coffee',
      undefined,
      undefined,
      expect.any(Object),
      expect.any(AbortSignal),
    )
  })
})

describe('ChatSheet suggested prompts', () => {
  it('shows suggested prompts in the empty state, and tapping one sends it', async () => {
    sendMock.mockResolvedValue(reply({ reply: 'Here you go.' }))
    renderSheet('ZMW')

    fireEvent.click(screen.getByRole('button', { name: 'What did I spend this week?' }))

    await waitFor(() =>
      expect(streamMock).toHaveBeenCalledWith(
        'w1',
        'What did I spend this week?',
        undefined,
        undefined,
        expect.any(Object),
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByText('Here you go.')).toBeInTheDocument()
  })
})

describe('ChatSheet markdown-lite rendering', () => {
  it('renders **bold** spans and bullet lists without leaking the raw syntax', async () => {
    sendMock.mockResolvedValue(reply({ reply: '**Great job!**\n- Coffee: K12\n- Lunch: K30' }))
    renderSheet('ZMW')

    await send('what did I spend today')

    const bold = await screen.findByText('Great job!')
    expect(bold.tagName).toBe('STRONG')
    expect(screen.getByText('Coffee: K12')).toBeInTheDocument()
    expect(screen.getByText('Lunch: K30')).toBeInTheDocument()
    expect(screen.queryByText(/\*\*/)).toBeNull()
  })
})

describe('ChatSheet conversation persistence', () => {
  it('persists history across remounts (e.g. a page reload), scoped by wallet', async () => {
    sendMock.mockResolvedValue(reply({ reply: 'Got it.' }))
    const { unmount } = renderSheet('ZMW')

    await send('spent K5 on tea')
    await screen.findByText('Got it.')
    unmount()

    renderSheet('ZMW')
    expect(await screen.findByText('spent K5 on tea')).toBeInTheDocument()
    expect(screen.getByText('Got it.')).toBeInTheDocument()
  })
})
