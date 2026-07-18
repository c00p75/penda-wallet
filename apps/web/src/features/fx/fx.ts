/** Prefer wallet-base converted amount when present. */
export function ledgerAmountMinor(tx: {
  amount_minor: number
  converted_amount_minor?: number | null
}): number {
  return tx.converted_amount_minor ?? tx.amount_minor
}

/** Convert amount in `from` to `to` using USD-pivot rates (quote per 1 USD). */
export function convertViaUsdRates(
  amountMinor: number,
  from: string,
  to: string,
  usdRates: Record<string, number>,
): { rate: number; convertedMinor: number } | null {
  const fromC = from.toUpperCase()
  const toC = to.toUpperCase()
  if (fromC === toC) return { rate: 1, convertedMinor: amountMinor }

  const fromPerUsd = fromC === 'USD' ? 1 : usdRates[fromC]
  const toPerUsd = toC === 'USD' ? 1 : usdRates[toC]
  if (!fromPerUsd || !toPerUsd || fromPerUsd <= 0 || toPerUsd <= 0) return null

  // amount_from / fromPerUsd = USD; * toPerUsd = amount_to
  const rate = toPerUsd / fromPerUsd
  return { rate, convertedMinor: Math.round(amountMinor * rate) }
}
