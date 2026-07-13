import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

export interface PushSubscriptionRow {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function sendPush(
  subscription: PushSubscriptionRow,
  payload: { title: string; body: string; url?: string },
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  try {
    const result = await webpush.sendNotification(subscription, JSON.stringify(payload))
    return { ok: true, statusCode: result.statusCode }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    return { ok: false, statusCode, error: error instanceof Error ? error.message : String(error) }
  }
}
