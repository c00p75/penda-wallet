import { supabase } from '@/src/lib/supabase';
import type { FinancialMission, FinancialMissionInput, MissionStatus } from '@/src/api/types';

export async function fetchMissions(walletId: string): Promise<FinancialMission[]> {
  const { data, error } = await supabase
    .from('financial_missions')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as FinancialMission[];
}

export async function createMission(
  walletId: string,
  userId: string,
  input: FinancialMissionInput,
): Promise<FinancialMission> {
  const { data, error } = await supabase
    .from('financial_missions')
    .insert({
      wallet_id: walletId,
      created_by: userId,
      title: input.title,
      description: input.description ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      status: input.status ?? 'active',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as FinancialMission;
}

export async function updateMissionStatus(id: string, status: MissionStatus): Promise<FinancialMission> {
  const { data, error } = await supabase
    .from('financial_missions')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as FinancialMission;
}

export async function deleteMission(id: string): Promise<void> {
  const { error } = await supabase.from('financial_missions').delete().eq('id', id);
  if (error) throw error;
}
