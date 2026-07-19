// Every function requires a valid user JWT regardless of origin, so a
// wildcard here was never an auth bypass, but locking it to known app
// origins is still best practice. Configure via ALLOWED_ORIGINS (comma-
// separated) once the production domain(s) are known; unset falls back to
// '*' so this ships with zero risk of breaking the currently-live app on a
// guessed domain.

export const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
} as const

/** Parse ALLOWED_ORIGINS env (comma-separated). Empty → open wildcard mode. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

/**
 * Pick Access-Control-Allow-Origin for a request.
 * - Empty allowlist → `*`
 * - Listed origin → reflected
 * - Unknown origin → first allowlisted origin (never `*` when locked down)
 */
export function resolveAllowOrigin(origin: string | null, allowed: string[]): string {
  if (allowed.length === 0) return '*'
  if (origin && allowed.includes(origin)) return origin
  return allowed[0]
}

export function buildCorsHeaders(allowOrigin: string): Record<string, string> {
  return {
    ...BASE_CORS_HEADERS,
    'Access-Control-Allow-Origin': allowOrigin,
  }
}

const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))

/** Backward-compatible static headers (wildcard), used only where ALLOWED_ORIGINS is unset. */
export const corsHeaders = buildCorsHeaders('*')

/** Per-request CORS headers: reflects the caller's Origin only if it's allow-listed. */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  return buildCorsHeaders(resolveAllowOrigin(origin, ALLOWED_ORIGINS))
}
