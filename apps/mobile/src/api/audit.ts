import {
  DOMAIN_TABLES,
  buildReinsertRow,
  canUndoAiAction as canUndoAiActionShared,
  filterRestorePatch,
  isUndoDomain,
} from '@penda/money-core';
import { supabase } from '@/src/lib/supabase';
import type { AiPendingAction } from '@/src/api/types';

export function canUndoAiAction(action: AiPendingAction): boolean {
  return canUndoAiActionShared(action);
}

export async function fetchAiPendingActions(userId: string): Promise<AiPendingAction[]> {
  const { data, error } = await supabase
    .from('ai_pending_actions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data as AiPendingAction[];
}

export async function fetchAiPendingAction(id: string): Promise<AiPendingAction | null> {
  const { data, error } = await supabase.from('ai_pending_actions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as AiPendingAction | null;
}

async function revokeTrust(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_consent, ai_trust')
    .eq('id', userId)
    .maybeSingle();

  const consent = {
    ...(profile?.ai_consent && typeof profile.ai_consent === 'object' ? profile.ai_consent : {}),
    act_without_confirm: false,
  };
  const trustRaw = profile?.ai_trust && typeof profile.ai_trust === 'object' ? profile.ai_trust : {};
  const trust = {
    confirmed_ok: Math.max(0, Number((trustRaw as Record<string, unknown>).confirmed_ok) || 0),
    confirmed_undone: Math.max(0, Number((trustRaw as Record<string, unknown>).confirmed_undone) || 0) + 1,
    auto_loose: false,
  };

  await supabase.from('profiles').update({ ai_consent: consent, ai_trust: trust }).eq('id', userId);
}

async function undoSoftDeletedTransaction(transactionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', transactionId);

  if (error) throw error;
  await revokeTrust(userId);
}

/** Soft-delete a transaction that was just created (create/reconcile undo). */
async function softDeleteCreatedTransaction(transactionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', transactionId)
    .is('deleted_at', null);

  if (error) throw error;
  await revokeTrust(userId);
}

export async function undoAiAction(action: AiPendingAction, userId: string): Promise<void> {
  if (!canUndoAiActionShared(action)) {
    throw new Error('This action cannot be undone.');
  }

  // Reconcile (set_balance) undo = soft-delete the adjustment transaction it
  // created; not a generic CRUD domain so it skips the isUndoDomain check below.
  if (action.kind === 'reconcile') {
    await softDeleteCreatedTransaction(action.target_id, userId);
    return;
  }

  if (!isUndoDomain(action.domain)) {
    throw new Error(`Unknown domain "${action.domain}".`);
  }

  const cfg = DOMAIN_TABLES[action.domain];

  if (action.kind === 'delete' && cfg.softDelete) {
    await undoSoftDeletedTransaction(action.target_id, userId);
    return;
  }

  const before = (action.patch?.__before ?? {}) as Record<string, unknown>;

  if (action.kind === 'update') {
    const restore = filterRestorePatch(action.domain, before);
    if (Object.keys(restore).length === 0) throw new Error('Nothing to restore.');
    const { error } = await supabase.from(cfg.table).update(restore).eq('id', action.target_id);
    if (error) throw error;
  } else if (cfg.softDelete) {
    const { error } = await supabase
      .from(cfg.table)
      .update({ deleted_at: null })
      .eq('id', action.target_id);
    if (error) throw error;
  } else {
    const row = buildReinsertRow(action.domain, action.target_id, before);
    const { error } = await supabase.from(cfg.table).insert(row);
    if (error) throw error;
  }

  await revokeTrust(userId);
}
