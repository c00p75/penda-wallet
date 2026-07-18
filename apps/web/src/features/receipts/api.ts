import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { Transaction } from '@/features/transactions/types'

// supabase.functions.invoke surfaces every non-2xx as a FunctionsHttpError
// whose .message is just "Edge Function returned a non-2xx status code" — the
// server's actual user-facing copy (premium 402s, rate-limit 429s, validation
// 400s) sits unread in the response body. Unwrap it so the UI shows what the
// server said instead of the generic wrapper line.
async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown; message?: unknown }
      const message = typeof body.message === 'string' ? body.message : body.error
      if (typeof message === 'string' && message) {
        if (message === 'premium_required') {
          return new Error('Receipt scanning is a Penda Premium feature.')
        }
        return new Error(message)
      }
    } catch {
      /* body wasn't JSON — fall through to the original error */
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

async function removeReceiptUpload(storagePath: string): Promise<void> {
  try {
    await supabase.storage.from('receipts').remove([storagePath])
  } catch {
    /* best-effort orphan cleanup */
  }
}

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

  if (error) {
    await removeReceiptUpload(storagePath)
    throw await unwrapFunctionError(error)
  }
  if (!data) {
    await removeReceiptUpload(storagePath)
    throw new Error('Empty response from receipt-vision function')
  }
  return data.transaction
}

export async function getReceiptImageUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 60 * 10)
  if (error) return null
  return data.signedUrl
}
