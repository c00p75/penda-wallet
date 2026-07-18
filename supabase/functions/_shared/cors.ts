// Every function requires a valid user JWT regardless of origin, so a
// wildcard here was never an auth bypass — but locking it to known app
// origins is still best practice. Configure via ALLOWED_ORIGINS (comma-
// separated) once the production domain(s) are known; unset falls back to
// '*' so this ships with zero risk of breaking the currently-live app on a
// guessed domain.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

/** Backward-compatible static headers (wildcard) — used only where ALLOWED_ORIGINS is unset. */
export const corsHeaders = {
  ...BASE_CORS_HEADERS,
  'Access-Control-Allow-Origin': '*',
}

/** Per-request CORS headers: reflects the caller's Origin only if it's allow-listed. */
export function corsHeadersFor(req: Request): Record<string, string> {
  if (ALLOWED_ORIGINS.length === 0) return corsHeaders
  const origin = req.headers.get('Origin') ?? ''
  return {
    ...BASE_CORS_HEADERS,
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  }
}
