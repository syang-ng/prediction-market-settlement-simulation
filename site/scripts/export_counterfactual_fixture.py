#!/usr/bin/env python3
"""Export Python-core fixtures for the browser counterfactual simulation tests.

For each requested DVM round the script builds the round's union stake vector
exactly as ``build_dashboard_data.round_unions`` does, draws a few normalized
cost trials with the Python cost model, runs the Python greedy cent-grid search
(``simulate_cost_batch``), and writes inputs plus expected outputs to
``site/src/simulation/__fixtures__/round-<round>.json``. The vitest suite
replays the same inputs through the TypeScript port and requires identical
posted rewards, selected counts, selected stakes, and direct costs.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path

import numpy as np

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from build_dashboard_data import (  # noqa: E402  pylint: disable=wrong-import-position
    DEFAULT_PANEL_DIR,
    PanelLoader,
    greedy_module,
    round_unions,
)

DEFAULT_OUTPUT_DIR = SCRIPTS_DIR.parent / "src" / "simulation" / "__fixtures__"
# Chosen on the frozen panel: 9733 is the fewest-voter round (55 revealers) and
# 10196 the most-voter round (1,012). Every round is feasible at $1M OI.
DEFAULT_ROUNDS = (9733, 10196)
SCENARIO_SCALES = {"low": 0.2, "baseline": 1.0, "high": 4.0}
SECURITY = {
    "corruptionThreshold": 0.5,
    "attackCaptureFraction": 1.0,
    "slashFraction": 1.0,
}
QUANTILE_KEYS = ("p10", "p50", "p90", "p99", "mean")


def quantile_payload(values: np.ndarray) -> dict[str, float]:
    fields = greedy_module().percentile_fields("value", values)
    return {key: fields[f"value_{key}"] for key in QUANTILE_KEYS}


def build_fixture(
    union,
    *,
    oi_usd: float,
    trials: int,
    master_seed: int,
    correlation: float,
) -> dict[str, object]:
    greedy = greedy_module()
    stakes = np.asarray(union.stakes_uma, dtype=np.float64)
    price = union.anchor.uma_price_usd
    security_load_usd = (
        SECURITY["attackCaptureFraction"] * oi_usd / SECURITY["corruptionThreshold"]
    )
    required = security_load_usd / price / SECURITY["slashFraction"]
    cost_seed = greedy.stable_seed(master_seed, f"round-{union.round}")
    costs = greedy.draw_normalized_costs(trials, stakes.size, correlation, cost_seed)
    scales = np.asarray(list(SCENARIO_SCALES.values()), dtype=np.float64)
    simulation = greedy.simulate_cost_batch(stakes, costs, required, scales)
    expected_quantiles: dict[str, dict[str, dict[str, float]]] = {}
    for index, name in enumerate(SCENARIO_SCALES):
        expected_quantiles[name] = {
            "postedRewardUsd": quantile_payload(simulation.posted_reward_usd[:, index]),
            "selectedVoterCount": quantile_payload(
                simulation.selected_voter_count[:, index].astype(np.float64)
            ),
            "selectedStakeUma": quantile_payload(simulation.selected_stake_uma[:, index]),
            "selectedDirectCostUsd": quantile_payload(
                simulation.selected_direct_cost_usd[:, index]
            ),
        }
    return {
        "round": union.round,
        "anchorUnitId": union.anchor.unit_id,
        "umaPriceUsd": price,
        "oiUsd": oi_usd,
        "security": SECURITY,
        "requiredStakeUma": required,
        "capacityUma": union.union_stake_uma,
        "scenarioScales": SCENARIO_SCALES,
        "trials": trials,
        "correlation": correlation,
        "masterSeed": master_seed,
        "costSeed": cost_seed,
        "stakesUma": stakes.tolist(),
        "normalizedCosts": costs.tolist(),
        "expected": {
            "postedRewardUsd": simulation.posted_reward_usd.tolist(),
            "selectedVoterCount": simulation.selected_voter_count.tolist(),
            "selectedStakeUma": simulation.selected_stake_uma.tolist(),
            "selectedDirectCostUsd": simulation.selected_direct_cost_usd.tolist(),
        },
        "expectedQuantiles": expected_quantiles,
        "stakeDescMinimumVoterCount": greedy.stake_desc_minimum_count(stakes, required),
        "effectiveCandidateCount": greedy.effective_validator_count(stakes),
        "software": {"python": platform.python_version(), "numpy": np.__version__},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--panel-dir", type=Path, default=DEFAULT_PANEL_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--rounds", type=int, nargs="+", default=list(DEFAULT_ROUNDS))
    parser.add_argument("--oi-usd", type=float, default=1_000_000.0)
    parser.add_argument("--trials", type=int, default=16)
    parser.add_argument("--master-seed", type=int, default=20260821)
    parser.add_argument("--correlation", type=float, default=0.8)
    args = parser.parse_args(argv)

    loader = PanelLoader(
        args.panel_dir / "economic_markets.csv",
        args.panel_dir / "economic_market_voters.csv.gz",
    )
    markets, candidates = loader.load()
    unions = {union.round: union for union in round_unions(markets, candidates)}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for round_number in args.rounds:
        if round_number not in unions:
            raise SystemExit(f"round {round_number} is not in the panel")
        fixture = build_fixture(
            unions[round_number],
            oi_usd=args.oi_usd,
            trials=args.trials,
            master_seed=args.master_seed,
            correlation=args.correlation,
        )
        path = args.output_dir / f"round-{round_number}.json"
        path.write_text(
            json.dumps(fixture, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        print(f"Wrote {path} ({len(fixture['stakesUma'])} voters, {args.trials} trials)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
