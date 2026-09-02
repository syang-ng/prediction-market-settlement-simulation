import { describe, expect, it } from 'vitest';
import { COST_MULTIPLIER_LOWER, COST_MULTIPLIER_UPPER, drawBeta28, drawNormalizedCosts } from './costs';
import { createPrng } from './prng';

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

describe('Beta(2, 8) order-statistic sampler', () => {
  it('has the Beta(2, 8) mean and variance and stays inside (0, 1)', () => {
    const rng = createPrng('beta-moments');
    const n = 200_000;
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < n; i += 1) {
      const x = drawBeta28(rng);
      expect(x > 0 && x < 1).toBe(true);
      sum += x;
      sumSquares += x * x;
    }
    const mean = sum / n;
    const variance = sumSquares / n - mean * mean;
    expect(Math.abs(mean - 0.2)).toBeLessThan(0.003);
    expect(Math.abs(variance - 16 / 1100) / (16 / 1100)).toBeLessThan(0.05);
  });
});

describe('correlated normalized costs', () => {
  it('stays inside the [0.25, 4] multiplier support', () => {
    const rng = createPrng('support');
    const out = new Float64Array(500);
    for (let t = 0; t < 50; t += 1) {
      drawNormalizedCosts(rng, out, 0.8);
      for (const x of out) expect(x >= COST_MULTIPLIER_LOWER && x <= COST_MULTIPLIER_UPPER).toBe(true);
    }
  });

  it('reaches the target pairwise correlation of 0.8', () => {
    const rng = createPrng('correlation-0.8');
    const out = new Float64Array(2);
    const a: number[] = [];
    const b: number[] = [];
    for (let t = 0; t < 50_000; t += 1) {
      drawNormalizedCosts(rng, out, 0.8);
      a.push(out[0]);
      b.push(out[1]);
    }
    expect(Math.abs(pearson(a, b) - 0.8)).toBeLessThan(0.02);
  });

  it('is independent at correlation 0 and identical at correlation 1', () => {
    const rng = createPrng('correlation-edges');
    const out = new Float64Array(2);
    const a: number[] = [];
    const b: number[] = [];
    for (let t = 0; t < 50_000; t += 1) {
      drawNormalizedCosts(rng, out, 0);
      a.push(out[0]);
      b.push(out[1]);
    }
    expect(Math.abs(pearson(a, b))).toBeLessThan(0.02);
    for (let t = 0; t < 100; t += 1) {
      drawNormalizedCosts(rng, out, 1);
      expect(out[0]).toBe(out[1]);
    }
  });

  it('rejects correlations outside [0, 1]', () => {
    expect(() => drawNormalizedCosts(createPrng('x'), new Float64Array(2), 1.5)).toThrow();
  });
});
