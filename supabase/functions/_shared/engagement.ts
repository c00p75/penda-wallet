import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface EngagementStats {
  nudge_opens: number
  nudge_dismisses: number
  opens_7d: number
  last_ritual_at: string | null
}

export function normalizeEngagementStats(raw: unknown): EngagementStats {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    nudge_opens: Math.max(0, Number(o.nudge_opens) || 0),
    nudge_dismisses: Math.max(0, Number(o.nudge_dismisses) || 0),
    opens_7d: Math.max(0, Number(o.opens_7d) || 0),
    last_ritual_at: typeof o.last_ritual_at === 'string' ? o.last_ritual_at : null,
  }
}

/** Skip soft coaching/tips when dismiss rate is high. */
export function shouldSkipSoftNudge(stats: EngagementStats): boolean {
  const opens = stats.nudge_opens
  const dismisses = stats.nudge_dismisses
  if (opens + dismisses < 4) return false
  const denom = Math.max(opens, 1)
  return dismisses / denom > 0.5
}

export async function loadEngagement(
  supabase: SupabaseClient,
  userId: string,
): Promise<EngagementStats> {
  const { data } = await supabase
    .from('profiles')
    .select('engagement_stats')
    .eq('id', userId)
    .maybeSingle()
  return normalizeEngagementStats(data?.engagement_stats)
}
