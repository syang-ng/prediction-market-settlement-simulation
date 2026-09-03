import { describe, expect, it } from 'vitest';
import { COST_MULTIPLIER_LOWER, COST_MULTIPLIER_UPPER, drawBeta28, drawNormalizedCosts, uniformsPerDraw } from './costs';
import { createPrng } from './prng';
import type { Prng } from './prng';

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

/** The original per-call construction, kept here as the reference the buffered version must reproduce exactly. */
function referenceDraw(rng: Prng, voterCount: number, correlation: number): Float64Array {
  const beta = () => {
    let smallest = 2;
    let second = 2;
    for (let i = 0; i < 9; i += 1) {
      const u = rng.uniform53();
      if (u < smallest) {
        second = smallest;
        smallest = u;
      } else if (u < second) {
        second = u;
      }
    }
    return second;
  };
  const out = new Float64Array(voterCount);
  for (let i = 0; i < voterCount; i += 1) out[i] = beta();
  const common = beta();
  const threshold = Math.sqrt(correlation);
  for (let i = 0; i < voterCount; i += 1) if (rng.uniform53() < threshold) out[i] = common;
  for (let i = 0; i < voterCount; i += 1) out[i] = 0.25 + 3.75 * out[i];
  return out;
}

describe('buffered draw equals the per-call reference', () => {
  it.each([0, 0.8, 1])('for correlation %s, with and without a scratch buffer', (correlation) => {
    const expected = referenceDraw(createPrng('reference'), 57, correlation);
    const direct = new Float64Array(57);
    drawNormalizedCosts(createPrng('reference'), direct, correlation);
    expect(Array.from(direct)).toEqual(Array.from(expected));
    const scratch = new Float64Array(uniformsPerDraw(57) + 5);
    const buffered = new Float64Array(57);
    const rng = createPrng('reference');
    drawNormalizedCosts(rng, buffered, correlation, scratch);
    expect(Array.from(buffered)).toEqual(Array.from(expected));
    // A second draw continues the stream exactly as the reference would.
    const referenceRng = createPrng('reference');
    referenceDraw(referenceRng, 57, correlation);
    const expectedNext = referenceDraw(referenceRng, 57, correlation);
    drawNormalizedCosts(rng, buffered, correlation, scratch);
    expect(Array.from(buffered)).toEqual(Array.from(expectedNext));
  });
});

/**
 * The counterfactual page exposes rho as a live control, so dragging it must show the effect of
 * correlation rather than reshuffling the draw. That holds only while the stream layout is the
 * same at every rho, including the two endpoints.
 */
describe('correlation is a stream-invariant knob', () => {
  const RHOS = [0, 0.2, 0.5, 0.8, 0.9, 1];

  /** Voters on the common value at this rho, identified against the rho = 1 draw from the same stream. */
  function commonSet(seed: string, voterCount: number, correlation: number): Set<number> {
    const common = new Float64Array(voterCount);
    drawNormalizedCosts(createPrng(seed), common, 1);
    const draw = new Float64Array(voterCount);
    drawNormalizedCosts(createPrng(seed), draw, correlation);
    const members = new Set<number>();
    for (let i = 0; i < voterCount; i += 1) if (draw[i] === common[0]) members.add(i);
    return members;
  }

  it('consumes the same uniforms at every correlation, endpoints included', () => {
    for (const correlation of RHOS) {
      const rng = createPrng('layout');
      const out = new Float64Array(57);
      drawNormalizedCosts(rng, out, correlation);
      // The next draw starts where a fixed-width layout would leave the stream.
      const expected = createPrng('layout');
      const skip = new Float64Array(uniformsPerDraw(57));
      expected.fillUniform53(skip, skip.length);
      expect(rng.nextUint32()).toBe(expected.nextUint32());
    }
  });

  it('is fully independent at 0 and fully collapsed at 1 without a special case', () => {
    for (let t = 0; t < 100; t += 1) {
      const independent = new Float64Array(40);
      drawNormalizedCosts(createPrng(`edge-${t}`), independent, 0);
      expect(new Set(independent).size).toBe(40);
      const collapsed = new Float64Array(40);
      drawNormalizedCosts(createPrng(`edge-${t}`), collapsed, 1);
      expect(new Set(collapsed).size).toBe(1);
    }
  });

  it('holds each voter idiosyncratic draw fixed as correlation changes', () => {
    const n = 55;
    const independent = new Float64Array(n);
    drawNormalizedCosts(createPrng('invariant'), independent, 0);
    for (const correlation of RHOS.slice(0, -1)) {
      const draw = new Float64Array(n);
      drawNormalizedCosts(createPrng('invariant'), draw, correlation);
      const common = commonSet('invariant', n, correlation);
      for (let i = 0; i < n; i += 1) {
        if (!common.has(i)) expect(draw[i]).toBe(independent[i]);
      }
    }
  });

  it('nests the common-value set as correlation rises', () => {
    const n = 55;
    const sets = RHOS.map((correlation) => commonSet('nesting', n, correlation));
    for (let i = 1; i < sets.length; i += 1) {
      expect(sets[i].size).toBeGreaterThanOrEqual(sets[i - 1].size);
      for (const voter of sets[i - 1]) expect(sets[i].has(voter)).toBe(true);
    }
    expect(sets[0].size).toBe(0);
    expect(sets[sets.length - 1].size).toBe(n);
  });
});
