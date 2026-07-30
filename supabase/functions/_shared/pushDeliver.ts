import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from './database.types.ts'
import { sendPush } from './push.ts'

export type PushPayload = { title: string; body: string; url?: string; tag?: string; notificationId?: string }

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504])

function backoffMinutes(attempts: number): number {
  // 5, 15, 45, 120, 360 minutes
  const steps = [5, 15, 45, 120, 360]
  return steps[Math.min(attempts, steps.length - 1)] ?? 360
}

export async function deliverPushToUser(
  supabase: SupabaseClient<Database>,
  opts: {
    userId: string
    notificationId: string | null
    payload: PushPayload
  },
): Promise<boolean> {
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys, failure_count')
    .eq('user_id', opts.userId)
    .is('disabled_at', null)

  let pushed = false
  for (const sub of subscriptions ?? []) {
    const result = await sendPush(
      { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
      {
        title: opts.payload.title,
        body: opts.payload.body,
        url: opts.payload.url,
        tag: opts.payload.tag,
        notificationId: opts.payload.notificationId ?? opts.notificationId ?? undefined,
      },
    )

    if (result.ok) {
      pushed = true
      await supabase.from('push_delivery_attempts').insert({
        user_id: opts.userId,
        subscription_id: sub.id,
        notification_id: opts.notificationId,
        status: 'sent',
        status_code: result.statusCode ?? 201,
      })
      await supabase
        .from('push_subscriptions')
        .update({ failure_count: 0, last_seen_at: new Date().toISOString(), disabled_at: null })
        .eq('id', sub.id)
      continue
    }

    if (result.statusCode === 404 || result.statusCode === 410) {
      await supabase.from('push_delivery_attempts').insert({
        user_id: opts.userId,
        subscription_id: sub.id,
        notification_id: opts.notificationId,
        status: 'gone',
        status_code: result.statusCode,
        error: result.error ?? null,
      })
      await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      continue
    }

    await supabase.from('push_delivery_attempts').insert({
      user_id: opts.userId,
      subscription_id: sub.id,
      notification_id: opts.notificationId,
      status: 'failed',
      status_code: result.statusCode ?? null,
      error: result.error ?? null,
    })

    const failures = (sub.failure_count ?? 0) + 1
    await supabase
      .from('push_subscriptions')
      .update({
        failure_count: failures,
        disabled_at: failures >= 8 ? new Date().toISOString() : null,
      })
      .eq('id', sub.id)

    if (result.statusCode == null || TRANSIENT_STATUS.has(result.statusCode)) {
      await supabase.from('push_outbox').insert({
        user_id: opts.userId,
        subscription_id: sub.id,
        notification_id: opts.notificationId,
        payload: opts.payload,
        attempts: 0,
        next_attempt_at: new Date(Date.now() + backoffMinutes(0) * 60_000).toISOString(),
        last_error: result.error ?? `HTTP ${result.statusCode ?? 'network'}`,
      })
    }
  }

  if (pushed && opts.notificationId) {
    await supabase
      .from('notifications')
      .update({ push_sent_at: new Date().toISOString() })
      .eq('id', opts.notificationId)
      .is('push_sent_at', null)
  }

  return pushed
}

export async function processPushOutbox(
  supabase: SupabaseClient<Database>,
  limit = 50,
): Promise<{ processed: number; sent: number; dropped: number }> {
  const nowIso = new Date().toISOString()
  const { data: rows, error } = await supabase
    .from('push_outbox')
    .select('id, user_id, subscription_id, notification_id, payload, attempts')
    .lte('next_attempt_at', nowIso)
    .lt('attempts', 5)
    .order('next_attempt_at', { ascending: true })
    .limit(limit)

  if (error) throw error

  let processed = 0
  let sent = 0
  let dropped = 0

  for (const row of rows ?? []) {
    processed += 1
    const { data: sub } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, keys, disabled_at')
      .eq('id', row.subscription_id)
      .maybeSingle()

    if (!sub || sub.disabled_at) {
      await supabase.from('push_outbox').delete().eq('id', row.id)
      dropped += 1
      continue
    }

    const payload = row.payload as PushPayload
    const result = await sendPush(
      { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
      {
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        notificationId: payload.notificationId ?? row.notification_id ?? undefined,
      },
    )

    if (result.ok) {
      sent += 1
      await supabase.from('push_delivery_attempts').insert({
        user_id: row.user_id,
        subscription_id: sub.id,
        notification_id: row.notification_id,
        status: 'sent',
        status_code: result.statusCode ?? 201,
      })
      if (row.notification_id) {
        await supabase
          .from('notifications')
          .update({ push_sent_at: new Date().toISOString() })
          .eq('id', row.notification_id)
          .is('push_sent_at', null)
      }
      await supabase.from('push_outbox').delete().eq('id', row.id)
      await supabase
        .from('push_subscriptions')
        .update({ failure_count: 0, last_seen_at: nowIso, disabled_at: null })
        .eq('id', sub.id)
      continue
    }

    if (result.statusCode === 404 || result.statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      await supabase.from('push_outbox').delete().eq('id', row.id)
      dropped += 1
      continue
    }

    const attempts = (row.attempts ?? 0) + 1
    if (attempts >= 5) {
      await supabase.from('push_outbox').delete().eq('id', row.id)
      dropped += 1
      continue
    }

    await supabase
      .from('push_outbox')
      .update({
        attempts,
        next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
        last_error: result.error ?? `HTTP ${result.statusCode ?? 'network'}`,
      })
      .eq('id', row.id)
  }

  return { processed, sent, dropped }
}
