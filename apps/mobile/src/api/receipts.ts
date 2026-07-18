import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase';
import type { Transaction } from '@/src/api/types';

async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown; message?: unknown };
      const message = typeof body.message === 'string' ? body.message : body.error;
      if (typeof message === 'string' && message) {
        if (message === 'premium_required') {
          return new Error('Receipt scanning is a Penda Premium feature.');
        }
        return new Error(message);
      }
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function uploadReceipt(
  walletId: string,
  userId: string,
  uri: string,
  mimeType = 'image/jpeg',
): Promise<Transaction> {
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage.from('receipts').upload(storagePath, blob, {
    contentType: mimeType,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.functions.invoke<{ transaction: Transaction }>('receipt-vision', {
    body: { walletId, storagePath },
  });

  if (error) {
    try {
      await supabase.storage.from('receipts').remove([storagePath]);
    } catch {
      /* best-effort */
    }
    throw await unwrapFunctionError(error);
  }
  if (!data?.transaction) {
    try {
      await supabase.storage.from('receipts').remove([storagePath]);
    } catch {
      /* best-effort */
    }
    throw new Error('Empty response from receipt-vision function');
  }
  return data.transaction;
}
