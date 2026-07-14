/**
 * A warm, human relative-time label for the memory timeline — "Today",
 * "Yesterday", "3 weeks ago", "One year ago".
 */
export function relativeTimeLabel(dateStr: string, now: Date = new Date()): string {
  const then = new Date(dateStr)
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.floor((now.getTime() - then.getTime()) / dayMs)

  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? 'A week ago' : `${weeks} weeks ago`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? 'A month ago' : `${months} months ago`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? 'One year ago' : `${years} years ago`
}
