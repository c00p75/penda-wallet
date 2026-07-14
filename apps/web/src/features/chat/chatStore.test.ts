import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chatStore'

describe('chatStore', () => {
  beforeEach(() => useChatStore.setState({ open: false, prefill: '' }))

  it('opens with a prefill from anywhere', () => {
    useChatStore.getState().openChat('I spent ')
    expect(useChatStore.getState()).toMatchObject({ open: true, prefill: 'I spent ' })
  })

  it('defaults the prefill to empty when opened bare', () => {
    useChatStore.getState().openChat()
    expect(useChatStore.getState().prefill).toBe('')
    expect(useChatStore.getState().open).toBe(true)
  })

  it('closes via setOpen', () => {
    useChatStore.getState().openChat('x')
    useChatStore.getState().setOpen(false)
    expect(useChatStore.getState().open).toBe(false)
  })
})
