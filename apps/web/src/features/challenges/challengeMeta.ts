import { CalendarOff, PiggyBank, TrendingDown, type LucideIcon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { Challenge } from './types'

export const TYPE_LABELS: Record<Challenge['type'], string> = {
  savings_target: 'Save the most',
  spending_limit: 'Spend the least',
  no_spend_streak: 'No-spend streak',
}

export const TYPE_ICONS: Record<Challenge['type'], LucideIcon> = {
  savings_target: PiggyBank,
  spending_limit: TrendingDown,
  no_spend_streak: CalendarOff,
}

export function formatTarget(challenge: Challenge): string {
  const metric = challenge.target_metric
  if (challenge.type === 'no_spend_streak') {
    return `${metric.days ?? 0}-day streak goal`
  }
  const label = challenge.type === 'savings_target' ? 'save' : 'stay under'
  return `Goal: ${label} ${formatMoney(metric.amount_minor ?? 0, metric.currency ?? 'USD')}`
}

export function formatValue(challenge: Challenge, value: number): string {
  if (challenge.type === 'no_spend_streak') {
    return `${value} day${value === 1 ? '' : 's'}`
  }
  return formatMoney(value, challenge.target_metric.currency ?? 'USD')
}

export function daysLeft(challenge: Challenge): number {
  const end = new Date(`${challenge.end_date}T23:59:59`)
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000))
}

export function hasEnded(challenge: Challenge): boolean {
  return new Date(`${challenge.end_date}T23:59:59`).getTime() < Date.now()
}

export function hasMetTarget(challenge: Challenge, value: number): boolean {
  const metric = challenge.target_metric
  switch (challenge.type) {
    case 'savings_target':
      return value >= (metric.amount_minor ?? 0)
    case 'spending_limit':
      return value <= (metric.amount_minor ?? 0)
    case 'no_spend_streak':
      return value >= (metric.days ?? 0)
  }
}
