import { supabase } from '@/src/lib/supabase';
import type { AppNotification } from '@/src/api/types';

export async function fetchNotifications(includeArchived = false): Promise<AppNotification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (!includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .is('archived_at', null);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: ids?.length ? ids : null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
