import { supabase } from '@/lib/supabase/client'
import type { Debt, DebtInput, DebtPayment } from './types'

export async function fetchDebts(walletId: string): Promise<Debt[]> {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('wallet_id', walletId)
    .is('archived_at', null)
    .order('created_at')

  if (error) throw error
  return data
}

export async function fetchArchivedDebts(walletId: string): Promise<Debt[]> {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('wallet_id', walletId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  if (error) throw error
  return data
}

export async function fetchDebt(id: string): Promise<Debt | null> {
  const { data, error } = await supabase.from('debts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createDebt(walletId: string, input: DebtInput): Promise<Debt> {
  const { data, error } = await supabase
    .from('debts')
    .insert({ wallet_id: walletId, balance_minor: input.principal_minor, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateDebt(id: string, input: DebtInput): Promise<Debt> {
  const { data, error } = await supabase
    .from('debts')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function archiveDebt(id: string): Promise<void> {
  const { error } = await supabase
    .from('debts')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function unarchiveDebt(id: string): Promise<void> {
  const { error } = await supabase.from('debts').update({ archived_at: null }).eq('id', id)
  if (error) throw error
}

export async function fetchPayments(debtId: string): Promise<DebtPayment[]> {
  const { data, error } = await supabase
    .from('debt_payments')
    .select('*')
    .eq('debt_id', debtId)
    .order('paid_date', { ascending: false })

  if (error) throw error
  return data
}

export async function addPayment(debtId: string, amountMinor: number, date: string): Promise<void> {
  const { error } = await supabase
    .from('debt_payments')
    .insert({ debt_id: debtId, amount_minor: amountMinor, paid_date: date })

  if (error) throw error
}
