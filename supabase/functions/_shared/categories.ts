export interface CategoryRef {
  id: string
  name: string
}

/**
 * Resolve whatever the model passed for a category against the wallet's list.
 *
 * The tools document category as a name, but query_records hands the model ids,
 * so in practice it passes either, and its casing follows the user's ("pets").
 * Matching on both, case-insensitively, keeps a chained call like
 * create_category → update_record from failing on the handoff.
 */
export function findCategory<T extends CategoryRef>(categories: T[], raw: unknown): T | null {
  const wanted = String(raw ?? '').trim()
  if (!wanted) return null
  const lower = wanted.toLowerCase()
  return categories.find((c) => c.id === wanted || c.name.toLowerCase() === lower) ?? null
}
