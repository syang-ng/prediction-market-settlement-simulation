# Self-hosted typography: Outfit and IBM Plex Mono

**Date:** 2026-09-02
**Status:** design approved, awaiting implementation
**Target:** `site/app/globals.css`, `site/app/fonts/`, `site/README.md`
**Parent:** implements the typography part of `2026-09-01-friendlier-dashboard-design.md` (Type section) on its own; colors, copy, and label treatment remain future work.

## Problem

The stylesheet declares `font-family: Inter, …` on `body` but never loads Inter, so body text renders in the platform sans (San Francisco, Segoe UI). Headings, wordmark, and every large figure use `Georgia, serif`; technical details use `ui-monospace`. The result is a serif/system mixture that the approved restyle replaces with one sans-serif plus one monospace system, self-hosted.

## Decisions

| Decision | Choice |
| --- | --- |
| Faces | Outfit (text, headings, labels, controls, tables, human-facing figures); IBM Plex Mono (technical values only) |
| Files | Latin subsets from the fontsource packages `@fontsource-variable/outfit` 5.3.0 and `@fontsource/ibm-plex-mono` 5.3.0 (OFL-1.1): `outfit-latin-wght-normal.woff2` (variable, weights 100–900, 32 KB), `ibm-plex-mono-latin-500-normal.woff2` (15 KB), `ibm-plex-mono-latin-600-normal.woff2` (16 KB), plus both OFL license texts. Copied into the repository once; no npm dependency is added. |
| Location | `site/app/fonts/`, referenced from `globals.css` with relative `url()`s so Vite emits them as hashed assets in both build targets. The parent spec named `site/public/fonts/`; that requires absolute `/fonts/` URLs in CSS, which break the GitHub Pages subpath deployment (`base: './'`), so the asset route is used instead. |
| Variables | `--font-sans: 'Outfit', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif` and `--font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace`, defined once in `:root`; no rule declares a family literal. |
| Weights | Outfit: 400 body, 500 medium labels and buttons (unchanged declarations), 600 for everything that was Georgia 500 (headings, wordmark, figures); existing 650/700/750 declarations stay and render true weights from the variable font. IBM Plex Mono: 500 and 600; former 700/750 mono weights map to 600. |
| Tabular digits | `font-variant-numeric: tabular-nums` on numeric display elements only (summary table, KPI tiles, quantile rows, explorer and comparison tables, detail grids, voter cost rows, counterfactual facts and headline). Prose keeps proportional digits. Outfit ships the `tnum` feature (verified with fontTools). |
| Sizes | Unchanged from the current stylesheet (already scaled ×1.2 / ×1.1). Heading letter-spacing eases from −.04/−.035/−.03em to −.02em, which suits a geometric sans. |
| Loading | `@font-face` with `font-display: swap`; no `unicode-range`, so glyphs the Latin subset lacks (Greek α κ ρ η, arrows) fall back per glyph to the system stack. |

## Mapping

- **Georgia → Outfit 600 (`--font-sans`):** `.manuscript-mark strong`, `h1`, `.hero-summary-table dd`, `.section-intro h2`, `.protocol-topline h3`, `.stage-copy h3`, `.market-orb strong, .load-orb strong`, `.reward-output strong`, `.sample-row strong`, `.comparison-row strong`, `.method-grid h3`, `.truth-callout strong`, `.source-coverage strong`, `.method-bottom h3`, `.drawer-header h2`, `.drawer-section-title h3`, `.load-state strong`, `.cf-page h1`, `.cf-card-head h2`, `.cf-headline strong`, `.cf-scenario-title h3`.
- **Georgia → IBM Plex Mono 500 (`--font-mono`), technical formulas:** `.stage-copy .stage-formula`, `.method-grid code`.
- **ui-monospace → IBM Plex Mono (`--font-mono`):** `.step-kicker`, `.parameter-stack`, `.gate`, `.market-table tbody th button span` (rank chips), `.method-number`, `.record-details dd` (identifiers), `.cf-grid text`, `.cf-oi-label` (SVG axis and OI labels), `.cf-repro` (reproducibility line).
- **Inter → `--font-sans`:** `body`.

## Verification

1. Headless Chromium via Playwright asks the DevTools protocol (`CSS.getPlatformFontsForNode`, the data behind DevTools → Computed → Rendered Fonts) for these nodes and expects only the named family (Chromium reports it with an instance suffix such as "Outfit Thin" or "IBM Plex Mono SemiBold"; the weight axis is confirmed separately through computed weights and rendered widths): dashboard `h1`, `.hero-copy`, `.hero-summary-table dd`, `.market-table td`, `.drawer-header h2` (after opening the drawer) → Outfit; `.step-kicker`, `.stage-formula` (after selecting the Load step), `.method-number` → IBM Plex Mono. Counterfactual `main h1`, `.cf-standfirst`, `.cf-headline strong`, `.cf-quantile-row span` → Outfit; `.parameter-stack span`, `.gate span`, `.cf-grid text`, `.cf-repro` → IBM Plex Mono.
2. Every network request during both page loads is same-origin (no Google Fonts or other host).
3. `globals.css` contains no `Georgia`, `Times`, `Inter`, or `ui-monospace` outside the two variable definitions.
4. `npm run build` and `npm run build:pages` both succeed and emit the three `.woff2` assets; `npm run lint` and `npm test` unchanged.
5. Screenshots at 1440 px and 780 px for both routes show no horizontal overflow and no clipped controls (Outfit is slightly wider than Georgia at heading sizes).

## Non-goals

No change to colors, copy, label case, sizes, layout, data, or simulation code. No web-font network requests. No new dependency.
