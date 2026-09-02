import { describe, expect, it } from 'vitest';
import { compensatedAdd, coverageReached, kahanTotal, nextUp } from './numerics';

describe('nextUp', () => {
  it('steps one ulp toward +Infinity', () => {
    expect(nextUp(1)).toBe(1 + 2 ** -52);
    expect(nextUp(0)).toBe(5e-324);
    expect(nextUp(2 ** 53)).toBe(2 ** 53 + 2);
    expect(nextUp(-1)).toBe(-(1 - 2 ** -53));
  });

  it('carries across the 32-bit word boundary', () => {
    // Mantissa 0x00000000FFFFFFFF: the low word is all ones.
    const x = 1 + (2 ** 32 - 1) * 2 ** -52;
    expect(nextUp(x)).toBe(1 + 2 ** 32 * 2 ** -52);
  });

  it('is the identity for NaN and +Infinity', () => {
    expect(nextUp(Infinity)).toBe(Infinity);
    expect(Number.isNaN(nextUp(NaN))).toBe(true);
  });
});

describe('compensated summation', () => {
  it('sums ten tenths to exactly one', () => {
    const tenths = new Array<number>(10).fill(0.1);
    expect(kahanTotal(tenths)).toBe(1);
    expect(tenths.reduce((a, b) => a + b, 0)).not.toBe(1);
  });

  it('returns the running total and the correction of one step', () => {
    const [total, correction] = compensatedAdd(0.1, 0, 0.2);
    expect(total).toBe(0.1 + 0.2);
    expect(correction).toBe(0.1 + 0.2 - 0.1 - 0.2);
  });

  it('is zero for an empty input', () => {
    expect(kahanTotal([])).toBe(0);
  });
});

describe('coverageReached', () => {
  const required = 1e6;
  const ulp = 2 ** -33; // spacing of doubles in [2^19, 2^20)

  it('accepts a total one ulp under the requirement', () => {
    expect(coverageReached(required - ulp, required)).toBe(true);
  });

  it('rejects a total two ulps under the requirement', () => {
    expect(coverageReached(required - 2 * ulp, required)).toBe(false);
  });

  it('accepts exact and larger totals', () => {
    expect(coverageReached(required, required)).toBe(true);
    expect(coverageReached(required + 1, required)).toBe(true);
  });
});
