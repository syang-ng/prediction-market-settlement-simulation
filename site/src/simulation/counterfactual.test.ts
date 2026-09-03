import { describe, expect, it } from 'vitest';
import type { StakeSnapshot } from '../types';
import { SCENARIO_ORDER, computeRequirement, prepareSnapshot, runCounterfactual } from './counterfactual';
import { kahanTotal } from './numerics';
import { expectRelative, loadFixture } from './testFixtures';
import type { CounterfactualResult, ModelConstants } from './types';

function snapshotFromFixture(round: number): StakeSnapshot {
  const fixture = loadFixture(round);
  return {
    round: fixture.round,
    windowStartUtc: '',
    windowEndUtc: '',
    anchorDisputeUtc: '2000-01-01T00:00:00Z',
    anchorUnitId: fixture.anchorUnitId,
    anchorRank: 0,
    umaPriceUsd: fixture.umaPriceUsd,
    umaPriceMethod: 'fixture',
    cumulativeStakeAtRoundUma: 0,
    voterCount: fixture.stakesUma.length,
    unionStakeUma: fixture.capacityUma,
    stakesUma: fixture.stakesUma,
    attempts: [],
  };
}

const model: ModelConstants = {
  security: { corruptionThreshold: 0.5, attackCaptureFraction: 1.0, slashFraction: 1.0 },
  costModel: { beta: [2, 8], multiplierSupport: [0.25, 4], scenarioMeansUsd: { low: 0.2, baseline: 1, high: 4 }, correlation: 0.8 },
  budgetCapsUsd: [50, 100, 200],
};
const small = prepareSnapshot(snapshotFromFixture(9733));
const params = { oiUsd: 1_000_000, seed: 20260821, trials: 200, correlation: 0.8 };
const strip = (result: CounterfactualResult) => JSON.stringify({ ...result, timingMs: 0 });

describe('computeRequirement', () => {
  it('applies the frozen security rule r_USD = κ·OI/α, r_UMA = r_USD / P', () => {
    const requirement = computeRequirement(small, 1_000_000, model.security);
    expect(requirement.securityLoadUsd).toBe(2_000_000);
    expect(requirement.securityLoadUma).toBe(2_000_000 / small.snapshot.umaPriceUsd);
    expect(requirement.requiredStakeUma).toBe(requirement.securityLoadUma);
    expect(requirement.capacityUma).toBe(loadFixture(9733).capacityUma);
    expect(requirement.feasible).toBe(true);
    expect(requirement.shortfallUma).toBe(0);
    expectRelative(requirement.maxSecurableOiUsd, requirement.capacityUma * small.snapshot.umaPriceUsd * 0.5, 1e-12);
  });

  it('flips to infeasible just above the maximum securable open interest', () => {
    const max = computeRequirement(small, 1, model.security).maxSecurableOiUsd;
    expect(computeRequirement(small, max * 0.999, model.security).feasible).toBe(true);
    const over = computeRequirement(small, max * 1.001, model.security);
    expect(over.feasible).toBe(false);
    expect(over.shortfallUma).toBeGreaterThan(0);
    expectRelative(over.shortfallUsd, over.shortfallUma * small.snapshot.umaPriceUsd, 1e-12);
  });
});

describe('runCounterfactual', () => {
  it('is deterministic for equal inputs and sensitive to the seed', () => {
    const first = runCounterfactual(small, params, model);
    const second = runCounterfactual(small, params, model);
    expect(strip(second)).toBe(strip(first));
    expect(strip(runCounterfactual(small, { ...params, seed: 7 }, model))).not.toBe(strip(first));
  });

  it('draws trial 0 identically regardless of the trial count', () => {
    const short = runCounterfactual(small, { ...params, trials: 3 }, model);
    const long = runCounterfactual(small, params, model);
    for (const name of SCENARIO_ORDER) {
      expect(long.scenarios?.[name].firstDraw).toEqual(short.scenarios?.[name].firstDraw);
    }
  });

  it('reports internally consistent summaries', () => {
    const result = runCounterfactual(small, params, model);
    const scenarios = result.scenarios;
    if (!scenarios) throw new Error('expected a feasible run');
    expect(result.candidates.count).toBe(55);
    expect(result.candidates.stakeDescMinimumVoterCount).toBe(loadFixture(9733).stakeDescMinimumVoterCount);
    for (const name of SCENARIO_ORDER) {
      const scenario = scenarios[name];
      expect(scenario.name).toBe(name);
      expect(scenario.meanCostUsd).toBe(model.costModel.scenarioMeansUsd[name]);
      const reward = scenario.postedReward;
      expect(reward.p10 as number).toBeLessThanOrEqual(reward.p50 as number);
      expect(reward.p50 as number).toBeLessThanOrEqual(reward.p90 as number);
      expect(reward.p90 as number).toBeLessThanOrEqual(reward.p99 as number);
      expect(scenario.postedRewardsSorted).toHaveLength(params.trials);
      for (let i = 1; i < scenario.postedRewardsSorted.length; i += 1) {
        expect(scenario.postedRewardsSorted[i]).toBeGreaterThanOrEqual(scenario.postedRewardsSorted[i - 1]);
      }
      expect(scenario.budgetCapShares.map((item) => item.capUsd)).toEqual([50, 100, 200]);
      for (let i = 0; i < scenario.budgetCapShares.length; i += 1) {
        const share = scenario.budgetCapShares[i].share;
        expect(share >= 0 && share <= 1).toBe(true);
        if (i > 0) expect(share).toBeGreaterThanOrEqual(scenario.budgetCapShares[i - 1].share);
      }
      const draw = scenario.firstDraw;
      expect(kahanTotal(draw.voters.map((voter) => voter.stakeUma))).toBe(draw.selectedStakeUma);
      expectRelative(draw.voters.reduce((sum, voter) => sum + voter.costUsd, 0), draw.selectedDirectCostUsd, 1e-9);
      for (const voter of draw.voters) {
        expect(voter.costUsd >= scenario.costLowerUsd && voter.costUsd <= scenario.costUpperUsd).toBe(true);
        expect(voter.stakeUma).toBe(small.stakes[voter.index]);
      }
    }
  });

  it('returns no scenarios when the requirement is infeasible', () => {
    const max = computeRequirement(small, 1, model.security).maxSecurableOiUsd;
    const result = runCounterfactual(small, { ...params, oiUsd: max * 1.001 }, model);
    expect(result.scenarios).toBeNull();
    expect(result.requirement.feasible).toBe(false);
    expect(result.candidates.stakeDescMinimumVoterCount).toBeNull();
    expect(result.firstDrawDistinctCostCount).toBeNull();
  });

  it('rejects invalid parameters', () => {
    expect(() => runCounterfactual(small, { ...params, oiUsd: 0 }, model)).toThrow('open interest');
    expect(() => runCounterfactual(small, { ...params, trials: 0 }, model)).toThrow('trials');
    expect(() => runCounterfactual(small, { ...params, seed: -1 }, model)).toThrow('seed');
    expect(() => runCounterfactual(small, { ...params, seed: 1.5 }, model)).toThrow('seed');
    expect(() => runCounterfactual(small, { ...params, oiUsd: Number.NaN }, model)).toThrow('open interest');
    expect(() => runCounterfactual(small, { ...params, trials: 2.5 }, model)).toThrow('trials');
    expect(() => runCounterfactual(small, { ...params, correlation: -0.1 }, model)).toThrow('correlation');
    expect(() => runCounterfactual(small, { ...params, correlation: 1.1 }, model)).toThrow('correlation');
    expect(() => runCounterfactual(small, { ...params, correlation: Number.NaN }, model)).toThrow('correlation');
  });

  it('completes the largest round at 1,000 trials well inside the budget', () => {
    const large = prepareSnapshot(snapshotFromFixture(10196));
    const result = runCounterfactual(large, { oiUsd: 1_000_000, seed: 20260821, trials: 1000, correlation: 0.8 }, model);
    console.log(`largest round (1,012 voters): ${result.timingMs.toFixed(0)} ms for 1,000 trials × 3 scenarios`);
    // The product budget is 500 ms on a 2020-class laptop and is enforced by the browser
    // check in the plan's verification task; this unit guard only has to catch a regression
    // of several times that without becoming flaky on slower CI machines.
    expect(result.timingMs).toBeLessThan(2000);
  });

  it('reproduces the pinned results of the reference implementation', () => {
    const result = runCounterfactual(small, params, model);
    const baseline = result.scenarios?.baseline;
    if (!baseline) throw new Error('expected a feasible run');
    expect(baseline.postedReward).toEqual({ p10: 0.45, p50: 0.78, p90: 1.623, p99: 2.2500999999999998, mean: 0.9016000000000001 });
    expect(result.scenarios?.low.postedReward.p50).toBe(0.16);
    expect(result.scenarios?.high.postedReward.p50).toBe(3.105);
    expect(baseline.selectedVoterCount.p50).toBe(1);
    expect(baseline.postedRewardsSorted[0]).toBe(0.28);
    expect(baseline.postedRewardsSorted[199]).toBe(2.31);
    expect(baseline.firstDraw.rewardUsd).toBe(0.71);
    expect(baseline.firstDraw.voters).toHaveLength(1);
    expect(baseline.firstDraw.voters[0]).toEqual({ index: 40, stakeUma: 991489.0981927107, costUsd: 0.7093994096401002 });
  });
});

describe('runCounterfactual cost correlation', () => {
  it('takes the correlation from the run parameters, not the frozen model constant', () => {
    const independent = runCounterfactual(small, { ...params, correlation: 0 }, model);
    const collapsed = runCounterfactual(small, { ...params, correlation: 1 }, model);
    expect(strip(independent)).not.toBe(strip(runCounterfactual(small, params, model)));
    expect(independent.input.correlation).toBe(0);
    expect(collapsed.input.correlation).toBe(1);
    // The model constant is only the calibrated default now; changing it must not move a run.
    const otherModel = { ...model, costModel: { ...model.costModel, correlation: 0.1 } };
    expect(strip(runCounterfactual(small, params, otherModel))).toBe(strip(runCounterfactual(small, params, model)));
  });

  it('counts the distinct cost values of the first draw across every candidate', () => {
    expect(runCounterfactual(small, { ...params, correlation: 0 }, model).firstDrawDistinctCostCount).toBe(55);
    expect(runCounterfactual(small, { ...params, correlation: 1 }, model).firstDrawDistinctCostCount).toBe(1);
    const calibrated = runCounterfactual(small, params, model).firstDrawDistinctCostCount as number;
    expect(calibrated).toBeGreaterThan(1);
    expect(calibrated).toBeLessThan(55);
  });

  it('leaves trial 0 selected voters on identical costs when they share the common draw', () => {
    const collapsed = runCounterfactual(small, { ...params, correlation: 1 }, model);
    const voters = collapsed.scenarios?.baseline.firstDraw.voters ?? [];
    expect(voters.length).toBeGreaterThan(0);
    for (const voter of voters) expect(voter.costUsd).toBe(voters[0].costUsd);
  });

  it('collapses the draw monotonically as the correlation rises', () => {
    // The common-value set nests under a shared stream layout (costs.test.ts pins that directly),
    // so from one seed the distinct-value count can only fall as rho rises. Not a statistical claim.
    const counts = [0, 0.2, 0.5, 0.8, 0.9, 1].map(
      (correlation) => runCounterfactual(small, { ...params, correlation }, model).firstDrawDistinctCostCount as number,
    );
    expect(counts[0]).toBe(55);
    expect(counts[counts.length - 1]).toBe(1);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
  });
});
