import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { deliverPushToUser } from './pushDeliver.ts'
import {
  isKindEnabled,
  normalizeNotificationPrefs,
  shouldSendPush,
  type NotificationKind,
} from './notifyPrefs.ts'
import {
  normalizeCompanionPrefs,
  recentMoodTone,
  shouldQuietNudge,
} from './companionPrefs.ts'
import { clockInTimezone } from './timezoneClock.ts'

export type { NotificationKind }

export interface NotifyUserInput {
  userId: string
  walletId?: string | null
  kind: NotificationKind
  title: string
  body: string
  href?: string
  dedupeKey?: string | null
  payload?: Record<string, unknown>
  /** Default true, still gated by opt-in + category prefs. */
  push?: boolean
}

export interface NotifyUserResult {
  inserted: boolean
  notificationId: string | null
  pushed: boolean
  skippedReason?: 'prefs' | 'dedupe' | 'rate_limit'
}

/** Soft push cap per user per hour (inbox insert still happens). */
const PUSH_RATE_MAX = 20
const PUSH_RATE_WINDOW_MINUTES = 60

/**
 * Insert an in-app notification (unless category pref is off / dedupe hits),
 * then optionally Web-Push when the user opted in.
 */
export async function notifyUser(
  supabase: SupabaseClient,
  input: NotifyUserInput,
): Promise<NotifyUserResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('notification_opt_in, notification_prefs, companion_prefs, timezone')
    .eq('id', input.userId)
    .maybeSingle()

  const prefs = normalizeNotificationPrefs(profile?.notification_prefs)
  if (!isKindEnabled(prefs, input.kind)) {
    return { inserted: false, notificationId: null, pushed: false, skippedReason: 'prefs' }
  }

  // Soft kinds respect quiet mode; alerts/reminders always get through.
  if (input.kind === 'tip' || input.kind === 'insight' || input.kind === 'update') {
    const companion = normalizeCompanionPrefs(profile?.companion_prefs)
    const { data: moods } = await supabase
      .from('ai_memories')
      .select('kind, content, mood, created_at')
      .eq('user_id', input.userId)
      .eq('kind', 'mood')
      .order('created_at', { ascending: false })
      .limit(5)
    const now = new Date()
    const local = clockInTimezone(profile?.timezone, now)
    if (
      shouldQuietNudge({
        prefs: companion,
        hour: local.hour,
        dayOfWeek: local.dayOfWeek,
        recentMood: recentMoodTone(moods ?? [], now),
      })
    ) {
      return { inserted: false, notificationId: null, pushed: false, skippedReason: 'prefs' }
    }
  }

  const href = input.href?.trim() || '/notifications'
  const row = {
    user_id: input.userId,
    wallet_id: input.walletId ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href,
    payload: input.payload ?? {},
    dedupe_key: input.dedupeKey ?? null,
  }

  let notificationId: string | null = null
  let inserted = false

  const { data, error } = await supabase.from('notifications').insert(row).select('id').maybeSingle()

  if (error) {
    // Unique (user_id, dedupe_key), already delivered; do not push again.
    if (input.dedupeKey && error.code === '23505') {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', input.userId)
        .eq('dedupe_key', input.dedupeKey)
        .maybeSingle()
      return {
        inserted: false,
        notificationId: existing?.id ?? null,
        pushed: false,
        skippedReason: 'dedupe',
      }
    }
    throw error
  }

  notificationId = data?.id ?? null
  inserted = !!notificationId

  const pushRequested = input.push !== false
  const pushOk = shouldSendPush({
    notificationOptIn: profile?.notification_opt_in !== false,
    prefs,
    kind: input.kind,
    pushRequested,
  })

  if (!pushOk) {
    return { inserted, notificationId, pushed: false }
  }

  const { data: underCap } = await supabase.rpc('check_rate_limit', {
    p_user_id: input.userId,
    p_endpoint: 'web-push',
    p_max_requests: PUSH_RATE_MAX,
    p_window_minutes: PUSH_RATE_WINDOW_MINUTES,
  })

  if (underCap === false) {
    return { inserted, notificationId, pushed: false, skippedReason: 'rate_limit' }
  }

  const pushed = await deliverPushToUser(supabase, {
    userId: input.userId,
    notificationId,
    payload: {
      title: input.title,
      body: input.body,
      url: href,
      tag: input.dedupeKey ?? notificationId ?? undefined,
      notificationId: notificationId ?? undefined,
    },
  })

  return { inserted, notificationId, pushed }
}
