import { describe, expect, it } from 'vitest';
import type { StakeSnapshot, StakeSnapshotDefaults } from '../types';
import {
  maxSecurableOiUsd,
  nearestSnapshotIndex,
  parseView,
  sanitizeOi,
  sanitizeSeed,
  sanitizeTrials,
  serializeView,
} from './counterfactualParams';

function snapshot(round: number, anchorDisputeUtc: string, unionStakeUma = 1_000_000, umaPriceUsd = 2): StakeSnapshot {
  return {
    round,
    windowStartUtc: '',
    windowEndUtc: '',
    anchorDisputeUtc,
    anchorUnitId: `em_${round}`,
    anchorRank: round,
    umaPriceUsd,
    umaPriceMethod: 'test',
    cumulativeStakeAtRoundUma: unionStakeUma,
    voterCount: 1,
    unionStakeUma,
    stakesUma: [unionStakeUma],
    attempts: [],
  };
}

const snapshots = [
  snapshot(9720, '2023-03-22T18:11:54Z'),
  snapshot(9733, '2023-04-18T19:44:45Z'),
  snapshot(10303, '2026-05-31T16:57:20Z'),
];
const defaults: StakeSnapshotDefaults = { oiUsd: 1_000_000, seed: 20260821, trials: 1000, maxTrials: 5000, budgetCapsUsd: [50, 100, 200] };

describe('parseView', () => {
  it('falls back to the latest round and the file defaults', () => {
    expect(parseView(new URLSearchParams(), snapshots, defaults)).toEqual({ round: 10303, oiUsd: 1_000_000, seed: 20260821, trials: 1000, scenario: 'baseline' });
  });

  it('accepts valid parameters and rounds open interest to cents', () => {
    const view = parseView(new URLSearchParams('round=9733&oi=250000.129&seed=7&trials=250&scenario=high'), snapshots, defaults);
    expect(view).toEqual({ round: 9733, oiUsd: 250000.13, seed: 7, trials: 250, scenario: 'high' });
  });

  it('replaces invalid values and clamps trials', () => {
    const view = parseView(new URLSearchParams('round=1&oi=-5&seed=1.5&trials=99999&scenario=medium'), snapshots, defaults);
    expect(view).toEqual({ round: 10303, oiUsd: 1_000_000, seed: 20260821, trials: 5000, scenario: 'baseline' });
    expect(parseView(new URLSearchParams('trials=0'), snapshots, defaults).trials).toBe(1);
    expect(parseView(new URLSearchParams('seed=0'), snapshots, defaults).seed).toBe(0);
  });

  it('round-trips through serializeView', () => {
    const view = { round: 9720, oiUsd: 1234.5, seed: 3, trials: 42, scenario: 'low' as const };
    expect(serializeView(view).toString()).toBe('round=9720&oi=1234.5&seed=3&trials=42&scenario=low');
    expect(parseView(serializeView(view), snapshots, defaults)).toEqual(view);
  });
});

describe('sanitizers', () => {
  it('normalize open interest, seed, and trials', () => {
    expect(sanitizeOi(1e6, 1)).toBe(1e6);
    expect(sanitizeOi(0.004, 1)).toBe(1);
    expect(sanitizeOi(NaN, 1)).toBe(1);
    expect(sanitizeOi(1e308, 1)).toBe(1);
    expect(sanitizeSeed(5, 1)).toBe(5);
    expect(sanitizeSeed(-1, 1)).toBe(1);
    expect(sanitizeSeed(2 ** 53, 1)).toBe(1);
    expect(sanitizeTrials(7, 1000, 5000)).toBe(7);
    expect(sanitizeTrials(0, 1000, 5000)).toBe(1);
    expect(sanitizeTrials(1e9, 1000, 5000)).toBe(5000);
    expect(sanitizeTrials(2.5, 1000, 5000)).toBe(1000);
  });
});

describe('nearestSnapshotIndex', () => {
  it('snaps to the nearest anchor day and prefers the earlier round on ties', () => {
    expect(nearestSnapshotIndex(snapshots, '2023-03-22')).toBe(0);
    expect(nearestSnapshotIndex(snapshots, '2023-04-30')).toBe(1);
    expect(nearestSnapshotIndex(snapshots, '2030-01-01')).toBe(2);
    const tied = [snapshot(1, '2024-01-01T12:00:00Z'), snapshot(2, '2024-01-03T12:00:00Z')];
    expect(nearestSnapshotIndex(tied, '2024-01-02')).toBe(0);
  });
});

describe('maxSecurableOiUsd', () => {
  it('is capacity × price × α / κ', () => {
    const security = { corruptionThreshold: 0.5, attackCaptureFraction: 1, slashFraction: 1 };
    expect(maxSecurableOiUsd(snapshot(1, '2024-01-01T00:00:00Z', 4_000_000, 0.5), security)).toBe(1_000_000);
  });
});
