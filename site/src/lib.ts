export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function formatUsd(value: number | null | undefined, compact = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (compact && Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}m`;
  if (compact && Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value);
}

export function formatUma(value: number | null | undefined, compact = true): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const formatted = compact
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  return `${formatted} UMA`;
}

export function formatRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}×`;
  return `${value.toFixed(value >= 10 ? 1 : 2)}×`;
}

export function formatPercent(value: number): string {
  const percentage = value * 100;
  return `${percentage.toFixed(percentage < 10 ? 2 : 1)}%`;
}

export function shortId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-7)}`;
}

const utcDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
const utcTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });

/** { date: "22 Mar 2023", time: "18:11 UTC" }: fixed zone and locale so the stamp is identical everywhere. */
export function formatUtcParts(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  return { date: utcDate.format(at), time: `${utcTime.format(at)} UTC` };
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString();
}
