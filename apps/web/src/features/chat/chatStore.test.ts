import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chatStore'

describe('chatStore', () => {
  beforeEach(() =>
    useChatStore.setState({
      open: false,
      prefill: '',
      autoSend: false,
      mode: 'full',
      startRecording: false,
      assistantSeed: '',
      assistantPortrait: null,
      newTopicNonce: 0,
    }),
  )

  it('opens with a prefill from anywhere', () => {
    useChatStore.getState().openChat('I spent ')
    expect(useChatStore.getState()).toMatchObject({
      open: true,
      prefill: 'I spent ',
      mode: 'quick',
    })
  })

  it('defaults the prefill to empty when opened bare', () => {
    useChatStore.getState().openChat()
    expect(useChatStore.getState().prefill).toBe('')
    expect(useChatStore.getState().open).toBe(true)
    expect(useChatStore.getState().mode).toBe('full')
  })

  it('honors explicit mode and startRecording', () => {
    useChatStore.getState().openChat('', { mode: 'quick', startRecording: true })
    expect(useChatStore.getState()).toMatchObject({
      mode: 'quick',
      startRecording: true,
    })
  })

  it('keeps autoSend insight opens in full mode', () => {
    useChatStore.getState().openChat('Tell me more', { autoSend: true })
    expect(useChatStore.getState()).toMatchObject({
      autoSend: true,
      mode: 'full',
    })
  })

  it('closes via setOpen and clears ephemeral flags', () => {
    useChatStore.getState().openChat('x', {
      autoSend: true,
      startRecording: true,
      assistantSeed: 'Hi',
      assistantPortrait: 'drill_sergeant',
    })
    useChatStore.getState().setOpen(false)
    expect(useChatStore.getState()).toMatchObject({
      open: false,
      autoSend: false,
      startRecording: false,
      prefill: '',
      assistantSeed: '',
      assistantPortrait: null,
      mode: 'full',
    })
  })

  it('stores assistantPortrait with the seed and clears both on consume', () => {
    useChatStore.getState().openChat('', {
      mode: 'full',
      assistantSeed: 'Hi, I am Sarge',
      assistantPortrait: 'drill_sergeant',
    })
    expect(useChatStore.getState()).toMatchObject({
      assistantSeed: 'Hi, I am Sarge',
      assistantPortrait: 'drill_sergeant',
    })
    useChatStore.getState().consumeAssistantSeed()
    expect(useChatStore.getState()).toMatchObject({
      assistantSeed: '',
      assistantPortrait: null,
    })
  })

  it('bumps newTopicNonce', () => {
    useChatStore.getState().startNewTopic()
    expect(useChatStore.getState().newTopicNonce).toBe(1)
  })
})
