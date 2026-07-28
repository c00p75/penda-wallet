import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  clearFxCache,
  convertCurrency,
  formatFxAmount,
  normalizeCurrencyCode,
  roundFx,
} from './currencyConvert.ts'

Deno.test('normalizeCurrencyCode accepts ISO codes and spoken aliases', () => {
  assertEquals(normalizeCurrencyCode('usd'), 'USD')
  assertEquals(normalizeCurrencyCode('USD'), 'USD')
  assertEquals(normalizeCurrencyCode('dollars'), 'USD')
  assertEquals(normalizeCurrencyCode('kwacha'), 'ZMW')
  assertEquals(normalizeCurrencyCode('  ZMW '), 'ZMW')
  assertEquals(normalizeCurrencyCode('not-a-currency'), null)
  assertEquals(normalizeCurrencyCode(''), null)
  assertEquals(normalizeCurrencyCode(12), null)
})

Deno.test('formatFxAmount prefers wallet-friendly symbols', () => {
  assertEquals(formatFxAmount(12, 'USD'), '$12')
  assertEquals(formatFxAmount(12.5, 'ZMW'), 'K12.5')
  assertEquals(formatFxAmount(1000, 'JPY'), '¥1000')
})

Deno.test('roundFx keeps two decimals for ZMW', () => {
  assertEquals(roundFx(18.700605 * 12, 'ZMW'), 224.41)
})

Deno.test('convertCurrency same-currency short-circuits without fetch', async () => {
  clearFxCache()
  let fetches = 0
  const result = await convertCurrency(12, 'USD', 'dollars', {
    fetchImpl: async () => {
      fetches += 1
      throw new Error('should not fetch')
    },
  })
  assertEquals(fetches, 0)
  assertEquals(result.ok, true)
  if (result.ok) {
    assertEquals(result.rate, 1)
    assertEquals(result.converted, 12)
    assertStringIncludes(result.summary, 'already in USD')
  }
})

Deno.test('convertCurrency multiplies by live rate and caches', async () => {
  clearFxCache()
  let fetches = 0
  const fetchImpl = async () => {
    fetches += 1
    return new Response(
      JSON.stringify({
        result: 'success',
        base_code: 'USD',
        time_last_update_utc: 'Tue, 28 Jul 2026 00:02:31 +0000',
        rates: { USD: 1, ZMW: 18.700605, EUR: 0.92 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const first = await convertCurrency(12, 'USD', 'ZMW', { fetchImpl, now: 1_000 })
  assertEquals(first.ok, true)
  if (first.ok) {
    assertEquals(first.converted, 224.41)
    assertStringIncludes(first.summary, 'K224.41')
    assertStringIncludes(first.summary, '$12')
    assertStringIncludes(first.summary, '28 Jul 2026')
  }

  const second = await convertCurrency(1, 'dollars', 'kwacha', { fetchImpl, now: 2_000 })
  assertEquals(second.ok, true)
  assertEquals(fetches, 1, 'second call within TTL should reuse cache')
})

Deno.test('convertCurrency reports missing pairs and bad amounts', async () => {
  clearFxCache()
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        result: 'success',
        rates: { USD: 1, EUR: 0.92 },
        time_last_update_utc: 'Tue, 28 Jul 2026 00:02:31 +0000',
      }),
      { status: 200 },
    )

  const missing = await convertCurrency(10, 'USD', 'ZMW', { fetchImpl })
  assertEquals(missing.ok, false)
  if (!missing.ok) assertStringIncludes(missing.error, "can't convert")

  const badAmount = await convertCurrency(0, 'USD', 'ZMW')
  assertEquals(badAmount.ok, false)
  if (!badAmount.ok) assertStringIncludes(badAmount.error, 'positive')
})
