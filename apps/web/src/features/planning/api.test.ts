import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, deleteEqMock } = vi.hoisted(() => {
  const deleteEqMock = vi.fn().mockResolvedValue({ error: null })
  const fromMock = vi.fn(() => ({
    delete: () => ({ eq: deleteEqMock }),
  }))
  return { fromMock, deleteEqMock }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: fromMock },
}))

import { deleteSpendingPlan } from './api'

describe('deleteSpendingPlan', () => {
  beforeEach(() => {
    fromMock.mockClear()
    deleteEqMock.mockClear()
    deleteEqMock.mockResolvedValue({ error: null })
  })

  it('deletes the spending plan by id', async () => {
    await deleteSpendingPlan('plan-1')
    expect(fromMock).toHaveBeenCalledWith('spending_plans')
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'plan-1')
  })

  it('throws when supabase returns an error', async () => {
    deleteEqMock.mockResolvedValueOnce({ error: new Error('not owner') })
    await expect(deleteSpendingPlan('plan-1')).rejects.toThrow('not owner')
  })
})
