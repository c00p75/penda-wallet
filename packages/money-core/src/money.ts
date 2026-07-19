/** Shared minor-unit helpers for web + mobile. */

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100)
}

export function fromMinorUnits(amountMinor: number): number {
  return amountMinor / 100
}
