/** Local clock helpers for quiet hours (IANA timezone). */

const WEEKDAY_TO_JS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function clockInTimezone(
  timeZone: string | null | undefined,
  now = new Date(),
): { hour: number; dayOfWeek: number } {
  const tz = timeZone?.trim() || 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(now)

    const hourRaw = parts.find((p) => p.type === 'hour')?.value
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
    let hour = Number(hourRaw)
    if (!Number.isFinite(hour)) hour = now.getUTCHours()
    // Some engines emit "24" for midnight under h23.
    if (hour === 24) hour = 0

    return {
      hour,
      dayOfWeek: WEEKDAY_TO_JS[weekday] ?? now.getUTCDay(),
    }
  } catch {
    return { hour: now.getUTCHours(), dayOfWeek: now.getUTCDay() }
  }
}
