'use client';

import { useEffect, useMemo, useState } from 'react';
import SiteHeader from './components/SiteHeader';
import { formatCount, formatPercent, formatRatio, formatUma, formatUsd, shortId } from './lib';
import type { DashboardData, Market, OracleVariant, QuantileKey, Quantiles, ScenarioName } from './types';

const scenarioLabels: Record<ScenarioName, string> = {
  low: 'Low · $0.20 mean',
  baseline: 'Baseline · $1 mean',
  high: 'High · $4 mean',
};

const quantileLabels: Record<QuantileKey, string> = {
  p10: 'p10',
  p50: 'p50',
  p90: 'p90',
  p99: 'p99',
};

const oracleLabels: Record<OracleVariant, string> = {
  polygon_oo_v2: 'Standard OOv2',
  polygon_managed_oo_v2: 'Managed OOv2',
  polygon_oo_v1_legacy: 'Legacy OOv1',
};

const processSteps = [
  { title: 'Group', copy: 'Define one economic settlement attempt before measuring exposure.' },
  { title: 'Exposure', copy: 'Freeze corrected historical open interest immediately before arrival.' },
  { title: 'Load', copy: 'Convert the dollar security requirement into dispute-time UMA.' },
  { title: 'Capacity', copy: 'Check all observed positive-stake revealers under full release.' },
  { title: 'Costs', copy: 'Draw a bounded verification cost for every candidate voter.' },
  { title: 'Greedy', copy: 'Order voters by cost per stake and build a sufficient equilibrium.' },
  { title: 'Reward', copy: 'Binary-search the minimum sufficient reward on a one-cent grid.' },
  { title: 'Settle', copy: 'Paying verification cost reveals the correct outcome deterministically.' },
];

function QuantileRow({ label, values, currency = true }: { label: string; values: Quantiles; currency?: boolean }) {
  return (
    <div className="quantile-row">
      <strong>{label}</strong>
      {(['p10', 'p50', 'p90', 'p99'] as QuantileKey[]).map((key) => (
        <span key={key}>{currency ? formatUsd(values[key]) : formatCount(values[key])}</span>
      ))}
    </div>
  );
}

function MarketStatus({ market }: { market: Market }) {
  return market.feasible ? (
    <span className="market-status feasible"><span aria-hidden="true">✓</span> Full-release feasible</span>
  ) : (
    <span className="market-status infeasible"><span aria-hidden="true">×</span> Capacity-infeasible</span>
  );
}

function UnitBadge({ market }: { market: Market }) {
  return (
    <span className={market.negRisk ? 'unit-badge bundle' : 'unit-badge'}>
      {market.negRisk ? `NegRisk event-round · ${market.componentCount} request${market.componentCount === 1 ? '' : 's'}` : 'Ordinary request'} · {oracleLabels[market.oracleVariant]}
    </span>
  );
}

function ProcessSimulator({
  market,
  scenario,
  percentile,
  onScenario,
  onPercentile,
  markets,
  trials,
  onMarket,
  onDetails,
}: {
  market: Market;
  scenario: ScenarioName;
  percentile: QuantileKey;
  onScenario: (scenario: ScenarioName) => void;
  onPercentile: (percentile: QuantileKey) => void;
  markets: Market[];
  trials: number;
  onMarket: (id: string) => void;
  onDetails: () => void;
}) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const result = market.scenarios[scenario];
  const illustration = result.illustration;
  const finalStep = market.feasible ? 7 : 3;
  const shownVoters = illustration?.selectedVoters.slice(0, 10) ?? [];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= finalStep) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, finalStep]);

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (step >= finalStep) setStep(0);
    setPlaying(true);
  };

  return (
    <section className="simulation-section" id="simulation">
      <div className="section-intro inverse">
        <div><span className="eyebrow">INTERACTIVE WALKTHROUGH</span><h2>From market exposure to sufficient reward.</h2></div>
        <p>Select any settlement attempt and follow the same grouping, greedy construction, and cent-grid search used in the experiment.</p>
      </div>

      <div className="simulator-controls">
        <label className="market-select">
          <span>Settlement attempt</span>
          <select value={market.id} onChange={(event) => onMarket(event.target.value)}>
            {markets.map((option) => <option key={option.id} value={option.id}>#{option.rank} · {option.question}</option>)}
          </select>
        </label>
        <fieldset className="scenario-control">
          <legend>Cost scenario</legend>
          <div>
            {(Object.keys(scenarioLabels) as ScenarioName[]).map((name) => (
              <button type="button" aria-pressed={scenario === name} className={scenario === name ? 'selected' : ''} onClick={() => onScenario(name)} key={name}>{scenarioLabels[name]}</button>
            ))}
          </div>
        </fieldset>
        <label className="percentile-control">
          <span>Show statistic</span>
          <select value={percentile} onChange={(event) => onPercentile(event.target.value as QuantileKey)}>
            {(Object.keys(quantileLabels) as QuantileKey[]).map((key) => <option key={key} value={key}>{quantileLabels[key]}</option>)}
          </select>
        </label>
        <button type="button" className="replay-button" onClick={togglePlayback}>
          <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing ? ' Pause' : step >= finalStep ? ' Replay' : ' Play'}
        </button>
      </div>

      <div className="protocol-card">
        <div className="protocol-topline">
          <div><UnitBadge market={market} /><h3>{market.question}</h3></div>
          <MarketStatus market={market} />
        </div>

        <div className="protocol-progress" aria-label={`Simulation step ${step + 1} of ${finalStep + 1}`}>
          <span style={{ width: `${(step / finalStep) * 100}%` }} />
          {processSteps.map((item, index) => (
            <button
              type="button"
              key={item.title}
              className={`${index <= step ? 'reached' : ''} ${index === step ? 'current' : ''} ${index > finalStep ? 'disabled' : ''}`}
              onClick={() => { if (index <= finalStep) { setStep(index); setPlaying(false); } }}
              disabled={index > finalStep}
              aria-current={index === step ? 'step' : undefined}
            >
              <i>{index + 1}</i><span>{item.title}</span>
            </button>
          ))}
        </div>

        <div className="protocol-stage" aria-live="polite">
          <div className="stage-copy">
            <span className="step-kicker">STEP {step + 1} / {finalStep + 1}</span>
            <h3>{processSteps[step].title}</h3>
            <p>{processSteps[step].copy}</p>
            {step === 0 && <p className="stage-note">{market.negRisk ? `Grouped by event and DVM round: ${market.componentCount} source requests share one reward pool.` : 'One ordinary binary request is one settlement attempt.'}</p>}
            {step === 1 && <p className="stage-note">OI scope: {market.oiScope}. {market.negRisk ? `${market.bundleConditionCount} active event conditions are summed once.` : 'The disputed condition is used directly.'}</p>}
            {step === 2 && <p className="stage-formula">r = OI / (0.50 × P<sub>UMA</sub>) = {formatUma(market.securityLoadUma)}</p>}
            {step === 3 && (market.feasible
              ? <p className="stage-decision admit">✓ Admit: candidate capacity is {formatRatio(market.capacityRatio)} the required load.</p>
              : <p className="stage-decision reject">× Insufficient observed capacity; a larger reward cannot create stake.</p>)}
            {step === 4 && <p className="stage-note">One reproducible cost draw is shown. Formal quantiles use {trials.toLocaleString()} draws per unit and scenario.</p>}
            {step === 5 && <p className="stage-formula">sort by cᵢ/qᵢ · scan · skip non-entrants · continue to coverage</p>}
            {step === 6 && <p className="stage-formula">minimum R such that W<sub>G</sub>(R) ≥ r · exact $0.01 grid</p>}
            {step === 7 && <p className="stage-decision admit">✓ Verification returns the correct result; no accuracy error is simulated.</p>}
          </div>

          <div className={`stage-visual stage-${step}`}>
            {step === 0 && (
              <div className="exposure-visual group-visual">
                <div className="market-orb"><span>source requests</span><strong>{market.componentCount}</strong></div>
                <div className="operator">→</div>
                <div className="load-orb"><span>reward pools</span><strong>1</strong></div>
              </div>
            )}
            {(step === 1 || step === 2) && (
              <div className="exposure-visual">
                <div className="market-orb"><span>corrected OI</span><strong>{formatUsd(market.oiUsd, true)}</strong></div>
                <div className="operator">÷</div>
                <div className="parameter-stack"><span>α = 0.50</span><span>UMA = {formatUsd(market.umaPriceUsd)}</span></div>
                <div className="operator">→</div>
                <div className="load-orb"><span>required</span><strong>{formatUma(market.securityLoadUma)}</strong></div>
              </div>
            )}
            {step === 3 && (
              <div className="capacity-visual">
                <div className="capacity-row"><span>Required load</span><div><i style={{ width: `${Math.min(100, 100 / Math.max(1, market.capacityRatio))}%` }} /></div><strong>{formatUma(market.securityLoadUma)}</strong></div>
                <div className="capacity-row candidate"><span>Candidate stake</span><div><i style={{ width: '100%' }} /></div><strong>{formatUma(market.candidates.candidateStakeUma)}</strong></div>
                <div className={`gate ${market.feasible ? 'open' : 'closed'}`}><span>{market.feasible ? 'ADMIT' : 'REJECT'}</span></div>
              </div>
            )}
            {step >= 4 && market.feasible && illustration && (
              <div className="cost-visual">
                <div className="cost-head"><span className="data-label simulated">Selected voters · reproducible draw</span><span>cost support {formatUsd(result.costLowerUsd)}–{formatUsd(result.costUpperUsd)}</span></div>
                <div className="voter-costs">
                  {shownVoters.map((voter, index) => (
                    <div className="voter-cost" key={voter.id}>
                      <div className="voter-dot">V{index + 1}</div>
                      <div className="cost-track"><i style={{ width: `${100 * (voter.costUsd - result.costLowerUsd) / (result.costUpperUsd - result.costLowerUsd)}%` }} /></div>
                      <strong>{formatUsd(voter.costUsd)}</strong>
                      <small>{formatUma(voter.stakeUma)}</small>
                    </div>
                  ))}
                  {illustration.selectedVoters.length > shownVoters.length && <div className="voter-overflow">+ {illustration.selectedVoters.length - shownVoters.length} additional selected voters</div>}
                </div>
                {step >= 6 && (
                  <div className="reward-output">
                    <div><span>Posted reward · {percentile}</span><strong>{formatUsd(result.postedReward[percentile])}</strong><small>{trials.toLocaleString()}-draw pooled unit summary</small></div>
                    <div><span>Selected voters · {percentile}</span><strong>{formatCount(result.selectedVoterCount[percentile])}</strong><small>greedy construction</small></div>
                    <div className="illustrative-output"><span>Shown draw</span><strong>{formatUsd(illustration.rewardUsd)}</strong><small>{illustration.selectedVoters.length} voter{illustration.selectedVoters.length === 1 ? '' : 's'} · direct cost {formatUsd(illustration.selectedDirectCostUsd)}</small></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="protocol-footer">
          <div><span>Corrected OI</span><strong>{formatUsd(market.oiUsd)}</strong></div>
          <div><span>Required load</span><strong>{formatUma(market.securityLoadUma)}</strong></div>
          <div><span>Candidate stake</span><strong>{formatUma(market.candidates.candidateStakeUma)}</strong></div>
          <div><span>Reward · {percentile}</span><strong>{formatUsd(result.postedReward[percentile])}</strong></div>
          <button type="button" onClick={onDetails}>Open attempt results →</button>
        </div>
      </div>
    </section>
  );
}

function AssumptionComparison({ data }: { data: DashboardData }) {
  const full = data.comparison.fullRelease;
  const rolling = data.comparison.rolling2d;
  return (
    <section className="sample-section" id="comparison">
      <div className="section-intro">
        <div><span className="eyebrow">STAKE AVAILABILITY</span><h2>Full release first; then a two-day review window.</h2></div>
        <p>The second run carries each admitted security load until DVM resolution plus two days, so earlier markets can reduce later voters’ residual stake.</p>
      </div>
      <div className="comparison-table" role="table" aria-label="Full-release and rolling-window comparison">
        <div className="comparison-head" role="row"><span>Assumption</span><span>Admission</span><span>Reward p50</span><span>Reward p90</span><span>Reward p99</span><span>Voters p99</span><span>History reward</span></div>
        <div className="comparison-row" role="row">
          <strong>All stake released</strong><span>{formatPercent(full.admissionShare)}</span><span>{formatUsd(full.postedReward.p50)}</span><span>{formatUsd(full.postedReward.p90)}</span><span>{formatUsd(full.postedReward.p99)}</span><span>{formatCount(full.selectedVoterCount.p99)}</span><span>{formatUsd(full.totalRewardHistoryMeanUsd)} mean</span>
        </div>
        <div className="comparison-row selected" role="row">
          <strong>Resolution + 2 days</strong><span>{formatPercent(rolling.admissionShare)}</span><span>{formatUsd(rolling.postedReward.p50)}</span><span>{formatUsd(rolling.postedReward.p90)}</span><span>{formatUsd(rolling.postedReward.p99)}</span><span>{formatCount(rolling.selectedVoterCount.p99)}</span><span>{formatUsd(rolling.pathTotalRewardUsd.p50)} p50</span>
        </div>
      </div>
      <p className="sample-note">Prior locks reduce at least one candidate’s capacity in {formatPercent(rolling.capacityReducedShare)} of unit-trials, but induce outright infeasibility in only {formatPercent(rolling.priorLocksInducedInfeasibleShare)} of snapshot-feasible draws. Among served draws, {formatPercent(rolling.residualRequiresMoreVotersShare)} require more voters than the full-release stake-only minimum. Pooled baseline p99 reward rises from {formatUsd(full.postedReward.p99)} to {formatUsd(rolling.postedReward.p99)}.</p>
    </section>
  );
}

type StatusFilter = 'all' | 'feasible' | 'infeasible';
type UnitFilter = 'all' | 'ordinary' | 'negRisk';
type OracleFilter = 'all' | OracleVariant;
type SortKey = 'rank' | 'oi' | 'capacity' | 'reward' | 'candidates';

function MarketExplorer({ markets, scenario, trials, onSelect }: { markets: Market[]; scenario: ScenarioName; trials: number; onSelect: (market: Market) => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [unit, setUnit] = useState<UnitFilter>('all');
  const [oracle, setOracle] = useState<OracleFilter>('all');
  const [sort, setSort] = useState<SortKey>('rank');
  const [visibleCount, setVisibleCount] = useState(25);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return markets
      .filter((market) => !query || market.question.toLowerCase().includes(query) || market.conditionId.toLowerCase().includes(query) || market.eventId.toLowerCase().includes(query) || market.requestId.toLowerCase().includes(query) || market.oracleVariant.toLowerCase().includes(query) || oracleLabels[market.oracleVariant].toLowerCase().includes(query) || String(market.dvmRound).includes(query))
      .filter((market) => status === 'all' || (status === 'feasible' ? market.feasible : !market.feasible))
      .filter((market) => unit === 'all' || (unit === 'negRisk' ? market.negRisk : !market.negRisk))
      .filter((market) => oracle === 'all' || market.oracleVariant === oracle)
      .sort((a, b) => {
        if (sort === 'oi') return b.oiUsd - a.oiUsd;
        if (sort === 'capacity') return b.capacityRatio - a.capacityRatio;
        if (sort === 'reward') return (b.scenarios[scenario].postedReward.p50 ?? -1) - (a.scenarios[scenario].postedReward.p50 ?? -1);
        if (sort === 'candidates') return b.candidates.candidateCount - a.candidates.candidateCount;
        return a.rank - b.rank;
      });
  }, [markets, oracle, scenario, search, sort, status, unit]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <section className="explorer-section" id="markets">
      <div className="section-intro inverse">
        <div><span className="eyebrow">ATTEMPT-LEVEL RESULTS</span><h2>Inspect all {markets.length.toLocaleString()} economic settlement attempts.</h2></div>
        <p>Formal quantiles use {trials.toLocaleString()} hypothetical cost vectors per attempt-scenario. NegRisk OI is event-wide and its same-round component requests share one reward pool.</p>
      </div>
      <div className="explorer-controls">
        <label className="search-control"><span>Search attempts</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(25); }} placeholder="Question, event, request, condition, or DVM round" /></label>
        <label><span>Capacity</span><select value={status} onChange={(event) => { setStatus(event.target.value as StatusFilter); setVisibleCount(25); }}><option value="all">All statuses</option><option value="feasible">Feasible</option><option value="infeasible">Infeasible</option></select></label>
        <label><span>Unit</span><select value={unit} onChange={(event) => { setUnit(event.target.value as UnitFilter); setVisibleCount(25); }}><option value="all">All attempts</option><option value="ordinary">Ordinary requests</option><option value="negRisk">NegRisk event-rounds</option></select></label>
        <label><span>Oracle</span><select value={oracle} onChange={(event) => { setOracle(event.target.value as OracleFilter); setVisibleCount(25); }}><option value="all">All deployments</option><option value="polygon_oo_v2">Standard OOv2</option><option value="polygon_managed_oo_v2">Managed OOv2</option></select></label>
        <label><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setVisibleCount(25); }}><option value="rank">Panel rank</option><option value="oi">Corrected OI</option><option value="capacity">Capacity ratio</option><option value="reward">Reward p50</option><option value="candidates">Candidate count</option></select></label>
      </div>

      <div className="market-table-wrap">
        <table className="market-table">
          <thead><tr><th scope="col">Settlement attempt</th><th scope="col">Unit / result</th><th scope="col">Corrected OI</th><th scope="col">Candidate stake</th><th scope="col">Stake-min voters</th><th scope="col">Reward p50</th><th scope="col">Reward p99</th></tr></thead>
          <tbody>
            {visible.map((market) => {
              const result = market.scenarios[scenario];
              return (
                <tr key={market.id}>
                  <th scope="row"><button type="button" onClick={() => onSelect(market)}><span>#{market.rank}</span>{market.question}</button></th>
                  <td><MarketStatus market={market} /><small>{market.negRisk ? `${market.componentCount} request event-round` : 'ordinary request'} · {oracleLabels[market.oracleVariant]}</small></td>
                  <td>{formatUsd(market.oiUsd, true)}</td>
                  <td>{formatUma(market.candidates.candidateStakeUma)}</td>
                  <td>{formatCount(market.candidates.stakeDescMinimumVoterCount)}</td>
                  <td>{market.feasible ? formatUsd(result.postedReward.p50) : <span className="not-applicable">—</span>}</td>
                  <td>{market.feasible ? formatUsd(result.postedReward.p99) : <span className="not-applicable">Security failed</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <div className="empty-state">No settlement attempts match those filters.</div>}
      </div>
      {filtered.length > visible.length && <button type="button" className="show-all" onClick={() => setVisibleCount((count) => count + 25)}>Show 25 more of {filtered.length} matching attempts ↓</button>}
      <p className="table-note">Showing {visible.length} of {filtered.length} matching attempts from the corrected {markets.length.toLocaleString()}-unit panel.</p>
    </section>
  );
}

function DetailDrawer({ market, scenario, open, onClose }: { market: Market; scenario: ScenarioName; open: boolean; onClose: () => void }) {
  const result = market.scenarios[scenario];
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  return (
    <div className={open ? 'drawer-layer open' : 'drawer-layer'} aria-hidden={!open}>
      <button type="button" className="drawer-backdrop" onClick={onClose} aria-label="Close attempt details" tabIndex={open ? 0 : -1} />
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-header">
          <div><span className="eyebrow">ATTEMPT #{market.rank} · {scenario.toUpperCase()}</span><h2 id="drawer-title">{market.question}</h2></div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close details">×</button>
        </div>
        <div className="drawer-status"><MarketStatus market={market} /><UnitBadge market={market} /></div>

        <section className="drawer-section">
          <div className="drawer-section-title"><h3>Historical inputs</h3><span className="data-label observed">Observed</span></div>
          <div className="detail-grid">
            <div><span>Corrected open interest</span><strong>{formatUsd(market.oiUsd)}</strong></div>
            {market.negRisk && <div><span>Anchor condition OI · audit</span><strong>{formatUsd(market.conditionOiUsd)}</strong></div>}
            <div><span>OI scope</span><strong>{market.oiScope}</strong></div>
            <div><span>Source requests</span><strong>{market.componentCount}</strong></div>
            <div><span>UMA price</span><strong>{formatUsd(market.umaPriceUsd)}</strong></div>
            <div><span>Required load</span><strong>{formatUma(market.securityLoadUma, false)}</strong></div>
            <div><span>Candidate stake</span><strong>{formatUma(market.candidates.candidateStakeUma, false)}</strong></div>
            <div><span>Candidate voters</span><strong>{market.candidates.candidateCount}</strong></div>
            <div><span>Stake-minimum voters</span><strong>{formatCount(market.candidates.stakeDescMinimumVoterCount)}</strong></div>
            <div><span>Capacity ratio</span><strong>{formatRatio(market.capacityRatio)}</strong></div>
          </div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-title"><h3>Full-release simulation</h3><span className="data-label simulated">Simulated</span></div>
          <div className="assumption-line"><span>cost support {formatUsd(result.costLowerUsd)}–{formatUsd(result.costUpperUsd)}</span><span>mean {formatUsd(result.meanCostUsd)}</span><span>ρ = 0.80</span><span>Beta(2, 8)</span></div>
          {!market.feasible ? (
            <div className="no-certificate"><strong>No sufficient reward reported</strong><p>All observed positive-stake revealers together do not cover the required load.</p></div>
          ) : (
            <>
              <div className="quantile-head"><span /><span>p10</span><span>p50</span><span>p90</span><span>p99</span></div>
              <QuantileRow label="Posted reward" values={result.postedReward} />
              <QuantileRow label="Selected direct cost" values={result.selectedDirectCost} />
              <QuantileRow label="Selected voters" values={result.selectedVoterCount} currency={false} />
            </>
          )}
        </section>

        <section className="drawer-section">
          <div className="drawer-section-title"><h3>Two-day review window · baseline</h3><span className="data-label simulated">Rolling</span></div>
          <div className="detail-grid">
            <div><span>Arrival admission share</span><strong>{formatPercent(market.rollingBaseline.feasibleShare)}</strong></div>
            <div><span>Prior-lock failure share</span><strong>{formatPercent(market.rollingBaseline.priorLocksInducedInfeasibleShare)}</strong></div>
            <div><span>Pre-arrival active load · p50</span><strong>{formatUma(market.rollingBaseline.preAdmissionActiveLoadUma.p50)}</strong></div>
            <div><span>Reward · p50</span><strong>{formatUsd(market.rollingBaseline.postedReward.p50)}</strong></div>
            <div><span>Reward · p99</span><strong>{formatUsd(market.rollingBaseline.postedReward.p99)}</strong></div>
            <div><span>Selected voters · p99</span><strong>{formatCount(market.rollingBaseline.selectedVoterCount.p99)}</strong></div>
          </div>
        </section>

        <details className="record-details">
          <summary>Identifiers and provenance</summary>
          <dl>
            <div><dt>Economic unit</dt><dd title={market.id}>{shortId(market.id)}</dd></div>
            <div><dt>Event</dt><dd title={market.eventId}>{shortId(market.eventId)}</dd></div>
            <div><dt>Anchor condition</dt><dd title={market.conditionId}>{shortId(market.conditionId)}</dd></div>
            <div><dt>Anchor OO request</dt><dd title={market.requestId}>{shortId(market.requestId)}</dd></div>
            <div><dt>Oracle deployment</dt><dd>{oracleLabels[market.oracleVariant]}</dd></div>
            <div><dt>Oracle source ID</dt><dd title={market.oracleSourceId}>{shortId(market.oracleSourceId)}</dd></div>
            <div><dt>Component deployments</dt><dd>{market.componentOracleVariants.map((variant) => oracleLabels[variant]).join(', ')}</dd></div>
            <div><dt>DVM round</dt><dd>{market.dvmRound}</dd></div>
            <div><dt>Arrival</dt><dd>{new Date(market.disputeUtc).toLocaleString()}</dd></div>
          </dl>
        </details>
      </aside>
    </div>
  );
}

function Methods({ data }: { data: DashboardData }) {
  return (
    <section className="methods-section" id="method">
      <div className="section-intro">
        <div><span className="eyebrow">METHOD & DATA</span><h2>Observed exposure and stake; simulated verification costs.</h2></div>
        <p>The estimand is a sufficient reward conditional on an observed dispute—not a dispute probability or oracle-error rate.</p>
      </div>
      <div className="method-grid">
        <article><span className="method-number">01</span><h3>Define attempts</h3><p>Ordinary binaries remain request singletons. NegRisk requests sharing an event and DVM round become one economic attempt, one verification task, and one reward pool.</p><code>u = request or (event, round)</code></article>
        <article><span className="method-number">02</span><h3>Correct exposure</h3><p>For NegRisk, every active component condition is summed once at the anchor block. Signed balances are retained; the original condition OI remains an audit field.</p><code>OIᵤ = Σₖ OIₖ(blockᵤ − 1)</code></article>
        <article><span className="method-number">03</span><h3>Draw costs</h3><p>Low, baseline, and high have means $0.20, $1, and $4. Each uses the same right-skewed Beta(2, 8) shape, support [0.25μ, 4μ], and within-unit correlation ρ = {data.meta.costCorrelation}.</p><code>cᵢᵤ = μₛ(0.25 + 3.75Xᵢᵤ)</code></article>
        <article><span className="method-number">04</span><h3>Find reward</h3><p>All observed positive-stake revealers are candidates. For each realized cost vector, the paper’s greedy sufficient construction is combined with binary search on a one-cent reward grid.</p><code>min R : Wᴳᵤ(R) ≥ rᵤ</code></article>
      </div>
      <div className="truth-callout"><strong>Two capacity runs</strong><p>Full release treats every attempt independently. The rolling run locks admitted pro-rata security load from arrival until DVM resolution plus {data.meta.reviewWindowDays} days; failed arrivals are recorded once and not retried.</p></div>
      <div className="source-coverage" aria-label="Oracle deployment coverage">
        <div><strong>Three-deployment census</strong><p>All source-labelled disputes before the cutoff are retained in the frozen inventory. Simulation uses only exact complete-case linkages.</p></div>
        {data.meta.oracleSources.map((source) => (
          <div key={source.variant}><span>{source.label}</span><strong>{source.rawCount.toLocaleString()} → {source.eligibleCount.toLocaleString()} → {source.attemptCount.toLocaleString()}</strong><small>raw · eligible · attempts</small></div>
        ))}
      </div>
      <div className="legacy-note"><strong>Legacy OOv1 audit.</strong> Twenty-two settled requests lack an exact current CLOB linkage and one request remains unresolved. They stay in the census inventory, but none enters the simulation; no fuzzy match or zero imputation is used.</div>
      <div className="method-bottom">
        <div><h3>Source linkage</h3><ul><li><a href="https://github.com/UMAprotocol/subgraphs">UMA official subgraphs ↗</a></li><li><a href="https://github.com/Polymarket/polymarket-subgraph">Polymarket public subgraphs ↗</a></li><li><a href="https://github.com/Polymarket/neg-risk-ctf-adapter">Polymarket NegRisk adapter ↗</a></li><li><a href="https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles">Coinbase candles ↗</a></li></ul></div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [scenario, setScenario] = useState<ScenarioName>('baseline');
  const [percentile, setPercentile] = useState<QuantileKey>('p50');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch('./data/dashboard.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Data request failed (${response.status})`);
        return response.json() as Promise<DashboardData>;
      })
      .then((payload) => {
        const params = new URLSearchParams(window.location.search);
        const requestedScenario = params.get('scenario') as ScenarioName | null;
        const requestedUnit = params.get('attempt') ?? params.get('request') ?? params.get('market');
        setData(payload);
        setScenario(requestedScenario && requestedScenario in scenarioLabels ? requestedScenario : 'baseline');
        setSelectedId(payload.markets.some((market) => market.id === requestedUnit) ? requestedUnit! : payload.markets[0].id);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const selected = data?.markets.find((market) => market.id === selectedId) ?? data?.markets[0];
  useEffect(() => {
    if (!selectedId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('attempt', selectedId);
    url.searchParams.delete('request');
    url.searchParams.delete('market');
    url.searchParams.set('scenario', scenario);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [scenario, selectedId]);

  if (error) return <main className="load-state"><strong>Unable to load the panel.</strong><span>{error}</span></main>;
  if (!data || !selected) return <main className="load-state"><span className="loading-orb" /><strong>Loading corrected settlement-attempt panel…</strong></main>;

  const baseline = data.panelSummaries.find((row) => row.scenario === 'baseline')!;

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader route="/" />

      <main id="main">
        <section className="hero" id="top">
          <div className="hero-grid">
            <div>
              <div className="eyebrow">INTERACTIVE DEMO</div>
              <h1 tabIndex={-1}>Sufficient rewards for disputed prediction markets.</h1>
              <p className="hero-copy">The census contains {data.meta.inventoryCount.toLocaleString()} disputes across Standard OOv2, Managed OOv2, and legacy OOv1. Exact complete-case linkage retains {data.meta.sourceRequestCount.toLocaleString()} requests, which become {data.meta.economicUnitCount.toLocaleString()} economic settlement attempts: {data.meta.ordinaryUnitCount.toLocaleString()} ordinary requests and {data.meta.negRiskUnitCount.toLocaleString()} NegRisk event-round bundles.</p>
              <div className="reviewer-note"><strong>Key correction.</strong> A NegRisk event’s active component-condition OI is summed once, and same-event requests in one DVM round share one reward pool. Full release is the clean single-market benchmark; a second run adds a two-day review window.</div>
            </div>
            <div className="hero-summary-table" aria-label="Panel summary">
              <span>Baseline · full release</span>
              <dl>
                <div><dt>Economic attempts</dt><dd>{data.meta.economicUnitCount.toLocaleString()}</dd></div>
                <div><dt>Capacity-feasible</dt><dd>{formatPercent(baseline.feasibleShare)}</dd></div>
                <div><dt>Pooled reward · p50</dt><dd>{formatUsd(baseline.postedReward.p50)}</dd></div>
                <div><dt>Pooled reward · p90</dt><dd>{formatUsd(baseline.postedReward.p90)}</dd></div>
                <div><dt>Pooled reward · p99</dt><dd>{formatUsd(baseline.postedReward.p99)}</dd></div>
              </dl>
              <small>{data.meta.trialsPerUnitScenario.toLocaleString()} cost draws per attempt-scenario; rewards are minimum one-cent greedy sufficient certificates.</small>
            </div>
          </div>
          <div className="hero-disclaimer"><span className="data-label observed">Observed</span> corrected OI · UMA price · revealed stake <i /> <span className="data-label simulated">Simulated</span> verification costs · greedy rewards</div>
        </section>

        <ProcessSimulator key={`${selected.id}-${scenario}`} market={selected} markets={data.markets} trials={data.meta.trialsPerUnitScenario} scenario={scenario} percentile={percentile} onScenario={setScenario} onPercentile={setPercentile} onMarket={setSelectedId} onDetails={() => setDrawerOpen(true)} />
        <AssumptionComparison data={data} />
        <MarketExplorer markets={data.markets} scenario={scenario} trials={data.meta.trialsPerUnitScenario} onSelect={(market) => { setSelectedId(market.id); setDrawerOpen(true); }} />
        <Methods data={data} />
      </main>

      <DetailDrawer market={selected} scenario={scenario} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
