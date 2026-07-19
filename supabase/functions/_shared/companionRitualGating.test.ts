import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  classifyPactFollowUp,
  companionRitualSkipReason,
  cronSecretAuthorized,
  daysAgo,
  midpointDate,
} from './companionRitualGating.ts'
import { DEFAULT_COMPANION_PREFS } from './companionPrefs.ts'

Deno.test('midpointDate and daysAgo are UTC calendar math', () => {
  assertEquals(midpointDate('2026-07-01', '2026-07-11'), '2026-07-06')
  assertEquals(daysAgo('2026-07-14', 7), '2026-07-07')
})

Deno.test('classifyPactFollowUp prioritizes broken', () => {
  assertEquals(
    classifyPactFollowUp({
      today: '2026-07-06',
      startDate: '2026-07-01',
      endDate: '2026-07-11',
      broken: true,
    }),
    'broken',
  )
  assertEquals(
    classifyPactFollowUp({
      today: '2026-07-06',
      startDate: '2026-07-01',
      endDate: '2026-07-11',
      broken: false,
    }),
    'midpoint',
  )
  assertEquals(
    classifyPactFollowUp({
      today: '2026-07-11',
      startDate: '2026-07-01',
      endDate: '2026-07-11',
      broken: false,
    }),
    'end',
  )
  assertEquals(
    classifyPactFollowUp({
      today: '2026-07-08',
      startDate: '2026-07-01',
      endDate: '2026-07-11',
      broken: false,
    }),
    null,
  )
})

Deno.test('companionRitualSkipReason adaptive when dismiss rate high', () => {
  assertEquals(
    companionRitualSkipReason({
      engagement: { nudge_opens: 2, nudge_dismisses: 4, opens_7d: 0, last_ritual_at: null },
      prefs: DEFAULT_COMPANION_PREFS,
      hour: 12,
      dayOfWeek: 3,
      recentMood: 'ok',
    }),
    'adaptive',
  )
})

Deno.test('companionRitualSkipReason quiet on Sunday when enabled', () => {
  assertEquals(
    companionRitualSkipReason({
      engagement: { nudge_opens: 0, nudge_dismisses: 0, opens_7d: 0, last_ritual_at: null },
      prefs: { ...DEFAULT_COMPANION_PREFS, quiet_on_sundays: true },
      hour: 12,
      dayOfWeek: 0,
      recentMood: 'ok',
    }),
    'quiet',
  )
})

Deno.test('companionRitualSkipReason quiet when stressed', () => {
  assertEquals(
    companionRitualSkipReason({
      engagement: {},
      prefs: DEFAULT_COMPANION_PREFS,
      hour: 12,
      dayOfWeek: 2,
      recentMood: 'stressed',
    }),
    'quiet',
  )
})

Deno.test('companionRitualSkipReason null when clear to send', () => {
  assertEquals(
    companionRitualSkipReason({
      engagement: { nudge_opens: 10, nudge_dismisses: 1, opens_7d: 3, last_ritual_at: null },
      prefs: { ...DEFAULT_COMPANION_PREFS, quiet_enabled: false, quiet_when_stressed: false },
      hour: 12,
      dayOfWeek: 2,
      recentMood: 'ok',
    }),
    null,
  )
})

Deno.test('cronSecretAuthorized requires exact match and non-empty expected', () => {
  assertEquals(cronSecretAuthorized('secret', 'secret'), true)
  assertEquals(cronSecretAuthorized('wrong', 'secret'), false)
  assertEquals(cronSecretAuthorized('secret', ''), false)
  assertEquals(cronSecretAuthorized('secret', null), false)
  assertEquals(cronSecretAuthorized(null, 'secret'), false)
})
