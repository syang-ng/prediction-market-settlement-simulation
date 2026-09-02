export type ScenarioName = 'low' | 'baseline' | 'high';
export type QuantileKey = 'p10' | 'p50' | 'p90' | 'p99';
export type OracleVariant =
  | 'polygon_oo_v2'
  | 'polygon_managed_oo_v2'
  | 'polygon_oo_v1_legacy';

export interface OracleSourceSummary {
  variant: OracleVariant;
  label: string;
  sourceUrl: string;
  rawCount: number;
  eligibleCount: number;
  attemptCount: number;
}

export interface Quantiles {
  p10: number | null;
  p50: number | null;
  p90: number | null;
  p99: number | null;
  mean: number | null;
}

export interface SelectedVoter {
  id: string;
  stakeUma: number;
  costUsd: number;
}

export interface Illustration {
  rewardUsd: number;
  selectedStakeUma: number;
  selectedDirectCostUsd: number;
  selectedVoters: SelectedVoter[];
}

export interface ScenarioResult {
  meanCostUsd: number;
  costLowerUsd: number;
  costUpperUsd: number;
  postedReward: Quantiles;
  selectedVoterCount: Quantiles;
  selectedStakeUma: Quantiles;
  selectedDirectCost: Quantiles;
  coverageRatio: Quantiles;
  rewardToCost: Quantiles;
  illustration: Illustration | null;
}

export interface RollingMarketResult {
  feasibleShare: number;
  priorLocksInducedInfeasibleShare: number;
  residualRequiresMoreVotersShare: number;
  preAdmissionActiveLoadUma: Quantiles;
  postedReward: Quantiles;
  selectedVoterCount: Quantiles;
}

export interface Market {
  id: string;
  rank: number;
  question: string;
  slug: string;
  conditionId: string;
  requestId: string;
  eventId: string;
  oracleVariant: OracleVariant;
  oracleSourceUrl: string;
  oracleSourceId: string;
  componentOracleVariants: OracleVariant[];
  componentCount: number;
  unitKind: 'ordinary_request' | 'neg_risk_event_round';
  disputeUtc: string;
  releaseUtc: string;
  dvmRound: number;
  tooEarly: boolean;
  negRisk: boolean;
  oiUsd: number;
  conditionOiUsd: number;
  bundleConditionCount: number;
  oiScope: string;
  umaPriceUsd: number;
  securityLoadUsd: number;
  securityLoadUma: number;
  capacityRatio: number;
  feasible: boolean;
  candidates: {
    observedRevealerCount: number;
    candidateCount: number;
    candidateStakeUma: number;
    stakeDescMinimumVoterCount: number | null;
    effectiveCandidateCount: number;
  };
  scenarios: Record<ScenarioName, ScenarioResult>;
  rollingBaseline: RollingMarketResult;
}

export interface PanelSummary {
  scenario: ScenarioName;
  unitCount: number;
  feasibleCount: number;
  feasibleShare: number;
  postedReward: Quantiles;
  selectedVoterCount: Quantiles;
  selectedDirectCost: Quantiles;
}

export interface DashboardData {
  meta: {
    inventoryCount: number;
    sourceRequestCount: number;
    economicUnitCount: number;
    ordinaryUnitCount: number;
    negRiskUnitCount: number;
    negRiskEventCount: number;
    excludedCount: number;
    cutoffUtc: string;
    trialsPerUnitScenario: number;
    masterSeed: number;
    costCorrelation: number;
    corruptionThreshold: number;
    attackCaptureFraction: number;
    slashFraction: number;
    reviewWindowDays: number;
    groupingRule: string;
    oiRule: string;
    oracleSources: OracleSourceSummary[];
  };
  panelSummaries: PanelSummary[];
  comparison: {
    fullRelease: {
      admissionShare: number;
      postedReward: Quantiles;
      selectedVoterCount: Quantiles;
      totalRewardHistoryMeanUsd: number;
    };
    rolling2d: {
      admissionShare: number;
      capacityReducedShare: number;
      priorLocksInducedInfeasibleShare: number;
      residualRequiresMoreVotersShare: number;
      preAdmissionActiveLoadUma: Quantiles;
      postedReward: Quantiles;
      selectedVoterCount: Quantiles;
      pathTotalRewardUsd: Quantiles;
      pathPeakActiveLoadUma: Quantiles;
    };
  };
  limitations: string[];
  markets: Market[];
}

// --- Counterfactual stake snapshots (public/data/stake_snapshots.json) ---

export interface StakeSnapshotAttempt {
  unitId: string;
  rank: number;
  question: string;
  negRisk: boolean;
  oiUsd: number;
  feasible: boolean;
  baselineRewardP50Usd: number | null;
}

export interface StakeSnapshot {
  round: number;
  windowStartUtc: string;
  windowEndUtc: string;
  anchorDisputeUtc: string;
  anchorUnitId: string;
  anchorRank: number;
  umaPriceUsd: number;
  umaPriceMethod: string;
  cumulativeStakeAtRoundUma: number;
  voterCount: number;
  unionStakeUma: number;
  /** Positive stakes in canonical order (lowercase voter address ascending). */
  stakesUma: number[];
  attempts: StakeSnapshotAttempt[];
}

export interface SecurityConstants {
  corruptionThreshold: number;
  attackCaptureFraction: number;
  slashFraction: number;
}

export interface CostModelConstants {
  beta: [number, number];
  multiplierSupport: [number, number];
  scenarioMeansUsd: Record<ScenarioName, number>;
  correlation: number;
}

export interface StakeSnapshotDefaults {
  oiUsd: number;
  seed: number;
  trials: number;
  maxTrials: number;
  budgetCapsUsd: number[];
}

export interface StakeSnapshotMeta {
  schema: string;
  panelSha256: string;
  voterSha256: string;
  snapshotRule: string;
  anchorRule: string;
  roundWindowSeconds: number;
  security: SecurityConstants;
  costModel: CostModelConstants;
  defaults: StakeSnapshotDefaults;
  roundCount: number;
  positiveStakeCount: number;
}

export interface StakeSnapshotFile {
  meta: StakeSnapshotMeta;
  snapshots: StakeSnapshot[];
}
