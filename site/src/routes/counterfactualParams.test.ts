import { describe, expect, it } from 'vitest';
import type { StakeSnapshot, StakeSnapshotDefaults } from '../types';
import {
  maxSecurableOiUsd,
  nearestSnapshotIndex,
  parseView,
  sanitizeOi,
  sanitizeRho,
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
const CALIBRATED_RHO = 0.8;

const parse = (query: string) => parseView(new URLSearchParams(query), snapshots, defaults, CALIBRATED_RHO);

describe('parseView', () => {
  it('falls back to the latest round, the file defaults, and the calibrated correlation', () => {
    expect(parse('')).toEqual({ round: 10303, oiUsd: 1_000_000, seed: 20260821, trials: 1000, rho: 0.8, scenario: 'baseline' });
  });

  it('accepts valid parameters and rounds open interest to cents', () => {
    const view = parse('round=9733&oi=250000.129&seed=7&trials=250&rho=0.35&scenario=high');
    expect(view).toEqual({ round: 9733, oiUsd: 250000.13, seed: 7, trials: 250, rho: 0.35, scenario: 'high' });
  });

  it('replaces invalid values and clamps trials and correlation', () => {
    const view = parse('round=1&oi=-5&seed=1.5&trials=99999&rho=2&scenario=medium');
    expect(view).toEqual({ round: 10303, oiUsd: 1_000_000, seed: 20260821, trials: 5000, rho: 1, scenario: 'baseline' });
    expect(parse('trials=0').trials).toBe(1);
    expect(parse('seed=0').seed).toBe(0);
    expect(parse('rho=-3').rho).toBe(0);
    expect(parse('rho=abc').rho).toBe(0.8);
    expect(parse('rho=').rho).toBe(0.8);
  });

  it('keeps both correlation endpoints, which are meaningful settings rather than errors', () => {
    expect(parse('rho=0').rho).toBe(0);
    expect(parse('rho=1').rho).toBe(1);
  });

  it('round-trips through serializeView', () => {
    const view = { round: 9720, oiUsd: 1234.5, seed: 3, trials: 42, rho: 0.35, scenario: 'low' as const };
    expect(serializeView(view).toString()).toBe('round=9720&oi=1234.5&seed=3&trials=42&rho=0.35&scenario=low');
    expect(parseView(serializeView(view), snapshots, defaults, CALIBRATED_RHO)).toEqual(view);
  });

  it('is idempotent, so making the URL explicit settles in one pass', () => {
    const once = parse('round=9733&rho=0.125');
    const twice = parseView(serializeView(once), snapshots, defaults, CALIBRATED_RHO);
    expect(twice).toEqual(once);
    expect(serializeView(twice).toString()).toBe(serializeView(once).toString());
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

  it('clamp correlation into [0, 1] and keep hand-typed precision', () => {
    expect(sanitizeRho(0.35, 0.8)).toBe(0.35);
    expect(sanitizeRho(0.125, 0.8)).toBe(0.125);
    expect(sanitizeRho(0, 0.8)).toBe(0);
    expect(sanitizeRho(1, 0.8)).toBe(1);
    expect(sanitizeRho(-1, 0.8)).toBe(0);
    expect(sanitizeRho(4, 0.8)).toBe(1);
    expect(sanitizeRho(NaN, 0.8)).toBe(0.8);
    expect(sanitizeRho(Infinity, 0.8)).toBe(0.8);
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
