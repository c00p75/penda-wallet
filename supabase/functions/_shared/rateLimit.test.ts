import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  RATE_LIMIT_USER_MESSAGE,
  rateLimitEndpointKey,
  rateLimitExceededMessage,
} from './rateLimit.ts'

Deno.test('rateLimitEndpointKey namespaces windows', () => {
  assertEquals(rateLimitEndpointKey('chat-message', 'burst'), 'chat-message:burst')
  assertEquals(rateLimitEndpointKey('chat-message', 'day'), 'chat-message:day')
})

Deno.test('rateLimitExceededMessage is stable user copy', () => {
  assertEquals(rateLimitExceededMessage('burst'), RATE_LIMIT_USER_MESSAGE)
  assertEquals(rateLimitExceededMessage('day'), RATE_LIMIT_USER_MESSAGE)
  assertEquals(RATE_LIMIT_USER_MESSAGE.includes("You're sending"), true)
})
