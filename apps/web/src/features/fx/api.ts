import { supabase } from '@/lib/supabase/client'
import { convertViaUsdRates } from './fx'

export type UsdRatesResult = {
  rates: Record<string, number>
  /** Max `fetched_at` across rows; null when the table is empty. */
  fetchedAt: string | null
}

/** Load USD→quote rates from exchange_rates (base_currency = USD). */
export async function fetchUsdRates(): Promise<UsdRatesResult> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('quote_currency, rate, fetched_at')
    .eq('base_currency', 'USD')

  if (error) throw error
  const rates: Record<string, number> = { USD: 1 }
  let fetchedAt: string | null = null
  for (const row of data ?? []) {
    rates[row.quote_currency] = Number(row.rate)
    if (row.fetched_at && (!fetchedAt || row.fetched_at > fetchedAt)) {
      fetchedAt = row.fetched_at
    }
  }
  return { rates, fetchedAt }
}

export async function resolveFxFields(input: {
  amountMinor: number
  currency: string
  walletBaseCurrency: string
}): Promise<{ fx_rate_to_wallet_base: number; converted_amount_minor: number }> {
  const from = input.currency.toUpperCase()
  const to = input.walletBaseCurrency.toUpperCase()
  if (from === to) {
    return { fx_rate_to_wallet_base: 1, converted_amount_minor: input.amountMinor }
  }
  const { rates } = await fetchUsdRates()
  const converted = convertViaUsdRates(input.amountMinor, from, to, rates)
  if (!converted) {
    throw new Error(`No exchange rate for ${from} → ${to}. Try again later or use ${to}.`)
  }
  return {
    fx_rate_to_wallet_base: converted.rate,
    converted_amount_minor: converted.convertedMinor,
  }
}
