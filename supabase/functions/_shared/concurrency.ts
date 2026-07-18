/**
 * Map over items with at most `limit` in flight at once, preserving input
 * order in the results. Used by the cron functions to fan out per-wallet work
 * instead of processing every wallet strictly one after another (audit
 * finding: sequential processing puts total runtime on a collision course
 * with the function execution limit as wallets grow).
 *
 * `fn` rejections propagate, callers that want one bad item to not sink the
 * whole run should catch inside `fn`.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}
