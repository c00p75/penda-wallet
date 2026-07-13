import { supabase } from '@/lib/supabase/client'
import type { Transaction } from '@/features/transactions/types'

export async function uploadReceipt(walletId: string, userId: string, file: File): Promise<Transaction> {
  const extension = file.name.split('.').pop() || 'jpg'
  const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from('receipts').upload(storagePath, file, {
    contentType: file.type,
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase.functions.invoke<{ transaction: Transaction }>('receipt-vision', {
    body: { walletId, storagePath },
  })

  if (error) throw error
  if (!data) throw new Error('Empty response from receipt-vision function')
  return data.transaction
}

export async function getReceiptImageUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 60 * 10)
  if (error) return null
  return data.signedUrl
}
