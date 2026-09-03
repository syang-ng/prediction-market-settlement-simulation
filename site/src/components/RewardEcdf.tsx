import { formatUsd } from '../lib';
import type { ScenarioSummary } from '../simulation/types';
import type { ScenarioName } from '../types';

const SCENARIOS: ScenarioName[] = ['low', 'baseline', 'high'];
const LABELS: Record<ScenarioName, string> = {
  low: 'Low · $0.20 mean',
  baseline: 'Baseline · $1 mean',
  high: 'High · $4 mean',
};
const WIDTH = 320;
const HEIGHT = 190;
const MARGIN = { top: 12, right: 14, bottom: 34, left: 40 };

/** Smallest round currency value ≥ value from {1, 2, 2.5, 5} × 10^k, at least one cent. */
export function niceCap(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.01;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value - 1e-12 * value) return Math.max(candidate, 0.01);
  }
  return Math.max(10 * magnitude, 0.01);
}

function EcdfPanel({ scenario, highlighted, onSelect }: { scenario: ScenarioSummary; highlighted: boolean; onSelect: () => void }) {
  const cap = niceCap(scenario.postedReward.p99 ?? 0);
  const values = scenario.postedRewardsSorted;
  const n = values.length;
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (value: number) => MARGIN.left + (Math.min(value, cap) / cap) * innerWidth;
  const y = (share: number) => MARGIN.top + innerHeight - share * innerHeight;
  // Step function: rewards above the cap are drawn at the cap, as in plot_reward_ecdf.py.
  let path = `M ${x(0)} ${y(0)}`;
  for (let i = 0; i < n; i += 1) {
    const xi = x(values[i]);
    path += ` L ${xi} ${y(i / n)} L ${xi} ${y((i + 1) / n)}`;
  }
  path += ` L ${MARGIN.left + innerWidth} ${y(1)}`;
  const xTicks = [0, cap / 2, cap];
  const yTicks = [0, 0.5, 1];
  return (
    <button type="button" className={`cf-ecdf-panel${highlighted ? ' highlighted' : ''}`} aria-pressed={highlighted} aria-label={`Highlight ${LABELS[scenario.name]}`} title={`Highlight ${LABELS[scenario.name]}`} onClick={onSelect}>
      <span className="cf-ecdf-title">{LABELS[scenario.name]}</span>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`ECDF of posted reward, ${LABELS[scenario.name]}, capped at ${formatUsd(cap)}`}>
        {yTicks.map((share) => (
          <g key={share} className="cf-grid">
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(share)} y2={y(share)} />
            <text x={MARGIN.left - 6} y={y(share)} dy="0.32em" textAnchor="end">{share.toFixed(1)}</text>
          </g>
        ))}
        {xTicks.map((value) => (
          <g key={value} className="cf-grid">
            <line x1={x(value)} x2={x(value)} y1={HEIGHT - MARGIN.bottom} y2={HEIGHT - MARGIN.bottom + 4} />
            <text x={x(value)} y={HEIGHT - MARGIN.bottom + 16} textAnchor={value === 0 ? 'start' : value === cap ? 'end' : 'middle'}>{formatUsd(value)}</text>
          </g>
        ))}
        <path d={path} />
      </svg>
      <small>Posted reward (USD, cap {formatUsd(cap)} = p99 rounded up); rewards above the cap are drawn at the cap.</small>
    </button>
  );
}

/** Three ECDF panels; clicking one makes that scenario the highlighted one. */
export default function RewardEcdf({ scenarios, highlighted, onSelect }: { scenarios: Record<ScenarioName, ScenarioSummary>; highlighted: ScenarioName; onSelect: (name: ScenarioName) => void }) {
  return (
    <div className="cf-ecdf">
      {SCENARIOS.map((name) => (
        <EcdfPanel key={name} scenario={scenarios[name]} highlighted={name === highlighted} onSelect={() => onSelect(name)} />
      ))}
    </div>
  );
}
