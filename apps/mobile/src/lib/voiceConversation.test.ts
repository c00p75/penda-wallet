import { describe, expect, it } from 'vitest';
import { assistantAskedQuestion, shouldContinueListening } from './voiceConversation';

describe('shouldContinueListening', () => {
  it('continues only when the assistant asked a question', () => {
    expect(
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: true,
        hasPendingConfirm: false,
        assistantAskedQuestion: true,
      }),
    ).toBe(true);
    expect(
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: true,
        hasPendingConfirm: false,
        assistantAskedQuestion: false,
      }),
    ).toBe(false);
  });

  it('stops for pending confirms, errors, or non-voice turns', () => {
    expect(
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: true,
        hasPendingConfirm: true,
        assistantAskedQuestion: true,
      }),
    ).toBe(false);
    expect(
      shouldContinueListening({
        voiceConversationEnabled: true,
        wasVoiceTurn: true,
        hasPendingConfirm: false,
        assistantAskedQuestion: true,
        error: true,
      }),
    ).toBe(false);
  });
});

describe('assistantAskedQuestion', () => {
  it('detects questions', () => {
    expect(assistantAskedQuestion('Want me to log that?')).toBe(true);
    expect(assistantAskedQuestion('Logged K12 coffee.')).toBe(false);
  });
});
