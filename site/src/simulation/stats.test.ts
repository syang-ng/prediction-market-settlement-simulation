import { describe, expect, it } from 'vitest';
import { mean, quantileLinear, shareAtMost, sortedCopy, summarize } from './stats';

describe('numpy-linear quantiles', () => {
  const four = Float64Array.from([1, 2, 3, 4]);

  it('interpolates like numpy.quantile(method="linear")', () => {
    expect(quantileLinear(four, 0.5)).toBe(2.5);
    expect(quantileLinear(four, 0.1)).toBeCloseTo(1.3, 12);
    expect(quantileLinear(four, 0.99)).toBeCloseTo(3.97, 12);
    expect(quantileLinear(four, 0)).toBe(1);
    expect(quantileLinear(four, 1)).toBe(4);
  });

  it('returns the middle element of an odd-length array and the only element of a singleton', () => {
    expect(quantileLinear(Float64Array.from([10, 20, 30, 40, 50]), 0.5)).toBe(30);
    expect(quantileLinear(Float64Array.from([7]), 0.9)).toBe(7);
  });

  it('rejects an empty array', () => {
    expect(() => quantileLinear(new Float64Array(0), 0.5)).toThrow();
  });
});

describe('summaries', () => {
  it('sorts a copy without touching the input', () => {
    const values = Float64Array.from([3, 1, 2]);
    expect(Array.from(sortedCopy(values))).toEqual([1, 2, 3]);
    expect(Array.from(values)).toEqual([3, 1, 2]);
  });

  it('computes mean and quantile fields from unsorted input', () => {
    const summary = summarize([4, 1, 3, 2]);
    expect(summary).toEqual({ p10: quantileLinear(Float64Array.from([1, 2, 3, 4]), 0.1), p50: 2.5, p90: quantileLinear(Float64Array.from([1, 2, 3, 4]), 0.9), p99: quantileLinear(Float64Array.from([1, 2, 3, 4]), 0.99), mean: 2.5 });
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it('computes the share of values at or below a cap', () => {
    expect(shareAtMost([1, 2, 3, 4], 2)).toBe(0.5);
    expect(shareAtMost([1, 2, 3, 4], 0.5)).toBe(0);
    expect(shareAtMost([1, 2, 3, 4], 4)).toBe(1);
  });
});
