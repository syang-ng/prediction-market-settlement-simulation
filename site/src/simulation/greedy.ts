/**
 * Per-trial port of simulate_cost_batch from experiments/greedy_reward_simulation.py.
 *
 * Operation order mirrors the NumPy code exactly (η from normalized costs, then
 * × scale, then × running total; Kahan prefix sums; one-ulp coverage rule;
 * cent-grid tick bounds and bisection), so identical inputs give identical
 * posted rewards, counts, stakes, and costs. Certification checks throw.
 */

import { coverageReached, kahanTotal, nextUp } from './numerics';

export const POSTED_REWARD_GRID_USD = 0.01;
const CONTINUOUS_TOLERANCE_USD = 1e-8;
const MAX_UPPER_DOUBLINGS = 32;
const MAX_CENT_UPPER_ADJUSTMENTS = 4;
const MAX_CENT_ITERATIONS = 128;
// Above this tick index adjacent grid rewards stop being distinguishable in binary64.
const MAX_EXACT_TICK_INDEX = 2 ** 52 - 8;
const PAYOFF_TOLERANCE_USD = 1e-9;

export interface SortedCandidates {
  /** Canonical (address-order) index at each sorted position. */
  order: Int32Array;
  stakes: Float64Array;
  /** Normalized cost / stake, sorted ascending. */
  eta: Float64Array;
  baseCosts: Float64Array;
  /** Kahan prefix sums of sorted stakes; the last entry is the canonical capacity. */
  cumulative: Float64Array;
  capacityUma: number;
}

export interface ScanMetrics {
  totalStakeUma: number;
  selectedVoterCount: number;
  selectedBaseCost: number;
  selectedPositions: number[] | null;
}

export interface TrialScenarioResult {
  postedRewardUsd: number;
  selectedVoterCount: number;
  selectedStakeUma: number;
  selectedDirectCostUsd: number;
  selectedPositions: number[] | null;
}

/** Sort by η ascending with the canonical index as tie-break (numpy stable argsort). */
export function sortCandidates(stakesUma: Float64Array, normalizedCosts: Float64Array, capacityUma: number): SortedCandidates {
  const n = stakesUma.length;
  if (normalizedCosts.length !== n) throw new Error('stakes and costs must have equal length');
  const rawEta = new Float64Array(n);
  for (let i = 0; i < n; i += 1) rawEta[i] = normalizedCosts[i] / stakesUma[i];
  const indices: number[] = new Array<number>(n);
  for (let i = 0; i < n; i += 1) indices[i] = i;
  indices.sort((a, b) => (rawEta[a] < rawEta[b] ? -1 : rawEta[a] > rawEta[b] ? 1 : a - b));
  const order = Int32Array.from(indices);
  const stakes = new Float64Array(n);
  const eta = new Float64Array(n);
  const baseCosts = new Float64Array(n);
  const cumulative = new Float64Array(n);
  let total = 0;
  let correction = 0;
  for (let p = 0; p < n; p += 1) {
    const i = order[p];
    stakes[p] = stakesUma[i];
    baseCosts[p] = normalizedCosts[i];
    eta[p] = baseCosts[p] / stakes[p];
    const adjusted = stakes[p] - correction;
    const updated = total + adjusted;
    correction = updated - total - adjusted;
    total = updated;
    cumulative[p] = total;
  }
  if (n > 0) cumulative[n - 1] = capacityUma;
  return { order, stakes, eta, baseCosts, cumulative, capacityUma };
}

/** Skip-but-continue greedy scan; true once the admitted total covers the requirement. */
export function admitted(sorted: SortedCandidates, rewardUsd: number, scale: number, requiredStakeUma: number): boolean {
  const { stakes, eta } = sorted;
  const rewardUp = nextUp(rewardUsd);
  let total = 0;
  let correction = 0;
  for (let p = 0; p < stakes.length; p += 1) {
    const adjusted = stakes[p] - correction;
    const proposedTotal = total + adjusted;
    const threshold = eta[p] * scale * proposedTotal;
    if (rewardUp >= threshold) {
      correction = proposedTotal - total - adjusted;
      total = proposedTotal;
      if (coverageReached(total, requiredStakeUma)) return true;
    }
  }
  return false;
}

/** Full scan at a posted reward plus the Python Nash-certificate checks. */
export function scanMetrics(sorted: SortedCandidates, rewardUsd: number, scale: number, collectSelected: boolean): ScanMetrics {
  const { stakes, eta, baseCosts } = sorted;
  const rewardUp = nextUp(rewardUsd);
  const selectedPositions: number[] | null = collectSelected ? [] : null;
  let total = 0;
  let correction = 0;
  let count = 0;
  let selectedBaseCost = 0;
  let lastSelectedEta = 0;
  for (let p = 0; p < stakes.length; p += 1) {
    const adjusted = stakes[p] - correction;
    const proposedTotal = total + adjusted;
    const etaScaled = eta[p] * scale;
    if (rewardUp >= etaScaled * proposedTotal) {
      correction = proposedTotal - total - adjusted;
      total = proposedTotal;
      count += 1;
      selectedBaseCost += baseCosts[p];
      lastSelectedEta = etaScaled;
      if (selectedPositions) selectedPositions.push(p);
    }
  }
  if (count > 0 && rewardUsd / Math.max(total, 1e-300) + 1e-10 < lastSelectedEta) {
    throw new Error('batch no-exit condition failed');
  }

  // Re-run the scan against the final aggregate to certify in payoff space,
  // including outsiders' entry deviations.
  let scanTotal = 0;
  let scanCorrection = 0;
  for (let p = 0; p < stakes.length; p += 1) {
    const adjusted = stakes[p] - scanCorrection;
    const proposedTotal = scanTotal + adjusted;
    const etaScaled = eta[p] * scale;
    const accepted = rewardUp >= etaScaled * proposedTotal;
    const cost = baseCosts[p] * scale;
    const selectedPayoff = (rewardUsd * stakes[p]) / Math.max(total, 1e-300);
    const outsiderTotal = total + (stakes[p] - correction);
    const outsiderPayoff = (rewardUsd * stakes[p]) / outsiderTotal;
    if (accepted && selectedPayoff + PAYOFF_TOLERANCE_USD < cost) throw new Error('batch selected-voter no-exit check failed');
    if (!accepted && outsiderPayoff > cost + PAYOFF_TOLERANCE_USD) throw new Error('batch outsider no-entry check failed');
    if (accepted) {
      scanCorrection = proposedTotal - scanTotal - adjusted;
      scanTotal = proposedTotal;
    }
  }
  if (scanTotal !== total) throw new Error('batch certification scan did not reproduce total stake');
  return { totalStakeUma: total, selectedVoterCount: count, selectedBaseCost, selectedPositions };
}

/**
 * Minimum sufficient reward on the one-cent grid for one realized normalized
 * cost vector and every scenario scale. Throws when the batch is infeasible or
 * a certificate fails.
 */
export function minimumCentRewards(
  stakesUma: Float64Array,
  normalizedCosts: Float64Array,
  requiredStakeUma: number,
  scales: readonly number[],
  collectSelected = false,
): { results: TrialScenarioResult[]; sorted: SortedCandidates } {
  const n = stakesUma.length;
  if (n === 0) throw new Error('at least one candidate is required');
  if (normalizedCosts.length !== n) throw new Error('invalid batch stake/cost dimensions');
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(stakesUma[i]) || stakesUma[i] <= 0) throw new Error('batch stakes must be finite and positive');
    if (!Number.isFinite(normalizedCosts[i]) || normalizedCosts[i] < 0) throw new Error('batch costs must be finite and nonnegative');
  }
  if (!Number.isFinite(requiredStakeUma) || requiredStakeUma <= 0) throw new Error('required stake must be finite and positive');
  for (const scale of scales) {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('scenario scales must be finite and positive');
  }
  const capacityUma = kahanTotal(stakesUma);
  if (!coverageReached(capacityUma, requiredStakeUma)) throw new Error('batch is structurally infeasible');

  const sorted = sortCandidates(stakesUma, normalizedCosts, capacityUma);
  let k = -1;
  for (let p = 0; p < n; p += 1) {
    if (coverageReached(sorted.cumulative[p], requiredStakeUma)) {
      k = p;
      break;
    }
  }
  if (k < 0) throw new Error('feasible batch has a non-covering sorted row');
  const etaK = sorted.eta[k];
  const universalLower = etaK * requiredStakeUma;
  let feasibleUpper = etaK * sorted.cumulative[k];
  if (!admitted(sorted, feasibleUpper, 1, requiredStakeUma)) {
    feasibleUpper = nextUp(feasibleUpper);
    let doublings = 0;
    while (!admitted(sorted, feasibleUpper, 1, requiredStakeUma)) {
      feasibleUpper = Math.max(feasibleUpper * 2, CONTINUOUS_TOLERANCE_USD);
      doublings += 1;
      if (doublings > MAX_UPPER_DOUBLINGS) throw new Error('failed to construct a feasible reward upper bound');
    }
  }

  const results: TrialScenarioResult[] = [];
  for (const scale of scales) {
    const scaledLower = (universalLower * scale) / POSTED_REWARD_GRID_USD;
    const scaledUpper = (feasibleUpper * scale) / POSTED_REWARD_GRID_USD;
    if (!Number.isFinite(scaledLower) || !Number.isFinite(scaledUpper) || scaledLower < 0 || scaledUpper < scaledLower || scaledUpper > MAX_EXACT_TICK_INDEX) {
      throw new Error('batch cent-grid reward exceeds the exact reward-grid numerical range');
    }
    // Keep the lower endpoint strictly below the analytic bound (floor − 1).
    let lowerTick = Math.floor(scaledLower) - 1;
    let upperTick = Math.ceil(scaledUpper);
    let adjustments = 0;
    while (!admitted(sorted, upperTick / 100, scale, requiredStakeUma)) {
      upperTick += 1;
      adjustments += 1;
      if (adjustments > MAX_CENT_UPPER_ADJUSTMENTS) throw new Error('failed to construct feasible cent upper bounds');
    }
    let iterations = 0;
    while (upperTick - lowerTick > 1) {
      const midTick = lowerTick + Math.floor((upperTick - lowerTick) / 2);
      if (admitted(sorted, midTick / 100, scale, requiredStakeUma)) upperTick = midTick;
      else lowerTick = midTick;
      iterations += 1;
      if (iterations > MAX_CENT_ITERATIONS) throw new Error('batch cent bisection failed to converge');
    }
    const postedRewardUsd = upperTick / 100;
    const metrics = scanMetrics(sorted, postedRewardUsd, scale, collectSelected);
    if (!coverageReached(metrics.totalStakeUma, requiredStakeUma)) throw new Error('posted reward does not cover required stake');
    if (upperTick > 0 && admitted(sorted, (upperTick - 1) / 100, scale, requiredStakeUma)) throw new Error('posted reward is not the minimum cent reward');
    const selectedDirectCostUsd = metrics.selectedBaseCost * scale;
    if (postedRewardUsd + 1e-8 < selectedDirectCostUsd) throw new Error('posted pool is below selected direct costs');
    results.push({
      postedRewardUsd,
      selectedVoterCount: metrics.selectedVoterCount,
      selectedStakeUma: metrics.totalStakeUma,
      selectedDirectCostUsd,
      selectedPositions: metrics.selectedPositions,
    });
  }
  return { results, sorted };
}

/** Fewest voters that cover the requirement when taken in descending stake order (Python stake_desc_minimum_count). */
export function stakeDescMinimumCount(stakesUma: Float64Array, requiredStakeUma: number): number | null {
  if (stakesUma.length === 0) return null;
  const capacityUma = kahanTotal(stakesUma);
  if (!coverageReached(capacityUma, requiredStakeUma)) return null;
  const descending = Float64Array.from(stakesUma).sort().reverse();
  let total = 0;
  let correction = 0;
  for (let p = 0; p < descending.length; p += 1) {
    const adjusted = descending[p] - correction;
    const updated = total + adjusted;
    correction = updated - total - adjusted;
    total = updated;
    const prefix = p === descending.length - 1 ? capacityUma : total;
    if (coverageReached(prefix, requiredStakeUma)) return p + 1;
  }
  throw new Error('capacity-feasible stake vector has no covering prefix');
}

/** Inverse Herfindahl index of the stake vector (Python effective_validator_count). */
export function effectiveValidatorCount(stakesUma: Float64Array): number {
  if (stakesUma.length === 0) return 0;
  const total = kahanTotal(stakesUma);
  let sumOfSquares = 0;
  for (let i = 0; i < stakesUma.length; i += 1) sumOfSquares += stakesUma[i] * stakesUma[i];
  return total > 0 ? (total * total) / sumOfSquares : 0;
}
