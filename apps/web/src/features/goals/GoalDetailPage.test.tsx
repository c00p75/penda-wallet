import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GoalDetailPage } from './GoalDetailPage'

// The savings-goals query is the only state the redirect logic reads; make it
// controllable per test. Everything else is stubbed so the page can mount as
// far as the early-return guards.
const goalsState: { data: unknown[]; isLoading: boolean; isFetching: boolean } = {
  data: [],
  isLoading: false,
  isFetching: false,
}

vi.mock('./hooks', () => ({
  useSavingsGoals: () => goalsState,
  useContributions: () => ({ data: [] }),
  useAddContribution: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('./api', () => ({ getGoalImageUrl: () => undefined }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/store/authStore', () => ({
  useAuthStore: (sel: (s: { session: unknown }) => unknown) => sel({ session: { user: { id: 'u1' } } }),
}))
vi.mock('@/features/wallets/hooks', () => ({
  useCurrentWallet: () => ({ data: { id: 'w1', base_currency: 'ZMW' } }),
}))
vi.mock('@/features/categories/hooks', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/transactions/hooks', () => ({ useTransactions: () => ({ data: [] }) }))
vi.mock('@/features/pacts/hooks', () => ({
  usePacts: () => ({ data: [] }),
  useCreatePact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/chat/chatStore', () => ({
  useChatStore: (sel: (s: { openChat: () => void }) => unknown) => sel({ openChat: vi.fn() }),
}))

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/goals/${id}`]}>
      <Routes>
        <Route path="/goals/:id" element={<GoalDetailPage />} />
        <Route path="/goals" element={<div>GOALS LIST</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GoalDetailPage redirect guard', () => {
  beforeEach(() => {
    goalsState.data = []
    goalsState.isLoading = false
    goalsState.isFetching = false
  })

  it('does not bounce to the list while the goals cache is still refetching', () => {
    // Opening a freshly-created goal (the chat "View" link): the cached list is
    // stale and doesn't hold the new goal yet, so isLoading is false but a
    // refetch is in flight. The page must wait, not redirect.
    goalsState.isFetching = true
    renderAt('freshly-created-goal')
    expect(screen.queryByText('GOALS LIST')).not.toBeInTheDocument()
  })

  it('redirects to the list once fetching settles and the goal is truly absent', () => {
    goalsState.isFetching = false
    renderAt('missing-goal')
    expect(screen.getByText('GOALS LIST')).toBeInTheDocument()
  })
})
