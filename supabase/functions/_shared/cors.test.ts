import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildCorsHeaders,
  parseAllowedOrigins,
  resolveAllowOrigin,
} from './cors.ts'

Deno.test('parseAllowedOrigins trims and drops empties', () => {
  assertEquals(parseAllowedOrigins(' https://a.app , ,https://b.app '), [
    'https://a.app',
    'https://b.app',
  ])
  assertEquals(parseAllowedOrigins(''), [])
  assertEquals(parseAllowedOrigins(null), [])
})

Deno.test('resolveAllowOrigin wildcards when allowlist empty', () => {
  assertEquals(resolveAllowOrigin('https://evil.test', []), '*')
  assertEquals(resolveAllowOrigin(null, []), '*')
})

Deno.test('resolveAllowOrigin reflects listed origins', () => {
  const allowed = ['https://app.penda.app', 'http://localhost:5173']
  assertEquals(resolveAllowOrigin('http://localhost:5173', allowed), 'http://localhost:5173')
  assertEquals(resolveAllowOrigin('https://app.penda.app', allowed), 'https://app.penda.app')
})

Deno.test('resolveAllowOrigin falls back to first allowlisted origin for unknown', () => {
  const allowed = ['https://app.penda.app', 'http://localhost:5173']
  assertEquals(resolveAllowOrigin('https://evil.test', allowed), 'https://app.penda.app')
  assertEquals(resolveAllowOrigin(null, allowed), 'https://app.penda.app')
})

Deno.test('buildCorsHeaders sets methods + vary', () => {
  const headers = buildCorsHeaders('https://app.penda.app')
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://app.penda.app')
  assertEquals(headers['Access-Control-Allow-Methods'], 'POST, OPTIONS')
  assertEquals(headers.Vary, 'Origin')
})
