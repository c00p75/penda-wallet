import { describe, expect, it } from 'vitest'
import { assistantAskedQuestion, shouldContinueListening } from './voiceConversation'

describe('shouldContinueListening', () => {
  it('continues after a successful voice turn', () => {
    expect(
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: true,
        hasPendingConfirm: false,
        assistantAskedQuestion: false,
      }),
    ).toBe(true)
  })

  it('stops for pending confirms or errors', () => {
    expect(
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: true,
        hasPendingConfirm: true,
        assistantAskedQuestion: true,
      }),
    ).toBe(false)
    expect(
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: true,
        hasPendingConfirm: false,
        assistantAskedQuestion: true,
        error: true,
      }),
    ).toBe(false)
  })
})

describe('assistantAskedQuestion', () => {
  it('detects questions', () => {
    expect(assistantAskedQuestion('Want me to log that?')).toBe(true)
    expect(assistantAskedQuestion('Logged K12 coffee.')).toBe(false)
  })
})
