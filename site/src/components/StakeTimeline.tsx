import { useId, useMemo } from 'react';
import { formatUsd } from '../lib';
import { maxSecurableOiUsd } from '../routes/counterfactualParams';
import type { SecurityConstants, StakeSnapshot } from '../types';

const WIDTH = 960;
const HEIGHT = 250;
const MARGIN = { top: 14, right: 22, bottom: 34, left: 66 };
const DAY_MS = 86_400_000;

function monthYear(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * One point per DVM round at its maximum securable open interest
 * (union stake × anchor UMA price × α / κ) on a log axis, with a dashed line
 * at the current OI. Points above the line are stake-feasible at that OI.
 * The slider on the page is the keyboard control; points are click and hover.
 */
export default function StakeTimeline({
  snapshots,
  selectedIndex,
  oiUsd,
  security,
  onSelect,
}: {
  snapshots: StakeSnapshot[];
  selectedIndex: number;
  oiUsd: number;
  security: SecurityConstants;
  onSelect: (index: number) => void;
}) {
  const titleId = useId();
  const points = useMemo(
    () => snapshots.map((snapshot) => ({ time: Date.parse(snapshot.anchorDisputeUtc), value: maxSecurableOiUsd(snapshot, security) })),
    [snapshots, security],
  );
  const timeMin = Math.min(...points.map((point) => point.time)) - 30 * DAY_MS;
  const timeMax = Math.max(...points.map((point) => point.time)) + 30 * DAY_MS;
  const valueMin = Math.min(...points.map((point) => point.value), oiUsd) / 1.5;
  const valueMax = Math.max(...points.map((point) => point.value), oiUsd) * 1.5;
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (time: number) => MARGIN.left + ((time - timeMin) / (timeMax - timeMin)) * innerWidth;
  const y = (value: number) =>
    MARGIN.top + innerHeight - ((Math.log10(value) - Math.log10(valueMin)) / (Math.log10(valueMax) - Math.log10(valueMin))) * innerHeight;

  const yearTicks: number[] = [];
  for (let year = new Date(timeMin).getUTCFullYear() + 1; year <= new Date(timeMax).getUTCFullYear(); year += 1) {
    yearTicks.push(Date.UTC(year, 0, 1));
  }
  const decadeTicks: number[] = [];
  for (let exponent = Math.ceil(Math.log10(valueMin)); exponent <= Math.floor(Math.log10(valueMax)); exponent += 1) {
    decadeTicks.push(10 ** exponent);
  }
  const feasibleCount = points.filter((point) => point.value >= oiUsd).length;
  const selected = snapshots[selectedIndex];

  return (
    <figure className="cf-timeline">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          Maximum securable open interest per DVM round: {feasibleCount} of {snapshots.length} rounds clear {formatUsd(oiUsd, true)}. Selected round {selected.round}.
        </title>
        {decadeTicks.map((value) => (
          <g key={value} className="cf-grid">
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(value)} y2={y(value)} />
            <text x={MARGIN.left - 8} y={y(value)} dy="0.32em" textAnchor="end">{formatUsd(value, true)}</text>
          </g>
        ))}
        {yearTicks.map((time) => (
          <g key={time} className="cf-grid">
            <line x1={x(time)} x2={x(time)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
            <text x={x(time)} y={HEIGHT - MARGIN.bottom + 18} textAnchor="middle">{new Date(time).getUTCFullYear()}</text>
          </g>
        ))}
        <line className="cf-oi-line" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(oiUsd)} y2={y(oiUsd)} />
        <text className="cf-oi-label" x={WIDTH - MARGIN.right} y={y(oiUsd) - 6} textAnchor="end">OI {formatUsd(oiUsd, true)}</text>
        {snapshots.map((snapshot, index) => (
          <circle
            key={snapshot.round}
            className={`cf-point${points[index].value >= oiUsd ? ' feasible' : ' infeasible'}${index === selectedIndex ? ' selected' : ''}`}
            cx={x(points[index].time)}
            cy={y(points[index].value)}
            r={index === selectedIndex ? 6 : 3}
            onClick={() => onSelect(index)}
          >
            <title>Round {snapshot.round} · {monthYear(points[index].time)} · max securable OI {formatUsd(points[index].value, true)}</title>
          </circle>
        ))}
      </svg>
      <figcaption>
        Each point is one DVM round: union revealer stake × anchor UMA price × α. Points above the dashed line are stake-feasible at the current open interest. Select a round with the slider, the date field, or by clicking a point.
      </figcaption>
    </figure>
  );
}
