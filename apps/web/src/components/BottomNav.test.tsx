import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { useChatStore } from '@/features/chat/chatStore'

function renderNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  beforeEach(() => {
    useChatStore.setState({ open: false, prefill: '', autoSend: false })
  })

  it('shows the four destination tabs flanking the AI button', () => {
    renderNav()
    for (const label of ['Ledger', 'Budgets', 'Goals', 'Analytics']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
  })

  it('opens Penda chat when the center AI button is tapped', () => {
    renderNav()
    expect(useChatStore.getState().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Penda' }))
    expect(useChatStore.getState().open).toBe(true)
  })
})
