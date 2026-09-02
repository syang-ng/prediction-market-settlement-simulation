/**
 * Browser counterfactual: the actual stake distribution of one DVM round, a
 * hypothetical open interest, and the frozen participation-cost model.
 */

import type { ScenarioName, SecurityConstants, StakeSnapshot } from '../types';
import { COST_MULTIPLIER_LOWER, COST_MULTIPLIER_UPPER, drawNormalizedCosts } from './costs';
import { effectiveValidatorCount, minimumCentRewards, stakeDescMinimumCount } from './greedy';
import { coverageReached, kahanTotal } from './numerics';
import { createPrng, seedMaterial } from './prng';
import { shareAtMost, sortedCopy, summarize } from './stats';
import type {
  CounterfactualParams,
  CounterfactualResult,
  FirstDraw,
  ModelConstants,
  PreparedSnapshot,
  Requirement,
  ScenarioSummary,
} from './types';

export const SCENARIO_ORDER: ScenarioName[] = ['low', 'baseline', 'high'];

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function prepareSnapshot(snapshot: StakeSnapshot): PreparedSnapshot {
  const stakes = Float64Array.from(snapshot.stakesUma);
  return { snapshot, stakes, capacityUma: kahanTotal(stakes) };
}

/** r_USD = κ · OI / α, r_UMA = r_USD / P_UMA, required = r_UMA / slash; capacity uses the one-ulp coverage rule. */
export function computeRequirement(prepared: PreparedSnapshot, oiUsd: number, security: SecurityConstants): Requirement {
  const price = prepared.snapshot.umaPriceUsd;
  const securityLoadUsd = (security.attackCaptureFraction * oiUsd) / security.corruptionThreshold;
  const securityLoadUma = securityLoadUsd / price;
  const requiredStakeUma = securityLoadUma / security.slashFraction;
  const { capacityUma } = prepared;
  const feasible = coverageReached(capacityUma, requiredStakeUma);
  const shortfallUma = feasible ? 0 : requiredStakeUma - capacityUma;
  return {
    securityLoadUsd,
    securityLoadUma,
    requiredStakeUma,
    capacityUma,
    capacityUsd: capacityUma * price,
    capacityRatio: capacityUma / requiredStakeUma,
    feasible,
    shortfallUma,
    shortfallUsd: shortfallUma * price,
    maxSecurableOiUsd: (capacityUma * price * security.corruptionThreshold) / security.attackCaptureFraction,
  };
}

export function runCounterfactual(prepared: PreparedSnapshot, params: CounterfactualParams, model: ModelConstants): CounterfactualResult {
  const started = now();
  if (!Number.isFinite(params.oiUsd) || params.oiUsd <= 0) throw new Error('open interest must be a positive number');
  if (!Number.isInteger(params.trials) || params.trials < 1) throw new Error('trials must be a positive integer');
  if (!Number.isSafeInteger(params.seed) || params.seed < 0) throw new Error('seed must be a non-negative integer');

  const { stakes, snapshot } = prepared;
  const requirement = computeRequirement(prepared, params.oiUsd, model.security);
  const candidates = {
    count: stakes.length,
    stakeDescMinimumVoterCount: requirement.feasible ? stakeDescMinimumCount(stakes, requirement.requiredStakeUma) : null,
    effectiveCandidateCount: effectiveValidatorCount(stakes),
  };
  const input = { ...params, ...model.security, round: snapshot.round };
  if (!requirement.feasible) {
    return { input, requirement, candidates, scenarios: null, timingMs: now() - started };
  }

  const scales = SCENARIO_ORDER.map((name) => model.costModel.scenarioMeansUsd[name]);
  const rng = createPrng(seedMaterial(params.seed, snapshot.round));
  const costs = new Float64Array(stakes.length);
  const posted = scales.map(() => new Float64Array(params.trials));
  const counts = scales.map(() => new Float64Array(params.trials));
  const selectedStake = scales.map(() => new Float64Array(params.trials));
  const directCost = scales.map(() => new Float64Array(params.trials));
  const firstDraws: FirstDraw[] = [];

  for (let trial = 0; trial < params.trials; trial += 1) {
    drawNormalizedCosts(rng, costs, model.costModel.correlation);
    const { results, sorted } = minimumCentRewards(stakes, costs, requirement.requiredStakeUma, scales, trial === 0);
    for (let s = 0; s < scales.length; s += 1) {
      posted[s][trial] = results[s].postedRewardUsd;
      counts[s][trial] = results[s].selectedVoterCount;
      selectedStake[s][trial] = results[s].selectedStakeUma;
      directCost[s][trial] = results[s].selectedDirectCostUsd;
      if (trial === 0) {
        firstDraws[s] = {
          rewardUsd: results[s].postedRewardUsd,
          selectedStakeUma: results[s].selectedStakeUma,
          selectedDirectCostUsd: results[s].selectedDirectCostUsd,
          voters: (results[s].selectedPositions ?? []).map((position) => ({
            index: sorted.order[position],
            stakeUma: sorted.stakes[position],
            costUsd: sorted.baseCosts[position] * scales[s],
          })),
        };
      }
    }
  }

  const scenarios = {} as Record<ScenarioName, ScenarioSummary>;
  SCENARIO_ORDER.forEach((name, s) => {
    const required = requirement.requiredStakeUma;
    const excess = new Float64Array(params.trials);
    const coverage = new Float64Array(params.trials);
    const rewardToCost = new Float64Array(params.trials);
    const surplus = new Float64Array(params.trials);
    for (let trial = 0; trial < params.trials; trial += 1) {
      excess[trial] = selectedStake[s][trial] - required;
      coverage[trial] = selectedStake[s][trial] / required;
      rewardToCost[trial] = posted[s][trial] / directCost[s][trial];
      surplus[trial] = posted[s][trial] - directCost[s][trial];
    }
    scenarios[name] = {
      name,
      meanCostUsd: scales[s],
      costLowerUsd: COST_MULTIPLIER_LOWER * scales[s],
      costUpperUsd: COST_MULTIPLIER_UPPER * scales[s],
      postedReward: summarize(posted[s]),
      selectedVoterCount: summarize(counts[s]),
      selectedStakeUma: summarize(selectedStake[s]),
      excessStakeUma: summarize(excess),
      coverageRatio: summarize(coverage),
      selectedDirectCost: summarize(directCost[s]),
      rewardToCost: summarize(rewardToCost),
      participantSurplus: summarize(surplus),
      budgetCapShares: model.budgetCapsUsd.map((capUsd) => ({ capUsd, share: shareAtMost(posted[s], capUsd) })),
      postedRewardsSorted: Array.from(sortedCopy(posted[s])),
      firstDraw: firstDraws[s],
    };
  });

  return { input, requirement, candidates, scenarios, timingMs: now() - started };
}
