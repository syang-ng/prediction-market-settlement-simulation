import type { CostModelConstants, Quantiles, ScenarioName, SecurityConstants, StakeSnapshot } from '../types';

export interface PreparedSnapshot {
  snapshot: StakeSnapshot;
  stakes: Float64Array;
  /** Kahan total of the positive stakes: the simulator's capacity measure. */
  capacityUma: number;
}

export interface CounterfactualParams {
  oiUsd: number;
  seed: number;
  trials: number;
}

export interface ModelConstants {
  security: SecurityConstants;
  costModel: CostModelConstants;
  budgetCapsUsd: number[];
}

export interface Requirement {
  securityLoadUsd: number;
  securityLoadUma: number;
  requiredStakeUma: number;
  capacityUma: number;
  capacityUsd: number;
  capacityRatio: number;
  feasible: boolean;
  shortfallUma: number;
  shortfallUsd: number;
  maxSecurableOiUsd: number;
}

export interface DrawVoter {
  /** Canonical index of the voter in the snapshot's stake vector. */
  index: number;
  stakeUma: number;
  costUsd: number;
}

export interface FirstDraw {
  rewardUsd: number;
  selectedStakeUma: number;
  selectedDirectCostUsd: number;
  /** Selected voters in greedy scan order. */
  voters: DrawVoter[];
}

export interface BudgetCapShare {
  capUsd: number;
  share: number;
}

export interface ScenarioSummary {
  name: ScenarioName;
  meanCostUsd: number;
  costLowerUsd: number;
  costUpperUsd: number;
  postedReward: Quantiles;
  selectedVoterCount: Quantiles;
  selectedStakeUma: Quantiles;
  excessStakeUma: Quantiles;
  coverageRatio: Quantiles;
  selectedDirectCost: Quantiles;
  rewardToCost: Quantiles;
  participantSurplus: Quantiles;
  budgetCapShares: BudgetCapShare[];
  postedRewardsSorted: number[];
  firstDraw: FirstDraw;
}

export interface CounterfactualInput extends CounterfactualParams, SecurityConstants {
  round: number;
}

export interface CounterfactualResult {
  input: CounterfactualInput;
  requirement: Requirement;
  candidates: {
    count: number;
    stakeDescMinimumVoterCount: number | null;
    effectiveCandidateCount: number;
  };
  /** Null when the snapshot cannot cover the requirement. */
  scenarios: Record<ScenarioName, ScenarioSummary> | null;
  timingMs: number;
}
