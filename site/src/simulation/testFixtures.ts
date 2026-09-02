import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { Quantiles, ScenarioName } from '../types';

export interface Fixture {
  round: number;
  anchorUnitId: string;
  umaPriceUsd: number;
  oiUsd: number;
  security: { corruptionThreshold: number; attackCaptureFraction: number; slashFraction: number };
  requiredStakeUma: number;
  capacityUma: number;
  scenarioScales: Record<ScenarioName, number>;
  trials: number;
  correlation: number;
  masterSeed: number;
  costSeed: number;
  stakesUma: number[];
  normalizedCosts: number[][];
  expected: {
    postedRewardUsd: number[][];
    selectedVoterCount: number[][];
    selectedStakeUma: number[][];
    selectedDirectCostUsd: number[][];
  };
  expectedQuantiles: Record<
    ScenarioName,
    Record<'postedRewardUsd' | 'selectedVoterCount' | 'selectedStakeUma' | 'selectedDirectCostUsd', Quantiles>
  >;
  stakeDescMinimumVoterCount: number | null;
  effectiveCandidateCount: number;
}

export const FIXTURE_ROUNDS = [9733, 10196] as const;
export const FIXTURE_SCENARIOS: ScenarioName[] = ['low', 'baseline', 'high'];

const here = fileURLToPath(new URL('.', import.meta.url));

export function loadFixture(round: number): Fixture {
  return JSON.parse(readFileSync(`${here}__fixtures__/round-${round}.json`, 'utf8')) as Fixture;
}

export function expectRelative(actual: number, expected: number, tolerance: number): void {
  const scale = Math.max(Math.abs(expected), 1e-300);
  expect(Math.abs(actual - expected) / scale).toBeLessThanOrEqual(tolerance);
}
