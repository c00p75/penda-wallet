import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface RateLimitWindow {
  maxRequests: number
  windowMinutes: number
}

/**
 * Checks a fixed-window quota via the check_rate_limit() DB function (see
 * migration 0029). Fails OPEN on a DB error, a broken rate limiter should
 * never take down the feature it's protecting, but logs so it's visible.
 */
async function underLimit(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
  window: RateLimitWindow,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_max_requests: window.maxRequests,
    p_window_minutes: window.windowMinutes,
  })
  if (error) {
    console.error(`Rate limit check failed for ${endpoint}, failing open:`, error.message)
    return true
  }
  return data === true
}

/**
 * Enforce one or more windows for an endpoint (e.g. a tight burst window plus
 * a loose daily cap), every window must pass. Returns null if allowed, or a
 * user-facing message to return as a 429 if any window is exceeded.
 */
export async function checkRateLimits(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
  windows: Record<string, RateLimitWindow>,
): Promise<string | null> {
  for (const [label, window] of Object.entries(windows)) {
    const ok = await underLimit(supabase, userId, `${endpoint}:${label}`, window)
    if (!ok) {
      return "You're sending messages faster than I can keep up, give it a moment and try again."
    }
  }
  return null
}
