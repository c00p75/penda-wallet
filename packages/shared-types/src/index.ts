import { z } from 'zod'

// Money is always an integer number of minor units (cents) — never a float.
export const moneyMinorSchema = z.number().int()

export const currencyCodeSchema = z.string().length(3).toUpperCase()

export const transactionTypeSchema = z.enum(['expense', 'income', 'transfer'])

export const transactionSourceSchema = z.enum(['manual', 'chat', 'voice', 'receipt'])

export type TransactionType = z.infer<typeof transactionTypeSchema>
export type TransactionSource = z.infer<typeof transactionSourceSchema>
