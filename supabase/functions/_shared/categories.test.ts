import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { findCategory } from './categories.ts'

const CATS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Food' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Pets' },
]

Deno.test('findCategory matches on name, ignoring case and padding', () => {
  assertEquals(findCategory(CATS, 'Pets')?.id, CATS[1].id)
  assertEquals(findCategory(CATS, 'pets')?.id, CATS[1].id)
  assertEquals(findCategory(CATS, '  PETS ')?.id, CATS[1].id)
})

Deno.test('findCategory matches on id, since query_records hands the model ids', () => {
  assertEquals(findCategory(CATS, CATS[1].id)?.name, 'Pets')
})

Deno.test('findCategory returns null for unknown and empty input', () => {
  assertEquals(findCategory(CATS, 'Travel'), null)
  assertEquals(findCategory(CATS, ''), null)
  assertEquals(findCategory(CATS, '   '), null)
  assertEquals(findCategory(CATS, null), null)
  assertEquals(findCategory(CATS, undefined), null)
})

Deno.test('findCategory sees a category appended mid-turn', () => {
  // The chat turn's category list is a snapshot taken before the model runs;
  // create_category appends to it so a later update_record in the same turn can
  // resolve the name it just created.
  const live = [...CATS]
  assertEquals(findCategory(live, 'Garden'), null)
  live.push({ id: '33333333-3333-3333-3333-333333333333', name: 'Garden' })
  assertEquals(findCategory(live, 'Garden')?.id, '33333333-3333-3333-3333-333333333333')
})
