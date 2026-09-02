# Interactive dispute-reward demo

Static reviewer demo for the corrected UMA–Polymarket simulation through May 31, 2026.

## Local preview

```bash
npm ci
npm run dev
```

`npm run data` regenerates the browser dataset from the repository’s frozen economic-market panel and both completed simulation runs.

## GitHub Pages

```bash
npm run build:pages
```

The deployable site is written to `site/github-pages/`. Asset and data URLs are relative, so it works on a user domain or repository subpath. The repository workflow can publish this directory with GitHub Actions.

For double-blind review, use an anonymous organization or the venue’s artifact host rather than a personal domain when author identity matters.

## Data semantics

- The frozen census contains 3,325 source-labelled disputes: 1,822 Standard OOv2, 1,480 Managed OOv2, and 23 legacy OOv1. Exact complete-case linkage retains 2,978 requests (1,621 Standard and 1,357 Managed); legacy requests remain in the audit inventory but do not enter the simulation.
- The 2,978 linked requests become 2,438 economic settlement attempts: 1,919 ordinary request singletons and 519 NegRisk `(event, DVM round)` bundles. The 1,059 NegRisk requests belong to 489 distinct event IDs; 26 events appear in more than one DVM round.
- Ordinary-market OI remains condition-level. NegRisk OI is the signed sum of every active event component at the anchor block, counted once; the original condition OI remains an audit column.
- Low, baseline, and high verification-cost means are `$0.20/$1/$4`. All use `X ~ Beta(2, 8)` and `c = μ(0.25 + 3.75X)`, with support `[0.25μ, 4μ]` and within-attempt correlation `ρ = 0.8`.
- Each full-release attempt uses all observed positive-stake revealers as candidates and 1,000 cost draws per scenario. Greedy construction plus binary search finds the minimum sufficient reward on a one-cent grid.
- The rolling run locks admitted pro-rata security load until DVM resolution plus two days. Infeasible arrivals are recorded once and are not retried.
- Paying verification cost reveals the correct result deterministically; no oracle-error process is simulated.

## Counterfactual open-interest page

`#/counterfactual` keeps the actual UMA revealer stake distribution of one DVM
voting round and replaces the historical open interest with a hypothetical one
(default $1,000,000). It reruns the participation-cost model in the browser:
the same Beta(2, 8) costs with ρ = 0.8, the same greedy construction, and the
same one-cent minimum-reward search, ported to TypeScript under
`src/simulation/`.

- Data: `public/data/stake_snapshots.json`, written by `npm run data`. One
  snapshot per DVM round (401 rounds, 2023-03 to 2026-05): the union of
  positive-stake revealers across the round's attempts, in canonical address
  order, with the earliest dispute's UMA price.
- Security: `r_USD = OI / 0.65` (α = 0.65 for this page; the frozen dashboard
  results were simulated with the census value 0.5), `r_UMA = r_USD / P_UMA`,
  slash fraction 1.
- Reproducibility: costs come from a seeded xoshiro128** PRNG (default seed
  20260821, the Python master seed) and a Beta(2, 8) order-statistic sampler.
  The URL carries `round`, `oi`, `seed`, `trials`, and `scenario`, so a
  refreshed or shared link reproduces the exact numbers on any machine.
  Quantiles agree with the Python engine in distribution, not draw by draw.
- Tests: `npm test`. `src/simulation/greedy.test.ts` replays
  `src/simulation/__fixtures__/round-*.json`, which
  `scripts/export_counterfactual_fixture.py` writes from the Python core, and
  requires identical posted rewards, counts, stakes, and costs. Regenerate the
  fixtures after any change to `experiments/greedy_reward_simulation.py`:

```bash
python3 site/scripts/export_counterfactual_fixture.py
```
