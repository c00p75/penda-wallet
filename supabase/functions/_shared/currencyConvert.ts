/**
 * Live mid-market FX for chat's convert_currency tool.
 * Uses the free Open Exchange Rate API (no key), which includes ZMW.
 */

const RATES_URL = 'https://open.er-api.com/v6/latest'
const CACHE_TTL_MS = 30 * 60 * 1000

/** Common spoken names → ISO 4217. Model usually passes codes; aliases catch slips. */
const CURRENCY_ALIASES: Record<string, string> = {
  dollar: 'USD',
  dollars: 'USD',
  usd: 'USD',
  buck: 'USD',
  bucks: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  eur: 'EUR',
  pound: 'GBP',
  pounds: 'GBP',
  gbp: 'GBP',
  sterling: 'GBP',
  kwacha: 'ZMW',
  kwachas: 'ZMW',
  zmw: 'ZMW',
  rand: 'ZAR',
  zar: 'ZAR',
  naira: 'NGN',
  ngn: 'NGN',
  shilling: 'KES',
  shillings: 'KES',
  kes: 'KES',
  cedi: 'GHS',
  cedis: 'GHS',
  ghs: 'GHS',
  yen: 'JPY',
  jpy: 'JPY',
  yuan: 'CNY',
  cny: 'CNY',
  rupee: 'INR',
  rupees: 'INR',
  inr: 'INR',
  cad: 'CAD',
  aud: 'AUD',
  chf: 'CHF',
  aed: 'AED',
}

const DISPLAY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  CAD: '$',
  AUD: '$',
  CHF: 'CHF',
  ZAR: 'R',
  NGN: '₦',
  KES: 'KSh',
  GHS: 'GH₵',
  ZMW: 'K',
  EGP: 'E£',
  AED: 'AED',
}

interface CachedRates {
  rates: Record<string, number>
  asOf: string
  fetchedAt: number
}

const ratesCache = new Map<string, CachedRates>()

export function normalizeCurrencyCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z]/g, '')
  if (!cleaned) return null
  if (CURRENCY_ALIASES[cleaned]) return CURRENCY_ALIASES[cleaned]
  if (/^[a-z]{3}$/.test(cleaned)) return cleaned.toUpperCase()
  return null
}

export function formatFxAmount(amount: number, currency: string): string {
  const symbol = DISPLAY_SYMBOLS[currency]
  const rounded = roundFx(amount, currency)
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString('en-US', { maximumFractionDigits: decimalsFor(currency) })
  if (symbol && symbol !== currency) return `${symbol}${body}`
  return `${body} ${currency}`
}

function decimalsFor(currency: string): number {
  // Zero-decimal currencies keep whole numbers; others stay readable for chat.
  if (currency === 'JPY' || currency === 'KRW' || currency === 'VND') return 0
  if (currency === 'ZMW' || currency === 'NGN' || currency === 'KES' || currency === 'GHS') return 2
  return 2
}

export function roundFx(amount: number, currency: string): number {
  const d = decimalsFor(currency)
  const f = 10 ** d
  return Math.round(amount * f) / f
}

export function convertAmount(amount: number, rate: number): number {
  return amount * rate
}

export type ConvertCurrencyResult =
  | {
      ok: true
      summary: string
      amount: number
      from: string
      to: string
      rate: number
      converted: number
      asOf: string
    }
  | { ok: false; error: string }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export async function convertCurrency(
  amount: number,
  fromRaw: unknown,
  toRaw: unknown,
  opts: { fetchImpl?: FetchLike; now?: number } = {},
): Promise<ConvertCurrencyResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' }
  }

  const from = normalizeCurrencyCode(fromRaw)
  const to = normalizeCurrencyCode(toRaw)
  if (!from) return { ok: false, error: 'I need a valid from currency (e.g. USD, ZMW).' }
  if (!to) return { ok: false, error: 'I need a valid to currency (e.g. USD, ZMW).' }

  if (from === to) {
    const same = roundFx(amount, from)
    return {
      ok: true,
      summary: `${formatFxAmount(same, from)} is already in ${from}. No conversion needed.`,
      amount: same,
      from,
      to,
      rate: 1,
      converted: same,
      asOf: 'same currency',
    }
  }

  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? Date.now()

  try {
    const { rates, asOf } = await loadRates(from, fetchImpl, now)
    const rate = rates[to]
    if (!Number.isFinite(rate) || rate <= 0) {
      return {
        ok: false,
        error: `I can't convert ${from} to ${to}. That pair isn't in the live rate feed.`,
      }
    }
    const converted = roundFx(convertAmount(amount, rate), to)
    const fromLabel = formatFxAmount(roundFx(amount, from), from)
    const toLabel = formatFxAmount(converted, to)
    const rateLabel = rate >= 1 ? rate.toFixed(4) : rate.toPrecision(4)
    return {
      ok: true,
      summary:
        `${fromLabel} ≈ ${toLabel} (mid-market rate 1 ${from} = ${rateLabel} ${to}, as of ${asOf}). ` +
        `Approximate only; banks and bureaus may differ.`,
      amount: roundFx(amount, from),
      from,
      to,
      rate,
      converted,
      asOf,
    }
  } catch (err) {
    console.error('convertCurrency failed:', err)
    return { ok: false, error: 'Failed to fetch a live exchange rate. Try again in a moment.' }
  }
}

async function loadRates(
  base: string,
  fetchImpl: FetchLike,
  now: number,
): Promise<{ rates: Record<string, number>; asOf: string }> {
  const cached = ratesCache.get(base)
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { rates: cached.rates, asOf: cached.asOf }
  }

  const res = await fetchImpl(`${RATES_URL}/${encodeURIComponent(base)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`FX HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    result?: string
    rates?: Record<string, number>
    time_last_update_utc?: string
    base_code?: string
  }
  if (body.result !== 'success' || !body.rates || typeof body.rates !== 'object') {
    throw new Error('FX payload missing rates')
  }

  const asOf = typeof body.time_last_update_utc === 'string'
    ? body.time_last_update_utc.replace(/^\w+, /, '').replace(/ \+0000$/, ' UTC')
    : 'today'
  ratesCache.set(base, { rates: body.rates, asOf, fetchedAt: now })
  return { rates: body.rates, asOf }
}

/** Test helper: drop cached rates between cases. */
export function clearFxCache(): void {
  ratesCache.clear()
}
