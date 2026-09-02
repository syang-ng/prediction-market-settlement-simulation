import { clamp } from '../lib';
import type { ScenarioName, SecurityConstants, StakeSnapshot, StakeSnapshotDefaults } from '../types';

/** Page state, kept in the hash query: #/counterfactual?round=&oi=&seed=&trials=&scenario= */
export interface CounterfactualView {
  round: number;
  oiUsd: number;
  seed: number;
  trials: number;
  scenario: ScenarioName;
}

const SCENARIOS: ScenarioName[] = ['low', 'baseline', 'high'];

/** NaN when the parameter is absent or blank so callers fall back to a default. */
function numberParam(params: URLSearchParams, key: string): number {
  const text = params.get(key);
  return text === null || text.trim() === '' ? NaN : Number(text);
}

/** Positive open interest rounded to cents; otherwise the fallback. */
export function sanitizeOi(raw: number, fallback: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  const rounded = Math.round(raw * 100) / 100;
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
}

/** Non-negative safe integer; otherwise the fallback. */
export function sanitizeSeed(raw: number, fallback: number): number {
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : fallback;
}

/** Integer clamped to [1, maxTrials]; otherwise the fallback. */
export function sanitizeTrials(raw: number, fallback: number, maxTrials: number): number {
  return Number.isInteger(raw) ? clamp(raw, 1, maxTrials) : fallback;
}

export function parseView(params: URLSearchParams, snapshots: StakeSnapshot[], defaults: StakeSnapshotDefaults): CounterfactualView {
  const requestedRound = numberParam(params, 'round');
  const round = snapshots.some((snapshot) => snapshot.round === requestedRound)
    ? requestedRound
    : snapshots[snapshots.length - 1].round;
  const scenarioText = params.get('scenario');
  return {
    round,
    oiUsd: sanitizeOi(numberParam(params, 'oi'), defaults.oiUsd),
    seed: sanitizeSeed(numberParam(params, 'seed'), defaults.seed),
    trials: sanitizeTrials(numberParam(params, 'trials'), defaults.trials, defaults.maxTrials),
    scenario: SCENARIOS.find((name) => name === scenarioText) ?? 'baseline',
  };
}

/** Every field is written, defaults included, so a copied link is fully explicit. */
export function serializeView(view: CounterfactualView): URLSearchParams {
  return new URLSearchParams({
    round: String(view.round),
    oi: String(view.oiUsd),
    seed: String(view.seed),
    trials: String(view.trials),
    scenario: view.scenario,
  });
}

/** Index of the snapshot whose anchor dispute is nearest to a UTC calendar day; ties go to the earlier round. */
export function nearestSnapshotIndex(snapshots: StakeSnapshot[], isoDay: string): number {
  const [year, month, day] = isoDay.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, 12);
  let best = 0;
  let bestDistance = Infinity;
  snapshots.forEach((snapshot, index) => {
    const distance = Math.abs(Date.parse(snapshot.anchorDisputeUtc) - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Largest OI the snapshot can secure: capacity × price × α / κ — the same expression computeRequirement uses. */
export function maxSecurableOiUsd(snapshot: StakeSnapshot, security: SecurityConstants): number {
  return (snapshot.unionStakeUma * snapshot.umaPriceUsd * security.corruptionThreshold) / security.attackCaptureFraction;
}
