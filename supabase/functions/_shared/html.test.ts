import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { escapeHtml } from './html.ts'

Deno.test('escapeHtml escapes the five reserved characters', () => {
  assertEquals(escapeHtml(`<script>alert("x & y's")</script>`), '&lt;script&gt;alert(&quot;x &amp; y&#39;s&quot;)&lt;/script&gt;')
})

Deno.test('escapeHtml leaves plain text untouched', () => {
  assertEquals(escapeHtml('Household Wallet'), 'Household Wallet')
})
