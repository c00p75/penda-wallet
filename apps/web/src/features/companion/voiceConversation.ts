/**
 * Multi-turn voice: after the assistant finishes a reply, optionally keep
 * listening so conversation feels continuous (not only quick-log).
 */

export function shouldContinueListening(opts: {
  voiceConversationEnabled: boolean
  wasVoiceTurn: boolean
  hasPendingConfirm: boolean
  assistantAskedQuestion: boolean
  error?: boolean
}): boolean {
  if (!opts.voiceConversationEnabled) return false
  if (!opts.wasVoiceTurn) return false
  if (opts.error) return false
  // Let the user tap Confirm without the mic fighting them.
  if (opts.hasPendingConfirm) return false
  // Only continue when the persona asked something worth answering aloud.
  return opts.assistantAskedQuestion
}

export function assistantAskedQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim()) || /\b(want me to|shall I|should I|how did|how are)\b/i.test(text)
}
