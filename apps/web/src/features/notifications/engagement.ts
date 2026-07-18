import { supabase } from '@/lib/supabase/client'

export async function bumpEngagement(
  userId: string,
  field: 'nudge_opens' | 'nudge_dismisses',
): Promise<void> {
  const { data } = await supabase
    .from('profiles')
    .select('engagement_stats')
    .eq('id', userId)
    .maybeSingle()

  const stats = (data?.engagement_stats ?? {}) as Record<string, unknown>
  const next = {
    nudge_opens: Number(stats.nudge_opens) || 0,
    nudge_dismisses: Number(stats.nudge_dismisses) || 0,
    opens_7d: Number(stats.opens_7d) || 0,
    last_ritual_at: stats.last_ritual_at ?? null,
  }
  next[field] += 1
  if (field === 'nudge_opens') next.opens_7d += 1

  await supabase.from('profiles').update({ engagement_stats: next }).eq('id', userId)
}
