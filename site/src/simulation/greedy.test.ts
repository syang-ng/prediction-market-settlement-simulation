import { describe, expect, it } from 'vitest';
import { createGreedyWorkspace, effectiveValidatorCount, minimumCentRewards, sortCandidates, stakeDescMinimumCount } from './greedy';
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

  it('maps selected positions back to canonical indices through sorted.order', () => {
    // η = 2/10 = 0.2, 1/40 = 0.025, 3/20 = 0.15 → sorted order [1, 2, 0]; coverage of 50 needs the first two.
    const heterogeneousStakes = Float64Array.from([10, 40, 20]);
    const heterogeneousCosts = Float64Array.from([2, 1, 3]);
    const { results, sorted } = minimumCentRewards(heterogeneousStakes, heterogeneousCosts, 50, [1], true);
    expect(Array.from(sorted.order)).toEqual([1, 2, 0]);
    expect(results[0]).toMatchObject({ postedRewardUsd: 9, selectedVoterCount: 2, selectedStakeUma: 60 });
    expect(results[0].selectedPositions).toEqual([0, 1]);
    expect(results[0].selectedPositions?.map((position) => sorted.order[position])).toEqual([1, 2]);
  });

  it('rejects a structurally infeasible batch and invalid inputs', () => {
    expect(() => minimumCentRewards(stakes, costs, 31, [1])).toThrow('structurally infeasible');
    expect(() => minimumCentRewards(Float64Array.from([10, 0]), Float64Array.from([1, 1]), 5, [1])).toThrow('finite and positive');
    expect(() => minimumCentRewards(stakes, costs, 0, [1])).toThrow('required stake');
    expect(() => minimumCentRewards(stakes, costs, 20, [])).toThrow('scenario scales');
  });

  it('computes the stake-descending minimum count and the effective count', () => {
    expect(stakeDescMinimumCount(stakes, 20)).toBe(2);
    expect(stakeDescMinimumCount(stakes, 31)).toBeNull();
    expect(stakeDescMinimumCount(new Float64Array(0), 1)).toBeNull();
    expect(effectiveValidatorCount(stakes)).toBe(3);
    expect(effectiveValidatorCount(Float64Array.from([30, 10]))).toBe(1600 / 1000);
  });

  it('breaks equal η ties by canonical index', () => {
    // η: 0.1, 0.05, 0.1, 0.05 → sorted order [1, 3, 0, 2]
    const tied = sortCandidates(Float64Array.from([10, 20, 30, 40]), Float64Array.from([1, 1, 3, 2]), 100);
    expect(Array.from(tied.order)).toEqual([1, 3, 0, 2]);
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

    it('sorts identically with a reused workspace and preserves stable tie-breaks', () => {
      const workspace = createGreedyWorkspace(stakes.length);
      for (let trial = 0; trial < 4; trial += 1) {
        const costs = Float64Array.from(fixture.normalizedCosts[trial]);
        const fresh = sortCandidates(stakes, costs, fixture.capacityUma);
        const reused = sortCandidates(stakes, costs, fixture.capacityUma, workspace);
        expect(Array.from(reused.order)).toEqual(Array.from(fresh.order));
        expect(Array.from(reused.cumulative)).toEqual(Array.from(fresh.cumulative));
      }
    });
  });
}
