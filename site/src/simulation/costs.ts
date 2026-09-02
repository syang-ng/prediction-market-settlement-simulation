import type { Prng } from './prng';

/** Multiplier support of the scaled-Beta cost: c = μ (0.25 + 3.75 X), so c ∈ [0.25 μ, 4 μ]. */
export const COST_MULTIPLIER_LOWER = 0.25;
export const COST_MULTIPLIER_UPPER = 4.0;

const ORDER_STATISTIC_SAMPLE = 9;

/**
 * Beta(2, 8) as the second-smallest of nine uniforms. The k-th order statistic
 * of n uniforms is Beta(k, n + 1 − k), so the marginal is exact and no
 * transcendental function is involved.
 */
export function drawBeta28(rng: Prng): number {
  let smallest = 2;
  let second = 2;
  for (let i = 0; i < ORDER_STATISTIC_SAMPLE; i += 1) {
    const u = rng.uniform53();
    if (u < smallest) {
      second = smallest;
      smallest = u;
    } else if (u < second) {
      second = u;
    }
  }
  return second;
}

/**
 * Fill `out` with normalized costs x_i = 0.25 + 3.75 X_i, using the Python
 * common-shock construction (draw_correlated_scaled_beta_costs): every voter
 * draws an idiosyncratic U_i ~ Beta(2, 8); one common D ~ Beta(2, 8) is drawn
 * per trial; voter i uses D with probability sqrt(rho), otherwise U_i. Distinct
 * voters then have pairwise correlation rho.
 */
export function drawNormalizedCosts(rng: Prng, out: Float64Array, correlation: number): void {
  if (!(correlation >= 0 && correlation <= 1)) throw new Error('correlation must lie in [0, 1]');
  const n = out.length;
  for (let i = 0; i < n; i += 1) out[i] = drawBeta28(rng);
  if (correlation > 0) {
    const common = drawBeta28(rng);
    if (correlation === 1) {
      out.fill(common);
    } else {
      const threshold = Math.sqrt(correlation);
      for (let i = 0; i < n; i += 1) {
        if (rng.uniform53() < threshold) out[i] = common;
      }
    }
  }
  const span = COST_MULTIPLIER_UPPER - COST_MULTIPLIER_LOWER;
  for (let i = 0; i < n; i += 1) out[i] = COST_MULTIPLIER_LOWER + span * out[i];
}
