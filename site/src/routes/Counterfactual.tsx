'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import RewardEcdf from '../components/RewardEcdf';
import SiteHeader from '../components/SiteHeader';
import StakeTimeline from '../components/StakeTimeline';
import { formatCount, formatPercent, formatRatio, formatUma, formatUsd } from '../lib';
import { SCENARIO_ORDER, prepareSnapshot, runCounterfactual } from '../simulation/counterfactual';
import type { CounterfactualResult, ModelConstants, ScenarioSummary } from '../simulation/types';
import type { Quantiles, ScenarioName, StakeSnapshotFile } from '../types';
import {
  maxSecurableOiUsd,
  nearestSnapshotIndex,
  parseView,
  sanitizeOi,
  sanitizeSeed,
  sanitizeTrials,
  serializeView,
  type CounterfactualView,
} from './counterfactualParams';

const scenarioLabels: Record<ScenarioName, string> = {
  low: 'Low · $0.20 mean',
  baseline: 'Baseline · $1 mean',
  high: 'High · $4 mean',
};
const quantileKeys = ['p10', 'p50', 'p90', 'p99', 'mean'] as const;

interface RunState {
  key: string;
  result: CounterfactualResult | null;
  error: string | null;
}

function runKey(round: number, oiUsd: number, seed: number, trials: number): string {
  return `${round}|${oiUsd}|${seed}|${trials}`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const end = new Date(endIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${start} – ${end}`;
}

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

/** Uncontrolled numeric field that applies on Enter or blur; the DOM value follows the URL without remounting so focus survives a commit. */
function NumberField({
  label,
  value,
  hint,
  min,
  step,
  sanitize,
  onCommit,
}: {
  label: string;
  value: number;
  hint: string;
  min: number;
  step: number | 'any';
  sanitize: (raw: number) => number;
  onCommit: (value: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Resync the text when the URL-derived value changes, but never while the user is editing.
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.value = String(value);
  }, [value]);
  const commit = () => {
    const input = inputRef.current;
    if (!input) return;
    const next = sanitize(Number(input.value.trim() === '' ? NaN : input.value));
    input.value = String(next);
    if (next !== value) onCommit(next);
  };
  return (
    <label className="cf-field">
      <span>{label}</span>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        defaultValue={String(value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <small>{hint}</small>
    </label>
  );
}

function QuantileLine({ label, values, format }: { label: string; values: Quantiles; format: (value: number | null) => string }) {
  return (
    <div className="cf-quantile-row" role="row">
      <strong role="rowheader">{label}</strong>
      {quantileKeys.map((key) => (
        <span role="cell" key={key}>{format(values[key])}</span>
      ))}
    </div>
  );
}

function ScenarioTable({ scenario }: { scenario: ScenarioSummary }) {
  const usd = (value: number | null) => formatUsd(value);
  const count = (value: number | null) => formatCount(value);
  const uma = (value: number | null) => formatUma(value);
  const ratio = (value: number | null) => formatRatio(value);
  return (
    <section aria-label={`${scenarioLabels[scenario.name]} results`}>
      <div className="cf-scenario-title">
        <h3>{scenarioLabels[scenario.name]}</h3>
        <span>cost support {formatUsd(scenario.costLowerUsd)}–{formatUsd(scenario.costUpperUsd)} · ρ = 0.80 · Beta(2, 8)</span>
      </div>
      <div role="table" aria-label={`${scenarioLabels[scenario.name]} quantiles`}>
        <div className="cf-quantile-head" role="row">
          <span role="columnheader" aria-label="Statistic" />
          {quantileKeys.map((key) => (
            <span role="columnheader" key={key}>{key}</span>
          ))}
        </div>
        <QuantileLine label="Posted reward" values={scenario.postedReward} format={usd} />
        <QuantileLine label="Selected voters" values={scenario.selectedVoterCount} format={count} />
        <QuantileLine label="Selected stake" values={scenario.selectedStakeUma} format={uma} />
        <QuantileLine label="Selected direct cost" values={scenario.selectedDirectCost} format={usd} />
        <QuantileLine label="Reward ÷ direct cost" values={scenario.rewardToCost} format={ratio} />
      </div>
      <div className="cf-shares">
        {scenario.budgetCapShares.map((item) => (
          <span key={item.capUsd}>≤ {formatUsd(item.capUsd)}: {formatPercent(item.share)} of trials</span>
        ))}
      </div>
    </section>
  );
}

function DrawIllustration({ scenario }: { scenario: ScenarioSummary }) {
  const draw = scenario.firstDraw;
  const shown = draw.voters.slice(0, 10);
  const span = scenario.costUpperUsd - scenario.costLowerUsd;
  return (
    <div className="cost-visual cf-draw">
      <div className="cost-head">
        <span className="data-label simulated">One reproducible draw · trial 0 · {scenarioLabels[scenario.name]}</span>
        <span>cost support {formatUsd(scenario.costLowerUsd)}–{formatUsd(scenario.costUpperUsd)}</span>
      </div>
      <div className="voter-costs">
        {shown.map((voter, position) => (
          <div className="voter-cost" key={voter.index}>
            <div className="voter-dot">V{position + 1}</div>
            <div className="cost-track"><i style={{ width: `${(100 * (voter.costUsd - scenario.costLowerUsd)) / span}%` }} /></div>
            <strong>{formatUsd(voter.costUsd)}</strong>
            <small>{formatUma(voter.stakeUma)}</small>
          </div>
        ))}
        {draw.voters.length > shown.length && <div className="voter-overflow">+ {draw.voters.length - shown.length} additional selected voters</div>}
      </div>
      <div className="reward-output">
        <div><span>Posted reward · this draw</span><strong>{formatUsd(draw.rewardUsd)}</strong><small>minimum one-cent greedy certificate</small></div>
        <div><span>Selected stake</span><strong>{formatUma(draw.selectedStakeUma)}</strong><small>{draw.voters.length} voter{draw.voters.length === 1 ? '' : 's'}</small></div>
        <div className="illustrative-output"><span>Direct cost</span><strong>{formatUsd(draw.selectedDirectCostUsd)}</strong><small>sum of selected verification costs</small></div>
      </div>
    </div>
  );
}

export default function CounterfactualPage({ params, setParams }: { params: URLSearchParams; setParams: (params: URLSearchParams) => void }) {
  const [file, setFile] = useState<StakeSnapshotFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);

  useEffect(() => {
    fetch('./data/stake_snapshots.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Data request failed (${response.status})`);
        return response.json() as Promise<StakeSnapshotFile>;
      })
      .then(setFile)
      .catch((reason: Error) => setLoadError(reason.message));
  }, []);

  const view = useMemo(() => (file ? parseView(params, file.snapshots, file.meta.defaults) : null), [file, params]);
  const index = useMemo(() => (file && view ? file.snapshots.findIndex((snapshot) => snapshot.round === view.round) : -1), [file, view]);
  const prepared = useMemo(() => (file && index >= 0 ? prepareSnapshot(file.snapshots[index]) : null), [file, index]);
  const model = useMemo<ModelConstants | null>(
    () => (file ? { security: file.meta.security, costModel: file.meta.costModel, budgetCapsUsd: file.meta.defaults.budgetCapsUsd } : null),
    [file],
  );
  const oiUsd = view?.oiUsd ?? null;
  const seed = view?.seed ?? null;
  const trials = view?.trials ?? null;

  // Make the URL fully explicit once the file is loaded (defaults are written too).
  useEffect(() => {
    if (!view) return;
    const explicit = serializeView(view);
    if (explicit.toString() !== params.toString()) setParams(explicit);
  }, [view, params, setParams]);

  // Run on the next tick so the controls repaint before the synchronous simulation.
  useEffect(() => {
    if (!prepared || !model || oiUsd === null || seed === null || trials === null) return;
    const key = runKey(prepared.snapshot.round, oiUsd, seed, trials);
    let timeout = 0;
    const frame = window.requestAnimationFrame(() => {
      timeout = window.setTimeout(() => {
        try {
          setRun({ key, result: runCounterfactual(prepared, { oiUsd, seed, trials }, model), error: null });
        } catch (reason) {
          setRun({ key, result: null, error: reason instanceof Error ? reason.message : String(reason) });
        }
      }, 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [prepared, model, oiUsd, seed, trials]);

  if (loadError) return <main className="load-state"><strong>Unable to load the stake snapshots.</strong><span>{loadError}</span></main>;
  if (!file || !view || !prepared || !model) return <main className="load-state"><span className="loading-orb" /><strong>Loading stake snapshots…</strong></main>;

  const { snapshots, meta } = file;
  const snapshot = prepared.snapshot;
  const security = meta.security;
  const update = (patch: Partial<CounterfactualView>) => setParams(serializeView({ ...view, ...patch }));
  const selectRound = (nextIndex: number) => update({ round: snapshots[nextIndex].round });
  const currentKey = runKey(snapshot.round, view.oiUsd, view.seed, view.trials);
  const computing = run?.key !== currentKey;
  const result = run?.result ?? null;
  const requirement = result?.requirement ?? null;
  const scenarios = result?.scenarios ?? null;
  const highlighted = scenarios ? scenarios[view.scenario] : null;
  const maxSecurable = maxSecurableOiUsd(snapshot, security);
  const revealerShare = snapshot.cumulativeStakeAtRoundUma > 0 ? snapshot.unionStakeUma / snapshot.cumulativeStakeAtRoundUma : 0;

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader route="/counterfactual" />
      <main id="main" className="cf-page">
        <span className="eyebrow">COUNTERFACTUAL SIMULATION</span>
        <h1 tabIndex={-1}>Historical stake, hypothetical open interest.</h1>
        <p className="cf-standfirst">
          Given the actual UMA voter stake distribution on a chosen date, what participation reward would have been required to securely settle a market with the open interest you specify? Historical Polymarket disputes are usually small; this page keeps the observed stake and replaces only the open interest.
        </p>
        <ul className="cf-deviations" aria-label="Differences from the main simulation">
          <li>Population: union of the round’s revealers</li>
          <li>Open interest: hypothetical</li>
          <li>Cost draws: seeded browser PRNG</li>
        </ul>

        <section className="cf-card" aria-labelledby="cf-when">
          <div className="cf-card-head"><h2 id="cf-when">When</h2><span className="data-label observed">Observed stake</span></div>
          <div className="cf-card-body">
            <StakeTimeline snapshots={snapshots} selectedIndex={index} oiUsd={view.oiUsd} security={security} onSelect={selectRound} />
            <div className="cf-scrub">
              <button type="button" className="cf-step" onClick={() => selectRound(index - 1)} disabled={index === 0}>← Earlier round</button>
              <input
                type="range"
                min={0}
                max={snapshots.length - 1}
                value={index}
                aria-label="DVM round"
                aria-valuetext={`Round ${snapshot.round}, ${formatDay(snapshot.anchorDisputeUtc)}`}
                onChange={(event) => selectRound(Number(event.target.value))}
              />
              <input
                type="date"
                aria-label="Snap to the round nearest a date"
                min={isoDay(snapshots[0].anchorDisputeUtc)}
                max={isoDay(snapshots[snapshots.length - 1].anchorDisputeUtc)}
                value={isoDay(snapshot.anchorDisputeUtc)}
                onChange={(event) => {
                  if (event.target.value) selectRound(nearestSnapshotIndex(snapshots, event.target.value));
                }}
              />
              <button type="button" className="cf-step" onClick={() => selectRound(index + 1)} disabled={index === snapshots.length - 1}>Later round →</button>
            </div>
            <p className="cf-caption">
              <strong>DVM round {snapshot.round}</strong> · voting window {formatWindow(snapshot.windowStartUtc, snapshot.windowEndUtc)} · anchor dispute {formatDay(snapshot.anchorDisputeUtc)}
            </p>
          </div>
          <div className="cf-inputs">
            <NumberField label="Open interest (USD)" value={view.oiUsd} hint="hypothetical market size" min={0.01} step="any" sanitize={(raw) => sanitizeOi(raw, view.oiUsd)} onCommit={(value) => update({ oiUsd: value })} />
            <NumberField label="Seed" value={view.seed} hint="same seed, same draws" min={0} step={1} sanitize={(raw) => sanitizeSeed(raw, view.seed)} onCommit={(value) => update({ seed: value })} />
            <NumberField label="Trials" value={view.trials} hint={`1 to ${meta.defaults.maxTrials.toLocaleString()} cost draws`} min={1} step={1} sanitize={(raw) => sanitizeTrials(raw, view.trials, meta.defaults.maxTrials)} onCommit={(value) => update({ trials: value })} />
            <fieldset className="scenario-control">
              <legend>Highlight scenario</legend>
              <div>
                {SCENARIO_ORDER.map((name) => (
                  <button type="button" key={name} aria-pressed={view.scenario === name} className={view.scenario === name ? 'selected' : ''} onClick={() => update({ scenario: name })}>{scenarioLabels[name]}</button>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              className="cf-step"
              onClick={() => setParams(serializeView({ round: snapshots[snapshots.length - 1].round, oiUsd: meta.defaults.oiUsd, seed: meta.defaults.seed, trials: meta.defaults.trials, scenario: 'baseline' }))}
            >
              Reset to defaults
            </button>
          </div>
        </section>

        <section className="cf-card" aria-labelledby="cf-snapshot">
          <div className="cf-card-head"><h2 id="cf-snapshot">Snapshot</h2><span className="data-label observed">Observed</span></div>
          <div className="cf-card-body">
            <div className="cf-facts">
              <div><span>DVM round</span><strong>{snapshot.round}</strong><small>{formatWindow(snapshot.windowStartUtc, snapshot.windowEndUtc)}</small></div>
              <div><span>Anchor dispute</span><strong>{formatDay(snapshot.anchorDisputeUtc)}</strong><small>earliest dispute voted in this round</small></div>
              <div><span>UMA price</span><strong>{formatUsd(snapshot.umaPriceUsd)}</strong><small>{snapshot.umaPriceMethod.replaceAll('_', ' ')}</small></div>
              <div><span>Positive-stake voters</span><strong>{snapshot.voterCount.toLocaleString()}</strong><small>revealers, not all stakers</small></div>
              <div><span>Available stake</span><strong>{formatUma(snapshot.unionStakeUma, false)}</strong><small>{formatUsd(snapshot.unionStakeUma * snapshot.umaPriceUsd)} at the anchor price</small></div>
              <div><span>Share of round stake</span><strong>{formatPercent(revealerShare)}</strong><small>of {formatUma(snapshot.cumulativeStakeAtRoundUma)} staked in the round</small></div>
              <div><span>Max securable OI</span><strong>{formatUsd(maxSecurable, true)}</strong><small>available stake × price × α</small></div>
            </div>
          </div>
        </section>

        <section className="cf-card" aria-labelledby="cf-requirement">
          <div className="cf-card-head"><h2 id="cf-requirement">Requirement</h2><span className="data-label simulated">Counterfactual</span></div>
          <div className={`cf-card-body${computing ? ' cf-computing' : ''}`} aria-busy={computing}>
            {requirement ? (
              <>
                <div className="exposure-visual cf-chain">
                  <div className="market-orb"><span>hypothetical OI</span><strong>{formatUsd(view.oiUsd, true)}</strong></div>
                  <div className="operator">÷</div>
                  <div className="parameter-stack"><span>α = {security.corruptionThreshold.toFixed(2)}</span><span>κ = {security.attackCaptureFraction.toFixed(2)}</span><span>UMA = {formatUsd(snapshot.umaPriceUsd)}</span></div>
                  <div className="operator">→</div>
                  <div className="load-orb"><span>required r</span><strong>{formatUma(requirement.requiredStakeUma)}</strong><small>{formatUsd(requirement.securityLoadUsd, true)}</small></div>
                </div>
                <div className="capacity-visual">
                  <div className="capacity-row"><span>Required load</span><div><i style={{ width: `${Math.min(100, 100 / Math.max(1, requirement.capacityRatio))}%` }} /></div><strong>{formatUma(requirement.requiredStakeUma)}</strong></div>
                  <div className="capacity-row candidate"><span>Available stake</span><div><i style={{ width: `${Math.min(100, 100 * Math.min(1, requirement.capacityRatio))}%` }} /></div><strong>{formatUma(requirement.capacityUma)}</strong></div>
                  <div className={`gate ${requirement.feasible ? 'open' : 'closed'}`}><span>{requirement.feasible ? 'ADMIT' : 'REJECT'}</span></div>
                </div>
                {requirement.feasible ? (
                  <p className="stage-decision admit">✓ Stake-feasible: available stake is {formatRatio(requirement.capacityRatio)} the required load. Stake-descending minimum {formatCount(result?.candidates.stakeDescMinimumVoterCount)} voter{result?.candidates.stakeDescMinimumVoterCount === 1 ? '' : 's'}; effective candidate count {result ? result.candidates.effectiveCandidateCount.toFixed(1) : '—'}.</p>
                ) : (
                  <p className="stage-decision reject">× Not stake-feasible: short by {formatUma(requirement.shortfallUma)} ({formatUsd(requirement.shortfallUsd, true)}). The largest open interest this snapshot can secure is {formatUsd(requirement.maxSecurableOiUsd, true)}; a larger reward cannot create stake.</p>
                )}
              </>
            ) : (
              <p className="cf-status">{run?.error ? `Simulation error: ${run.error}` : 'Computing…'}</p>
            )}
          </div>
        </section>

        <section className="cf-card" aria-labelledby="cf-results">
          <div className="cf-card-head"><h2 id="cf-results">Simulation</h2><span className="data-label simulated">Simulated</span></div>
          <div className={`cf-card-body${computing ? ' cf-computing' : ''}`} aria-busy={computing}>
            {computing && <p className="cf-status">Computing {view.trials.toLocaleString()} trials…</p>}
            {run?.error && !computing && <div className="no-certificate"><strong>Certification failed</strong><p>{run.error}</p></div>}
            {scenarios && highlighted && result ? (
              <>
                <div className="cf-headline">
                  <div><span>Minimum sufficient reward · {scenarioLabels[view.scenario]} · p50</span><strong>{formatUsd(highlighted.postedReward.p50)}</strong><small>{view.trials.toLocaleString()} cost draws</small></div>
                  <div><span>p90</span><strong>{formatUsd(highlighted.postedReward.p90)}</strong><small>9 in 10 draws settle at or below</small></div>
                  <div><span>p99</span><strong>{formatUsd(highlighted.postedReward.p99)}</strong><small>99th percentile</small></div>
                </div>
                {SCENARIO_ORDER.map((name) => <ScenarioTable key={name} scenario={scenarios[name]} />)}
                <RewardEcdf scenarios={scenarios} highlighted={view.scenario} />
                <DrawIllustration scenario={highlighted} />
                <p className="cf-repro">seed {view.seed} · {view.trials.toLocaleString()} trials · xoshiro128** · Beta(2, 8) by order statistics · computed in {Math.round(result.timingMs)} ms</p>
              </>
            ) : (
              !computing && !run?.error && requirement && !requirement.feasible && (
                <div className="no-certificate"><strong>No sufficient reward reported</strong><p>The round’s revealers together do not cover the required load at this open interest.</p></div>
              )
            )}
          </div>
        </section>

        <ol className="cf-method" aria-label="Method note">
          <li>The voter population is the union of revealers across every attempt voted in the selected DVM round, with the stake each held in that round. It is not every UMA staker, so available stake is a lower bound.</li>
          <li>Only the open interest is hypothetical. The UMA price is the anchor dispute’s stored Coinbase hourly price; stakes are the stored revealer stakes.</li>
          <li>Security follows the frozen data: r_USD = κ · OI / α with α = {security.corruptionThreshold} and κ = {security.attackCaptureFraction}, r_UMA = r_USD / P_UMA, slash fraction {security.slashFraction}. Feasibility uses the simulator’s one-ulp coverage rule.</li>
          <li>Costs follow the same model as the main simulation (Beta(2, 8), support [0.25μ, 4μ], ρ = {meta.costModel.correlation}). The browser draws them with a seeded PRNG, so quantiles agree with the Python engine in distribution, not draw by draw; the greedy construction and cent-grid search are verified identical on shared inputs.</li>
          <li>Not reported: the continuous reward bracket and rounding overhead, which the site does not show elsewhere.</li>
        </ol>
      </main>
    </>
  );
}
