import { describe, expect, it } from 'vitest';
import { parseMoMoText } from '@penda/money-core';

describe('parseMoMoText (mobile re-export)', () => {
  it('uses the shared package (parity with web)', () => {
    const r = parseMoMoText('You have sent K100.00 to BOB. Fee: K2.00.', {
      now: new Date('2026-07-14T10:00:00Z'),
    });
    expect(r?.amountMinor).toBe(10000);
    expect(r?.merchant).toBe('BOB');
  });
});
