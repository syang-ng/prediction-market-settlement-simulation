# Controllable cost correlation on the counterfactual page

**Date:** 2026-09-03
**Status:** design approved, implemented
**Target:** `site/src/simulation/costs.ts`, `site/src/simulation/counterfactual.ts`, `site/src/simulation/types.ts`, `site/src/routes/counterfactualParams.ts`, `site/src/routes/Counterfactual.tsx`, `site/app/globals.css`
**Parent:** extends `2026-09-02-counterfactual-oi-simulation-design.md`, which froze ρ at the calibrated 0.8.

## Problem

Two problems, one cause.

**Reading the output is confusing.** In round 9733 a single trial produces about 7 distinct cost values across 55 voters. The first-draw table repeats the same dollar figure down most of its rows, which reads like a bug. It is not: the cost model is a common-shock mixture. Every voter draws an idiosyncratic `U_i ~ Beta(2, 8)`; one common `D ~ Beta(2, 8)` is drawn per trial; voter *i* takes `D` with probability `√ρ`. At the calibrated ρ = 0.8 that is `√0.8 = 0.894`, so about 89% of voters hold *literally the same* cost, not merely a correlated one. Measured over 200 trials of round 9733: mean 6.9 distinct values, largest tie group 49.1 of 55 voters (89.2%). At ρ = 0 all 55 differ.

**ρ is not reachable from the browser.** The Python engine already exposes `--cost-correlation` (`greedy_reward_simulation.py:1991`, default 0.8). The browser counterfactual reads ρ as a frozen constant out of `public/data/stake_snapshots.json` → `meta.costModel.correlation`, and the page's URL state carries only `round, oi, seed, trials, scenario`. A reader who wants to know what the correlation assumption is doing to the posted reward cannot find out.

## Decisions

| Decision | Choice |
| --- | --- |
| Scope | The counterfactual page only. `Dashboard.tsx` describes the *Python* simulation and keeps reading `data.meta.costCorrelation`; the frozen data file and the Python pipeline are untouched. |
| Surface | A first-class input: a `NumberField` beside Seed and Trials, `rho` in the hash query so a link reproduces a run, a deviation marker when ρ leaves the calibrated value, and page copy that reports the *operating* ρ rather than the frozen one. |
| Role of the model constant | `model.costModel.correlation` demotes from operating value to calibrated default. `runCounterfactual` reads `params.correlation`; changing the constant no longer moves a run. |
| Stream layout | Fixed at `n·9 + 9 + n` uniforms per draw for every ρ, endpoints included. |
| Endpoints | No special case. `uniform53()` lies in `[0, 1)`, so the threshold `√0` = 0 selects nobody and `√1` = 1 selects everybody. |
| Range handling | Clamp to `[0, 1]` rather than reject; both endpoints are ordinary settings. No rounding to a grid — the control steps in hundredths but a hand-written URL keeps its precision, which also makes parse/serialize idempotent. |
| Legibility | The first-draw panel reports how many distinct cost values the draw actually contains, so moving ρ visibly collapses or spreads the costs. |

## Why the stream layout had to change

`uniformsPerDraw` previously returned three different widths — `n·9` at ρ = 0, `n·9 + 9` at ρ = 1, `n·9 + 9 + n` in between. Within the open interval the layout was already fixed, so ρ was already a clean knob there; only the two exact endpoints diverged. Left alone, a control that can reach 0 and 1 would reshuffle the entire draw at those settings, and a reader dragging ρ toward 0 would see the numbers scramble rather than see correlation come out of the model.

Drawing `D` and the `n` selection uniforms unconditionally fixes that and *removes* code, because the threshold already handles both endpoints. The consequence is the property the control needs: from one seed, the set of voters on the common value **nests** as ρ rises, and every voter that stays idiosyncratic keeps exactly the cost it had. Measured on round 9733, seed 20260821:

| ρ | 0 | 0.2 | 0.25 | 0.5 | 0.8 | 1 |
| --- | --- | --- | --- | --- | --- | --- |
| distinct cost values (of 55) | 55 | 30 | 29 | 14 | 7 | 1 |
| baseline posted reward p50 | $0.50 | $0.54 | $0.56 | $0.64 | $0.77 | $0.91 |

ρ = 0.8 is byte-identical to the previous implementation — the pinned reference-parity test in `counterfactual.test.ts` passes unchanged. Only the two endpoints consume the stream differently than before, and than the Python reference does at those points. TypeScript and Python already do not match draw for draw (different PRNGs; the page's method note says so), so no parity claim is weakened.

## Components

- **`costs.ts`** — `uniformsPerDraw(voterCount)` drops its `correlation` argument. `drawNormalizedCosts` loses both endpoint branches.
- **`simulation/types.ts`** — `CounterfactualParams.correlation`; `CounterfactualResult.firstDrawDistinctCostCount: number | null`, null when the snapshot is infeasible and no draw happens. The count is scenario-independent: scenarios only scale a shared normalized draw.
- **`counterfactual.ts`** — validates `0 ≤ ρ ≤ 1` alongside the existing guards, draws with `params.correlation`, and counts distinct values on trial 0 before the greedy scan reuses the buffer. `CounterfactualInput` picks ρ up through its existing spread.
- **`counterfactualParams.ts`** — `CounterfactualView.rho`, `sanitizeRho(raw, fallback)`, `rho` in `serializeView`, and a `calibratedRho` fallback argument on `parseView`.
- **`Counterfactual.tsx`** — the control, `rho` in `runKey` and the run effect's dependencies, ρ restored by *Reset to defaults*, the deviation entry, the operating ρ in the scenario headers and the method note, and the distinct-value readout under the first-draw table. `NumberField` gains an optional `max` and accepts a `ReactNode` label.
- **`globals.css`** — `.cf-draw-ties`, and `.cf-field > span .glyph` so the label's ρ escapes `text-transform: uppercase` (uppercased ρ is Greek capital Ρ, indistinguishable from a Latin P).

## Testing

- `costs.test.ts` — the `referenceDraw` helper matches the unconditional construction; new assertions that the stream advances by `uniformsPerDraw(n)` at every ρ, that the endpoints behave without a special case, that idiosyncratic draws are held fixed across ρ, and that the common-value set nests.
- `counterfactual.test.ts` — ρ validation; ρ comes from the params and not the model constant; the distinct count across every candidate; and monotone collapse over ρ, which follows from nesting rather than from sampling.
- `counterfactualParams.test.ts` — `sanitizeRho` bounds and precision, the endpoints as valid settings, `rho` round-tripping, and parse/serialize idempotence.
- Browser — Playwright over the five ρ settings plus typing into the control, clamping an out-of-range entry, and *Reset to defaults*. The in-app browser pane is unsuitable here: it runs hidden, and the run effect schedules through `requestAnimationFrame`, which a hidden document never fires.

## Not doing

Replacing the mixture with a Gaussian-copula or latent-factor construction. That would give correlation ρ with no point mass — voters clustered rather than identical — but it changes the calibrated model rather than exposing it, and it drops the exactness the mixture buys (Beta marginals preserved exactly, pairwise correlation exactly ρ). Worth its own spec if the atom itself turns out to be the wrong assumption.
