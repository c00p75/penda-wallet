/**
 * Multi-turn voice: after the assistant finishes a reply, optionally keep
 * listening so conversation feels continuous (not only quick-log).
 * Keep in sync with apps/web/src/features/companion/voiceConversation.ts
 */

export function shouldContinueListening(opts: {
  voiceConversationEnabled: boolean;
  wasVoiceTurn: boolean;
  hasPendingConfirm: boolean;
  assistantAskedQuestion: boolean;
  error?: boolean;
}): boolean {
  if (!opts.voiceConversationEnabled) return false;
  if (!opts.wasVoiceTurn) return false;
  if (opts.error) return false;
  if (opts.hasPendingConfirm) return false;
  return opts.assistantAskedQuestion;
}

export function assistantAskedQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim()) || /\b(want me to|shall I|should I|how did|how are)\b/i.test(text);
}
