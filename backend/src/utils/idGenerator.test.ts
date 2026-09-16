import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { generateTradeId } from './idGenerator';

describe('generateTradeId', () => {
  it('zero-pads to 6 digits with the TRD- prefix', () => {
    expect(generateTradeId(100001)).toBe('TRD-100001');
    expect(generateTradeId(1)).toBe('TRD-000001');
    expect(generateTradeId(999999)).toBe('TRD-999999');
  });

  it('does not truncate sequences wider than 6 digits', () => {
    expect(generateTradeId(1234567)).toBe('TRD-1234567');
  });

  it('throws RangeError on negative or non-finite input', () => {
    expect(() => generateTradeId(-1)).toThrow(RangeError);
    expect(() => generateTradeId(Number.NaN)).toThrow(RangeError);
    expect(() => generateTradeId(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  // Feature: trade-blotter, Property 2: Trade ID format
  it('for any n in [100001, 999999] matches /^TRD-\d{6}$/ and the digits equal n', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100001, max: 999999 }), (n) => {
        const id = generateTradeId(n);
        expect(id).toMatch(/^TRD-\d{6}$/);
        expect(Number(id.slice('TRD-'.length))).toBe(n);
      }),
      { numRuns: 100 },
    );
  });
});
