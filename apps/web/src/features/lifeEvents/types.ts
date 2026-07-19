export type LifeEventKind = 'travel' | 'job_change' | 'newborn' | 'wedding' | 'other'

export interface LifeEvent {
  kind: LifeEventKind
  label: string
  starts_on: string
  ends_on: string | null
}

export const LIFE_EVENT_OPTIONS: { value: LifeEventKind; label: string; hint: string }[] = [
  { value: 'travel', label: 'Travel', hint: 'Looser fun envelope, tighter home fixed costs.' },
  { value: 'job_change', label: 'Job change', hint: 'Buffer-first; pause aggressive goals briefly.' },
  { value: 'newborn', label: 'Newborn', hint: 'Protect essentials; soft-pedal lifestyle spend.' },
  { value: 'wedding', label: 'Wedding', hint: 'Goal-heavy window; track one celebration envelope.' },
  { value: 'other', label: 'Other life moment', hint: 'Temporary coaching tone shift.' },
]

export function normalizeLifeEvent(raw: unknown): LifeEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = o.kind
  if (
    kind !== 'travel' &&
    kind !== 'job_change' &&
    kind !== 'newborn' &&
    kind !== 'wedding' &&
    kind !== 'other'
  ) {
    return null
  }
  if (typeof o.label !== 'string' || typeof o.starts_on !== 'string') return null
  return {
    kind,
    label: o.label,
    starts_on: o.starts_on,
    ends_on: typeof o.ends_on === 'string' ? o.ends_on : null,
  }
}

export function lifeEventActive(event: LifeEvent | null | undefined, today: string): boolean {
  if (!event) return false
  if (event.starts_on > today) return false
  if (event.ends_on && event.ends_on < today) return false
  return true
}

export function lifeEventCoachingLine(event: LifeEvent): string {
  switch (event.kind) {
    case 'travel':
      return `Travel mode (${event.label}): keep home bills covered; let fun live in a trip envelope.`
    case 'job_change':
      return `Job-change mode: pad the buffer before new lifestyle spend.`
    case 'newborn':
      return `Newborn season: essentials first. Celebrate small wins, skip guilt on the rest.`
    case 'wedding':
      return `Wedding window: one clear celebration goal beats scattered "little" expenses.`
    default:
      return `Life moment (${event.label}): I'm coaching softer on lifestyle until ${event.ends_on ?? 'you clear it'}.`
  }
}
