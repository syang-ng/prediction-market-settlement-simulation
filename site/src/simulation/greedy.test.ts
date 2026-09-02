import { describe, expect, it } from 'vitest';
import { effectiveValidatorCount, minimumCentRewards, stakeDescMinimumCount } from './greedy';
import { kahanTotal } from './numerics';
import { FIXTURE_ROUNDS, FIXTURE_SCENARIOS, expectRelative, loadFixture } from './testFixtures';

describe('hand-checked three-voter case', () => {
  // Three voters with 10 UMA each and unit normalized cost: η = 0.1 for all.
  // Coverage of 20 UMA needs two voters; the second is admitted when
  // R ≥ 0.1 × 20 = 2.00, and 1.99 leaves only one voter, so 2.00 is minimal.
  const stakes = Float64Array.from([10, 10, 10]);
  const costs = Float64Array.from([1, 1, 1]);

  it('finds the minimum cent reward and its metrics at scale 1 and scale 2', () => {
    const { results } = minimumCentRewards(stakes, costs, 20, [1, 2]);
    expect(results[0]).toMatchObject({ postedRewardUsd: 2, selectedVoterCount: 2, selectedStakeUma: 20, selectedDirectCostUsd: 2 });
    expect(results[1]).toMatchObject({ postedRewardUsd: 4, selectedVoterCount: 2, selectedStakeUma: 20, selectedDirectCostUsd: 4 });
  });

  it('reports selected canonical positions when asked', () => {
    const { results, sorted } = minimumCentRewards(stakes, costs, 20, [1], true);
    expect(results[0].selectedPositions).toEqual([0, 1]);
    expect(Array.from(sorted.order)).toEqual([0, 1, 2]);
  });

  it('rejects a structurally infeasible batch and invalid inputs', () => {
    expect(() => minimumCentRewards(stakes, costs, 31, [1])).toThrow('structurally infeasible');
    expect(() => minimumCentRewards(Float64Array.from([10, 0]), Float64Array.from([1, 1]), 5, [1])).toThrow('finite and positive');
    expect(() => minimumCentRewards(stakes, costs, 0, [1])).toThrow('required stake');
  });

  it('computes the stake-descending minimum count and the effective count', () => {
    expect(stakeDescMinimumCount(stakes, 20)).toBe(2);
    expect(stakeDescMinimumCount(stakes, 31)).toBeNull();
    expect(stakeDescMinimumCount(new Float64Array(0), 1)).toBeNull();
    expect(effectiveValidatorCount(stakes)).toBe(3);
    expect(effectiveValidatorCount(Float64Array.from([30, 10]))).toBe(1600 / 1000);
  });
});

for (const round of FIXTURE_ROUNDS) {
  describe(`Python fixture round ${round}`, () => {
    const fixture = loadFixture(round);
    const stakes = Float64Array.from(fixture.stakesUma);
    const scales = FIXTURE_SCENARIOS.map((name) => fixture.scenarioScales[name]);

    it('reproduces the Python capacity total exactly', () => {
      expect(kahanTotal(stakes)).toBe(fixture.capacityUma);
    });

    it('reproduces every posted reward, count, stake, and direct cost exactly', () => {
      for (let trial = 0; trial < fixture.trials; trial += 1) {
        const costs = Float64Array.from(fixture.normalizedCosts[trial]);
        const { results } = minimumCentRewards(stakes, costs, fixture.requiredStakeUma, scales);
        for (let s = 0; s < scales.length; s += 1) {
          expect(results[s].postedRewardUsd).toBe(fixture.expected.postedRewardUsd[trial][s]);
          expect(results[s].selectedVoterCount).toBe(fixture.expected.selectedVoterCount[trial][s]);
          expect(results[s].selectedStakeUma).toBe(fixture.expected.selectedStakeUma[trial][s]);
          expect(results[s].selectedDirectCostUsd).toBe(fixture.expected.selectedDirectCostUsd[trial][s]);
        }
      }
    });

    it('reproduces the stake-descending minimum and the effective candidate count', () => {
      expect(stakeDescMinimumCount(stakes, fixture.requiredStakeUma)).toBe(fixture.stakeDescMinimumVoterCount);
      expectRelative(effectiveValidatorCount(stakes), fixture.effectiveCandidateCount, 1e-9);
    });
  });
}
