export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100)
}

export function fromMinorUnits(amountMinor: number): number {
  return amountMinor / 100
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    fromMinorUnits(amountMinor),
  )
}

/** Currency code/symbol and the numeric amount as separate strings, for layouts that stack them. */
export function formatMoneyParts(amountMinor: number, currency: string): { code: string; amount: string } {
  const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(
    fromMinorUnits(amountMinor),
  )
  const code = parts.find((p) => p.type === 'currency')?.value ?? currency
  const amount = parts
    .filter((p) => p.type !== 'currency')
    .map((p) => p.value)
    .join('')
    .trim()
  return { code, amount }
}
