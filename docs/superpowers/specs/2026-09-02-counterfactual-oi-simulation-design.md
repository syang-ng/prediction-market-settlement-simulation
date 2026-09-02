# Counterfactual open-interest simulation page

**Date:** 2026-09-02
**Status:** design approved, awaiting implementation plan
**Target:** `site/src/`, `site/app/`, `site/scripts/build_dashboard_data.py`, `site/package.json`

## Goal

Historical Polymarket open interest (OI) is usually small: the median attempt in
the frozen panel carries about $33k, and 10% carry under $600. At those sizes
the required security stake is a sliver of the available UMA, so the existing
results say little about how participation cost and reward behave when a market
is large.

This page separates the two inputs. It keeps the **actual** UMA voter stake
distribution at a chosen historical date and replaces the **actual** OI with a
hypothetical one (default $1,000,000). It then runs the existing
participation-cost and reward-calibration model in the browser and answers:

> Given the actual UMA voter stake distribution on date *t*, what participation
> reward would have been required to securely settle a market with $1 million of
> open interest?

Changing the date, the OI, the seed, or the trial count recomputes everything
immediately, with no backend job. Results are bit-reproducible: the same date,
OI, parameters, and seed give exactly the same output after a refresh or on
another machine.

## Decisions

Settled during brainstorming; fixed inputs to this design.

| Decision | Choice | Why |
| --- | --- | --- |
| Security parameter α | **0.5**, matching the frozen data | Every shipped result uses `corruption_threshold = 0.5`, `attack_capture_fraction = 1.0`, `slash_fraction = 1.0`, so `r_USD = OI / 0.5`. The request mentioned α = 0.65, which is only the unused CLI default in `build_dispute_panel.py`; no shipped data uses it. Matching 0.5 keeps counterfactual rewards comparable to the dashboard. |
| Snapshot unit | **One snapshot per DVM voting round** (401 rounds, 2023-03-22 to 2026-05-31) | Within a round every request sees identical per-voter stake (0 conflicts across 1,119,968 voter rows), and each request's revealer set is ~99.7% of the round union. The union is the same rule the economic panel already applies to NegRisk bundles. Payload ≈ 2.5 MB versus ≈ 21 MB for per-attempt snapshots. |
| Placement | **New hash route `#/counterfactual`** | The approved (not yet implemented) restyle spec commits to hash routing in one shell so both build targets behave identically. The router built here is the first piece of that plan. |
| Time sweep | **Not included** | Ship the single-snapshot counterfactual first. The time axis still shows feasibility over time analytically (see Page). |
| Population caveat | Revealers only | The data contains voters who revealed in a round, not every staker. This matches the main simulation's first stated limitation and is restated on the page. |

## Data facts the design relies on

All measured on the frozen panel and voter table.

- 2,438 economic attempts fall into 401 distinct `dvm_round` values. Round *r*
  votes in the two-day window `[r × 172800, (r + 1) × 172800)` Unix seconds.
  Every dispute in the panel arrives before its round's window ends and every
  DVM resolution lands after it (2,438 of 2,438), so the window is a safe label.
- Median gap between consecutive rounds with disputes is 2.07 days; the largest
  gap is 50 days (2023). The axis is therefore irregular and must be drawn on a
  time scale, not an index scale.
- Round unions hold about 74 / 252 / 663 / 1,014 revealers at
  p10 / p50 / p90 / max: 130,451 `(round, voter)` pairs in total, of which 123
  have zero stake and are excluded from candidates, leaving 130,328
  positive-stake pairs.
- Within a round, `total_stake_uma` (`cumulativeStakeAtRound`) is identical
  across requests; the anchor UMA price varies by 2.9% (median) to 36% (max)
  across a round's disputes because dispute times differ.
- `uma_price_usd` is the Coinbase UMA-USD hourly open containing the dispute
  (2,244 attempts) or the preceding hour's close (194). The page reuses the
  stored value; it never re-derives prices.

## Architecture

### Routing

`src/useHashRoute.ts` — about 40 lines, no dependency.

- A hash beginning with `#/` is a route: `#/` (or empty) renders the existing
  `Dashboard`; `#/counterfactual` renders `CounterfactualPage`. Unknown routes
  fall back to `#/`.
- A hash **not** beginning with `#/` (the existing `#simulation`, `#comparison`,
  `#markets`, `#method`, `#top`, `#main` anchors) is treated as the default
  route and left to native anchor scrolling. Existing links keep working
  unchanged.
- The hook returns `{ path, params }` where `params` is a `URLSearchParams`
  parsed from the part after `?` in the hash, and a `setParams` that rewrites
  the hash with `history.replaceState` (no scroll, no history entry).
- When the route **path** changes (not on anchor-only hash changes within the
  default route): scroll to top instantly and move focus to the new view's
  `<h1>`, as the restyle spec requires. `document.title` is set per route.

`src/App.tsx` renders the route. Both entry points render `<App />` instead of
`<Dashboard />`: `app/page.tsx` and `src/main.tsx`, one line each. `App.tsx`
carries `'use client'`.

### Shared header

The header markup currently inside `Dashboard()` moves to
`src/components/SiteHeader.tsx` as a move-only extraction. It takes the current
route and renders one of two nav lists:

- **Dashboard route:** the existing four anchor links (`#simulation`,
  `#comparison`, `#markets`, `#method`) plus a fifth link, "Counterfactual" →
  `#/counterfactual`.
- **Counterfactual route:** "Overview" → `#/` plus "Counterfactual" marked
  `aria-current="page"`. Section anchors are not offered here because a hash
  router cannot express "route plus anchor" in one hash.

The wordmark and the "Download data" link appear on both.

`Dashboard.tsx` keeps its own `?attempt=&scenario=` query-string state exactly as
today; migrating it into the hash belongs to the restyle spec's Phase 1.

### Data flow

```
build_dashboard_data.py ──► public/data/stake_snapshots.json (≈2.5 MB, cached)
                                          │  fetched lazily on first visit to #/counterfactual
CounterfactualPage ── params from hash ──► selectSnapshot(round) ──► runCounterfactual(snapshot, oi, seed, trials)
                                          │                               (pure, synchronous, src/simulation/)
                                          └──► render facts · requirement · gate · quantiles · ECDF · draw
```

The main dashboard's 12 MB fetch is untouched; the new file loads only when the
route is opened and is kept in memory afterwards.

## Snapshot data

### Builder

`site/scripts/build_dashboard_data.py` gains `build_stake_snapshots(...)`,
called from `build()` after the illustrations step. It reuses the modules the
script already imports from `experiments/greedy_reward_simulation.py`:
`load_markets` and `load_candidate_vectors`. The stake vectors are therefore the
same `float64` values, from the same `Decimal` parsing and the same
positive-stake filter, in the same canonical order (lowercase address ascending)
that the Python simulation uses. No second parser is written.

Per `dvm_round`:

1. Collect the attempts in the round (`MarketInput` objects) and their
   `CandidateVector`s.
2. Union voters by address. **Assert** that a voter appearing in several
   attempts has bit-identical stake in each; raise otherwise. (The data
   satisfies this today; the assertion guards future refreshes.)
3. Sort the union by lowercase address and emit `stakesUma` in that order.
4. Anchor = the attempt with the earliest `dispute_timestamp` (ties: lowest
   `sample_rank`). Take `uma_price_usd`, `uma_price_method`, `dispute_utc`,
   and `total_stake_uma` from the anchor.

Zero-stake revealers are not reported per snapshot. `load_candidate_vectors`
keeps only their count per attempt, not their addresses, so a per-round count
cannot be de-duplicated; the page reports positive-stake voters only.

Caching follows the `illustrations.json` pattern: a `meta` block with the panel
and voter SHA-256s, a schema tag `stake-snapshots-v1`, and the security
constants; if the existing file's `meta` matches, the 66 MB voter table is not
re-read. When either the illustrations cache or the snapshot cache is stale,
the markets and candidate vectors are loaded once and shared by both steps. The
builder also verifies `unionStakeUma` against the `stable_cumsum_last_axis`
Kahan total of `stakesUma`, the same total the simulator uses for capacity.

### Schema (`public/data/stake_snapshots.json`)

```jsonc
{
  "meta": {
    "schema": "stake-snapshots-v1",
    "panelSha256": "…", "voterSha256": "…",
    "snapshotRule": "union of positive-stake revealers across all attempts in one DVM round; exact same-round stake agreement asserted",
    "anchorRule": "earliest dispute in the round supplies UMA price and dispute time",
    "roundWindowSeconds": 172800,
    "security": { "corruptionThreshold": 0.5, "attackCaptureFraction": 1.0, "slashFraction": 1.0 },
    "costModel": { "beta": [2, 8], "multiplierSupport": [0.25, 4.0], "scenarioMeansUsd": { "low": 0.2, "baseline": 1.0, "high": 4.0 }, "correlation": 0.8 },
    "defaults": { "oiUsd": 1000000, "seed": 20260821, "trials": 1000, "maxTrials": 5000, "budgetCapsUsd": [50, 100, 200] },
    "roundCount": 401, "positiveStakeCount": 130328
  },
  "snapshots": [
    {
      "round": 10253,
      "windowStartUtc": "2026-02-21T00:00:00Z", "windowEndUtc": "2026-02-23T00:00:00Z",
      "anchorDisputeUtc": "2026-02-19T…Z", "anchorUnitId": "em_…", "anchorRank": 1234,
      "umaPriceUsd": 0.464, "umaPriceMethod": "hour_open_containing_dispute",
      "cumulativeStakeAtRoundUma": 25122930.1,
      "voterCount": 612,
      "unionStakeUma": 23466629.4,
      "stakesUma": [ /* voterCount float64 values, canonical order */ ],
      "attempts": [
        { "unitId": "em_…", "rank": 1234, "question": "…", "negRisk": false, "oiUsd": 198015.2, "feasible": true, "baselineRewardP50Usd": 0.51 }
      ]
    }
  ]
}
```

`snapshots` is sorted by `round` ascending. Addresses are not shipped; the
canonical order carries the greedy tie-break. `baselineRewardP50Usd` comes from
the full-release results CSV the script already loads (`null` when infeasible).

## Simulation core (`site/src/simulation/`)

Pure TypeScript, no DOM, no dependency. Every arithmetic step uses operations
whose IEEE-754 results are identical across JavaScript engines: `+ − × ÷`,
`Math.sqrt`, `Math.floor`, `Math.ceil`, comparisons, and integer bit
operations. No `Math.pow`, `Math.log`, `Math.exp`, or `Math.random`.

### `prng.ts`

- Generator: **xoshiro128\*\*** (four 32-bit words). Seeded by hashing the
  string `"{seed}|counterfactual-cost-draws-v1|round-{round}"` with a 32-bit
  string hash (FNV-1a) and expanding through splitmix32 into the four words;
  an all-zero state is replaced by `[1, 0, 0, 0]`. This mirrors Python's
  `SHA-256(master_seed|greedy-cost-draws-v1|job_id)` role of giving each unit
  an independent stream without reproducing its bits.
- `uniform53()` = `((next() >>> 5) × 2^26 + (next() >>> 6)) / 2^53`, in
  `[0, 1)`.
- Default seed 20260821, the Python master seed.

### `costs.ts`

- `Beta(2, 8)` is drawn as the **second-smallest of nine** `uniform53()`
  values. The *k*-th order statistic of *n* uniforms is `Beta(k, n + 1 − k)`,
  so this has the exact target marginal without transcendental functions.
- Per trial, in this order: `U_1…U_N` idiosyncratic Beta draws, one common
  `D`, then `N` selection uniforms; voter *i* uses `D` when its uniform is
  `< Math.sqrt(0.8)`, else `U_i`. This is the Python
  `draw_correlated_scaled_beta_costs` construction (pairwise ρ = 0.8).
- Normalized cost `x_i = 0.25 + 3.75 × X_i` (mean 1, support `[0.25, 4]`).
  Scenario costs are `μ_s × x_i` with `μ ∈ {0.2, 1, 4}`, sharing the same
  normalized draw across scenarios, as in Python.

### `greedy.ts`

A per-trial port of `simulate_cost_batch` with its exact operation order, so
that identical cost inputs yield identical outputs:

- `compensatedAdd` (Kahan), `nextafter` toward `+∞` via `Float64Array` /
  `BigUint64Array` bit manipulation, `coverageReached(total, required)` =
  `total ≥ required || nextafter(total) ≥ required`.
- `η_i = x_i / q_i` from **normalized** costs; candidates sorted by
  `(η_i, canonical index)` with a stable comparator (numpy `argsort(kind="stable")`).
- Kahan prefix sums of sorted stakes; the final prefix is **overwritten** with
  the canonical-order capacity so capacity never depends on cost order.
- `k` = first prefix that reaches `required`;
  `lower = η_k × required`, `upper = η_k × cumulative_k`; `upper` is nudged by
  one ulp and then doubled (max 32 times) until admitted.
- Admission scan at reward `R` and scale `s`: accept voter *i* when
  `nextafter(R) ≥ ((η_i × s) × proposedTotal)`; the admission predicate may
  stop early once coverage is reached, the metrics scan runs to the end.
- Cent grid per scenario: `lowerTick = floor((lower × s) / 0.01) − 1`,
  `upperTick = ceil((upper × s) / 0.01)`; raise `upperTick` by one until
  admitted (max 5 times); bisect with `mid = lower + floor((upper − lower) / 2)`
  while `upper − lower > 1`; posted reward `= upperTick / 100`.
- Certification, mirroring Python's assertions and thrown as `Error`s: posted
  reward admitted; `(upperTick − 1) / 100` not admitted when `upperTick > 0`;
  no selected voter has a profitable exit and no outsider a profitable entry at
  tolerance `1e-9`; `posted + 1e-8 ≥ selected direct cost`;
  `R / total + 1e-10 ≥ lastSelectedη`.
- Metrics per trial and scenario: posted reward, selected voter count, selected
  stake (Kahan), selected direct cost (plain sum of `x_i` in sorted order, then
  `× s`, as Python does), excess stake, coverage ratio, reward-to-cost ratio,
  participant surplus.
- Also ported: `stakeDescMinimumCount` and `effectiveValidatorCount`.

**Omitted on purpose:** the continuous bracket (`continuous_*`) and
`rounding_overhead_usd`. They require a second bisection and appear nowhere on
the site.

### `stats.ts`

numpy-`linear` quantiles at p10 / p50 / p90 / p99 plus mean, returned as the
existing `Quantiles` type; shares of trials with posted reward `≤ $50 / $100 /
$200` (the Python `budget_caps`).

### `counterfactual.ts`

`runCounterfactual(snapshot, { oiUsd, seed, trials })` returns:

```ts
{
  input: { round, oiUsd, seed, trials, corruptionThreshold, attackCaptureFraction, slashFraction },
  requirement: { securityLoadUsd, securityLoadUma, requiredStakeUma, capacityUma, capacityUsd, capacityRatio, feasible, shortfallUma, shortfallUsd, maxSecurableOiUsd },
  candidates: { count, stakeDescMinimumVoterCount, effectiveCandidateCount },
  scenarios: Record<ScenarioName, { meanCostUsd, postedReward, selectedVoterCount, selectedStakeUma, excessStakeUma, coverageRatio, selectedDirectCost, rewardToCost, participantSurplus, budgetCapShares, postedRewardsSorted, firstDraw }>  | null,
  timingMs
}
```

`securityLoadUsd = attackCaptureFraction × OI / corruptionThreshold`,
`securityLoadUma = securityLoadUsd / umaPriceUsd`,
`requiredStakeUma = securityLoadUma / slashFraction`,
`maxSecurableOiUsd = capacityUma × umaPriceUsd × corruptionThreshold / attackCaptureFraction`.
`scenarios` is `null` when infeasible. `firstDraw` is trial 0's selected voters
as `{ index, stakeUma, costUsd }` for the illustration. Any certification error
propagates to the page, which shows it instead of results.

**Performance budget:** the largest round (1,014 voters) at 1,000 trials and
three scenarios must complete in under 500 ms on a 2020-class laptop. If it
does not, the same module moves into a Web Worker; the page API is unchanged.

## Page (`src/routes/Counterfactual.tsx`)

Uses the current manuscript tokens and classes (`eyebrow`, `section-intro`,
`protocol-card`, `gate`, `market-status`, `detail-grid`, `quantile-row`,
`data-label`), with new classes prefixed `cf-` in `globals.css`. No new colors.
The approved restyle can recolor it through tokens later.

### Layout, top to bottom

1. **Page header** — eyebrow "Counterfactual simulation", `<h1>` "Historical
   stake, hypothetical open interest.", standfirst stating the research
   question above and the three deviations from the main simulation.
2. **Time axis card**
   - SVG chart, time-scaled x-axis 2023-03 → 2026-06, y-axis in USD on a log
     scale: one point per round at `unionStakeUma × umaPriceUsd × α`, the
     **maximum securable OI** at that snapshot. A horizontal line marks the
     current OI. Rounds above the line are stake-feasible at that OI, so the
     reader sees feasibility over time without a sweep. The y-domain always
     includes both the data and the OI line, padded by a factor of 1.5 at
     each end, so an extreme OI never pushes the line off the chart. The
     selected round is highlighted; hovering or focusing a point shows round,
     date, and value.
   - Controls under the chart: `<input type="range">` over round indices,
     `<input type="date">` that snaps to the round whose anchor date is nearest
     (ties → earlier round), and previous / next buttons. A caption reads
     "DVM round 10253 · voting window Feb 21–23, 2026 · anchor dispute
     Feb 19, 2026 · 11 historical attempts".
3. **Inputs row** — OI in USD (default 1,000,000), seed (default 20260821),
   trials (default 1,000, integer 1–5,000), and the low / baseline / high
   scenario toggle that only chooses which scenario the ECDF emphasises and the
   draw illustration uses; all three scenarios are always computed. A "Reset to
   defaults" button.
4. **Snapshot facts** (`data-label observed`) — round and window, anchor
   dispute time, UMA price and method, positive-stake voters, available stake
   in UMA and USD, share of `cumulativeStakeAtRound` held by revealers,
   historical attempts in the round with total and largest OI. A compact list of those attempts (rank, question, OI, existing baseline
   p50 reward) links each to `#/?attempt=<unitId>` — see Legacy links below.
5. **Requirement chain** — `OI` → `÷ α = 0.50` → `r_USD` → `÷ P_UMA` → `r_UMA`,
   then capacity ratio and the existing `gate` (ADMIT / REJECT). Infeasible:
   shortfall in UMA and USD and the maximum securable OI. Feasible:
   stake-descending minimum voters and effective candidate count.
6. **Simulation results** (`data-label simulated`), feasible only —
   - Headline: "Minimum sufficient reward · baseline · p50" with p90 and p99
     beside it.
   - Quantile table, three scenarios × {posted reward, selected voters,
     selected stake, selected direct cost, reward-to-cost}, in `QuantileRow`
     style with p10 / p50 / p90 / p99 and mean.
   - Budget-cap shares: trials with reward ≤ $50 / $100 / $200 per scenario.
   - ECDF of posted reward as three small panels, one per scenario, following
     `experiments/plot_reward_ecdf.py`: linear dollar x-axis from 0 to a cap,
     rewards above the cap plotted at the cap, y in [0, 1]. Because the
     historical caps ($10 / $50 / $200) can be far below counterfactual
     rewards, each panel's cap is that scenario's p99 rounded up to a round
     currency tick, and the axis label states it. The highlighted scenario's
     panel is emphasised. Pure SVG.
   - "One reproducible draw": trial 0 of the highlighted scenario, up to ten
     selected voters labelled V1…Vn with stake and cost, an overflow count, and
     the draw's reward, selected stake, and direct cost — the same treatment as
     the walkthrough's cost stage.
   - Reproducibility line: "seed 20260821 · 1,000 trials · xoshiro128** ·
     Beta(2, 8) by order statistics · computed in {n} ms".
7. **Method note** — five short items: population is the round union of
   revealers, not all stakers; OI is hypothetical, everything else observed;
   security rule and constants; the JS PRNG means quantiles agree with the
   Python engine in distribution, not draw by draw, while the greedy and
   bisection core is verified identical on shared inputs; what is omitted.

### URL state

`#/counterfactual?round=10253&oi=1000000&seed=20260821&trials=1000&scenario=baseline`

| Param | Type | Default | Invalid value → |
| --- | --- | --- | --- |
| `round` | existing round number | latest round | default |
| `oi` | finite number > 0, at most two decimals | 1000000 | default |
| `seed` | integer in `[0, 2^53 − 1]` | 20260821 | default |
| `trials` | integer in `[1, 5000]` | 1000 | clamp |
| `scenario` | `low` / `baseline` / `high` | `baseline` | default |

Every control writes through `setParams` with `replaceState`. Parameters equal
to their defaults are still written, so a copied link is fully explicit.

### Legacy links

Links from the attempt list to the dashboard use `#/?attempt=<unitId>`. The
`Dashboard` component reads `location.search`, not the hash, so `App.tsx`
adopts `attempt` and `scenario` from the `#/` hash query, rewrites them into
the real query string, resets the hash to `#/`, all in one `replaceState`, and
then mounts `Dashboard`. This is the same adoption the restyle spec plans, in
the opposite direction, and it is the only coupling between the two routes.

### States

- Loading: the existing `load-state` treatment with "Loading stake snapshots…".
- Fetch error: the existing error treatment with the status text.
- Computing: the results section dims and shows "Computing 1,000 trials…"
  while the synchronous run executes on the next frame, so the controls repaint
  first.
- Certification error: a `no-certificate` block with the message and the
  inputs; nothing else in the results section renders.

## Verification

Dev dependency added: `vitest` (latest 4.x, which supports Vite 8). `npm test`
runs `vitest run`. No runtime dependency is added.

1. **Fixture cross-check (the key test).** `site/scripts/export_counterfactual_fixture.py`
   imports `load_markets`, `load_candidate_vectors`, `draw_normalized_costs`,
   and `simulate_cost_batch` from `experiments/greedy_reward_simulation.py`,
   builds the round union with the same function the data builder uses, and for
   two rounds (the fewest-voter round that is feasible at $1M, and the
   most-voter round) writes
   `src/simulation/__fixtures__/round-<r>.json` with the stake vector, 16
   normalized cost trials, `required` at $1M OI, the three scales, and the
   expected posted rewards, selected counts, selected stakes, and selected
   direct costs. A vitest test feeds the same inputs to `greedy.ts` and asserts
   posted rewards and counts **exactly** equal and stakes and costs equal to
   `1e-9` relative. The fixture file records the Python and NumPy versions.
2. **Determinism.** Two `runCounterfactual` calls with equal inputs give
   byte-identical `JSON.stringify` output; changing the seed changes it; the
   first 8 uniforms of the PRNG for a fixed seed are pinned as constants.
3. **Sampler.** Over 200k draws, `Beta(2, 8)` sample mean within 0.003 of 0.2
   and variance within 5% of 0.01455; every value in `(0, 1)`; scenario costs
   lie in `[0.25μ, 4μ]`; pairwise correlation of two voters' normalized draws
   within 0.02 of 0.8.
4. **Numerics.** `nextafter(1) === 1 + 2^-52`; `nextafter(0) === 5e-324`;
   Kahan sum of `[1e16, 1, −1e16]` is `1`; `coverageReached` accepts a total one
   ulp under `required` and rejects two ulps under.
5. **Quantiles.** Match numpy `linear` on hand-computed arrays including odd
   and even lengths and a length-1 array.
6. **Feasibility.** With `oi = maxSecurableOiUsd` the run is feasible; with
   `oi = maxSecurableOiUsd × 1.001` it is not.
7. **Builder invariants.** `python3 scripts/build_dashboard_data.py` leaves
   `dashboard.json` byte-identical to today, writes `stake_snapshots.json` with
   401 snapshots and 130,328 positive stakes, and a second run hits the cache
   and does not re-read the voter table (log line).
8. **Build.** `npm run lint`, `npm run build`, and `npm run build:pages`
   succeed.
9. **Browser, both builds.** `#/` renders the unchanged dashboard; every
   legacy anchor (`#simulation`, `#comparison`, `#markets`, `#method`) still
   scrolls; `#/counterfactual` loads the snapshot file exactly once across
   repeated parameter changes; a hard refresh of a fully specified URL shows the
   same numbers; the fallback route works for an unknown hash; keyboard reaches
   slider, date, inputs, toggle, and chart points with a visible focus ring.
10. **Timing.** The largest round at 1,000 trials completes under 500 ms in
    the reproducibility line; if it does not, the Worker fallback is implemented
    before shipping.

## Non-goals

- No time sweep of the reward across rounds.
- No Web Worker unless the timing budget fails.
- No change to any existing computed value, data file, or the main dashboard's
  behavior; `dashboard.json` must remain byte-identical.
- No restyle; the page adopts the current manuscript styling.
- No shipping of voter addresses.
- No re-derivation of UMA prices or OI; observed inputs are taken from the
  panel as stored.
- No continuous-bracket or rounding-overhead metrics.

## Files touched

| File | Change |
| --- | --- |
| `site/scripts/build_dashboard_data.py` | add `build_stake_snapshots`, write and cache `stake_snapshots.json` |
| `site/scripts/export_counterfactual_fixture.py` | new; writes test fixtures from the Python core |
| `site/src/simulation/{prng,costs,greedy,stats,counterfactual,types}.ts` | new pure core |
| `site/src/simulation/*.test.ts`, `__fixtures__/round-*.json` | new tests and fixtures |
| `site/src/useHashRoute.ts`, `site/src/App.tsx` | new router and shell |
| `site/src/components/SiteHeader.tsx` | move-only extraction from `Dashboard.tsx` plus one nav link |
| `site/src/routes/Counterfactual.tsx` (+ `StakeTimeline.tsx`, `RewardEcdf.tsx` under `components/`) | new page and its two SVG charts |
| `site/src/Dashboard.tsx` | use `SiteHeader`; hero `<h1>` gets `tabIndex={-1}` as the route focus target; otherwise unchanged |
| `site/src/types.ts` | add snapshot file types |
| `site/app/page.tsx`, `site/src/main.tsx` | render `<App />` |
| `site/app/globals.css` | `cf-` classes for the new page |
| `site/package.json` | `vitest` dev dependency, `test` script |
| `site/README.md` | document the route, the data file, and fixture regeneration |

## Phasing

1. **Data** — builder function, cache, invariants, fixture exporter.
2. **Core and tests** — port with vitest, fixture cross-check passing before
   any UI is written.
3. **Routing and shell** — router, `App.tsx`, header extraction; the dashboard
   must render identically at `#/` and at every legacy anchor.
4. **Page** — controls, charts, results, method note, URL state.
5. **Verification** — the list above, both builds.

Each phase is independently verifiable, and phase 2's passing fixture test is
the gate for phase 4: no UI is built on an unverified core.
