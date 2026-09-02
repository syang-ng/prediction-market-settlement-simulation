import type { Prng } from './prng';

/** Multiplier support of the scaled-Beta cost: c = μ (0.25 + 3.75 X), so c ∈ [0.25 μ, 4 μ]. */
export const COST_MULTIPLIER_LOWER = 0.25;
export const COST_MULTIPLIER_UPPER = 4.0;

const ORDER_STATISTIC_SAMPLE = 9;

/** Number of uniforms one drawNormalizedCosts call consumes for `voterCount` voters. */
export function uniformsPerDraw(voterCount: number, correlation: number): number {
  if (correlation <= 0) return voterCount * ORDER_STATISTIC_SAMPLE;
  if (correlation >= 1) return voterCount * ORDER_STATISTIC_SAMPLE + ORDER_STATISTIC_SAMPLE;
  return voterCount * ORDER_STATISTIC_SAMPLE + ORDER_STATISTIC_SAMPLE + voterCount;
}

/**
 * Second-smallest of the nine uniforms at uniforms[offset .. offset + 9). The k-th
 * order statistic of n uniforms is Beta(k, n + 1 − k), so this is an exact
 * Beta(2, 8) draw without transcendental functions.
 */
function secondSmallestOfNine(uniforms: Float64Array, offset: number): number {
  let smallest = 2;
  let second = 2;
  for (let i = offset; i < offset + ORDER_STATISTIC_SAMPLE; i += 1) {
    const u = uniforms[i];
    if (u < smallest) {
      second = smallest;
      smallest = u;
    } else if (u < second) {
      second = u;
    }
  }
  return second;
}

/** One Beta(2, 8) draw consuming the next nine uniforms of the stream. */
export function drawBeta28(rng: Prng): number {
  const uniforms = new Float64Array(ORDER_STATISTIC_SAMPLE);
  rng.fillUniform53(uniforms, ORDER_STATISTIC_SAMPLE);
  return secondSmallestOfNine(uniforms, 0);
}

/**
 * Fill `out` with normalized costs x_i = 0.25 + 3.75 X_i, using the Python
 * common-shock construction (draw_correlated_scaled_beta_costs): every voter
 * draws an idiosyncratic U_i ~ Beta(2, 8); one common D ~ Beta(2, 8) is drawn
 * per trial; voter i uses D with probability sqrt(rho), otherwise U_i. Distinct
 * voters then have pairwise correlation rho. The stream is consumed in the order
 * U_1 … U_n, D, then the n selection uniforms. `uniforms` is an optional scratch
 * buffer of at least uniformsPerDraw(out.length, correlation) entries.
 */
export function drawNormalizedCosts(rng: Prng, out: Float64Array, correlation: number, uniforms?: Float64Array): void {
  if (!(correlation >= 0 && correlation <= 1)) throw new Error('correlation must lie in [0, 1]');
  const n = out.length;
  const needed = uniformsPerDraw(n, correlation);
  const buffer = uniforms && uniforms.length >= needed ? uniforms : new Float64Array(needed);
  rng.fillUniform53(buffer, needed);
  let offset = 0;
  for (let i = 0; i < n; i += 1) {
    out[i] = secondSmallestOfNine(buffer, offset);
    offset += ORDER_STATISTIC_SAMPLE;
  }
  if (correlation > 0) {
    const common = secondSmallestOfNine(buffer, offset);
    offset += ORDER_STATISTIC_SAMPLE;
    if (correlation === 1) {
      out.fill(common);
    } else {
      const threshold = Math.sqrt(correlation);
      for (let i = 0; i < n; i += 1) {
        if (buffer[offset + i] < threshold) out[i] = common;
      }
    }
  }
  const span = COST_MULTIPLIER_UPPER - COST_MULTIPLIER_LOWER;
  for (let i = 0; i < n; i += 1) out[i] = COST_MULTIPLIER_LOWER + span * out[i];
}
