#!/usr/bin/env python3
"""Build the static reviewer dashboard from the corrected economic-unit runs."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


SITE_DIR = Path(__file__).resolve().parents[1]
ROOT = SITE_DIR.parent
EXPERIMENTS_DIR = ROOT / "experiments"
DEFAULT_PANEL_DIR = (
    ROOT
    / "data"
    / "verification_census_2026-05-31_all_polygon_oracles_economic_markets"
)
DEFAULT_FULL_DIR = (
    ROOT
    / "outputs"
    / "greedy_reward_simulation_2026-05-31_all_polygon_oracles_economic_markets_full_release"
)
DEFAULT_ROLLING_DIR = (
    ROOT
    / "outputs"
    / "rolling_lock_reward_simulation_2026-05-31_all_polygon_oracles_economic_markets_review_2d"
)
DEFAULT_BUNDLE_DIR = (
    ROOT
    / "data"
    / "verification_census_2026-05-31_all_polygon_oracles_bundle_oi"
)
DEFAULT_CENSUS_DIR = (
    ROOT / "data" / "verification_census_2026-05-31_all_polygon_oracles"
)
OUTPUT_DIR = SITE_DIR / "public" / "data"
SCENARIOS = ("low", "baseline", "high")
QUANTILES = ("p10", "p50", "p90", "p99", "mean")
ORACLE_SOURCE_LABELS = {
    "polygon_oo_v2": "Standard OOv2",
    "polygon_managed_oo_v2": "Managed OOv2",
    "polygon_oo_v1_legacy": "Legacy OOv1",
}

# One UMA DVM voting round is a fixed two-day epoch: round r votes during
# [r * 172800, (r + 1) * 172800) Unix seconds.
ROUND_WINDOW_SECONDS = 172800
STAKE_SNAPSHOT_SCHEMA = "stake-snapshots-v1"
# Meta keys that determine the snapshot payload; equality means the cache is fresh.
SNAPSHOT_CACHE_KEYS = (
    "schema",
    "panelSha256",
    "voterSha256",
    "roundWindowSeconds",
    "security",
    "costModel",
    "defaults",
)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def number(value: object) -> float | None:
    text = "" if value is None else str(value).strip()
    return None if not text else float(text)


def integer(value: object) -> int | None:
    parsed = number(value)
    return None if parsed is None else int(parsed)


def boolean(value: object) -> bool:
    return str(value).strip().lower() == "true"


def quantiles(
    row: dict[str, str] | dict[str, object], prefix: str
) -> dict[str, float | None]:
    return {key: number(row.get(f"{prefix}_{key}")) for key in QUANTILES}


def greedy_module():
    """Import the frozen simulator so the site reuses its parsing and numerics."""

    if str(EXPERIMENTS_DIR) not in sys.path:
        sys.path.insert(0, str(EXPERIMENTS_DIR))
    import greedy_reward_simulation  # pylint: disable=import-outside-toplevel

    return greedy_reward_simulation


class PanelLoader:
    """Load the frozen panel and candidate vectors at most once per build."""

    def __init__(self, panel_path: Path, voter_path: Path) -> None:
        self.panel_path = panel_path
        self.voter_path = voter_path
        self._loaded: tuple[list, dict] | None = None

    def load(self) -> tuple[list, dict]:
        if self._loaded is None:
            greedy = greedy_module()
            print(f"Loading panel {self.panel_path.name} and voters {self.voter_path.name}")
            markets = greedy.load_markets(self.panel_path)
            candidates = greedy.load_candidate_vectors(self.voter_path, markets)
            self._loaded = (markets, candidates)
        return self._loaded


@dataclass(frozen=True)
class RoundUnion:
    """Union of positive-stake revealers across every attempt in one DVM round."""

    round: int
    stakes_uma: tuple[float, ...]  # canonical order: lowercase voter address ascending
    union_stake_uma: float  # Kahan total, the simulator's capacity measure
    anchor: object  # MarketInput with the earliest dispute in the round
    markets: tuple  # MarketInput objects in sample_rank order


def iso_to_timestamp(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def utc_iso(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def round_unions(markets, candidates) -> list[RoundUnion]:
    """Group attempts by DVM round and union their positive-stake revealers.

    Within one round every request sees the same per-voter stake; the builder
    asserts that instead of assuming it.
    """

    greedy = greedy_module()
    by_round: dict[int, list] = {}
    for market in markets:
        by_round.setdefault(market.dvm_round, []).append(market)
    unions: list[RoundUnion] = []
    for round_number in sorted(by_round):
        members = sorted(by_round[round_number], key=lambda item: item.sample_rank)
        stakes_by_voter: dict[str, float] = {}
        for market in members:
            vector = candidates[market.oo_request_id]
            for address, stake in zip(vector.voter_addresses, vector.stakes_uma):
                stake_value = float(stake)
                previous = stakes_by_voter.get(address)
                if previous is None:
                    stakes_by_voter[address] = stake_value
                elif previous != stake_value:
                    raise AssertionError(
                        f"voter {address} has differing stakes within DVM round {round_number}"
                    )
        if not stakes_by_voter:
            raise AssertionError(f"DVM round {round_number} has no positive-stake revealers")
        stakes = tuple(stakes_by_voter[address] for address in sorted(stakes_by_voter))
        anchor = min(
            members,
            key=lambda item: (iso_to_timestamp(item.dispute_utc), item.sample_rank),
        )
        unions.append(
            RoundUnion(
                round=round_number,
                stakes_uma=stakes,
                union_stake_uma=float(greedy.stable_cumsum_last_axis(stakes)[-1]),
                anchor=anchor,
                markets=tuple(members),
            )
        )
    return unions


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--panel-dir", type=Path, default=DEFAULT_PANEL_DIR)
    parser.add_argument("--full-release-dir", type=Path, default=DEFAULT_FULL_DIR)
    parser.add_argument("--rolling-dir", type=Path, default=DEFAULT_ROLLING_DIR)
    parser.add_argument("--bundle-dir", type=Path, default=DEFAULT_BUNDLE_DIR)
    parser.add_argument("--census-dir", type=Path, default=DEFAULT_CENSUS_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    return parser


def scenario_payload(
    row: dict[str, str], illustration: dict[str, object] | None
) -> dict[str, object]:
    mean = float(row["mean_cost_usd"])
    return {
        "meanCostUsd": mean,
        "costLowerUsd": 0.25 * mean,
        "costUpperUsd": 4.0 * mean,
        "postedReward": quantiles(row, "posted_greedy_reward_usd"),
        "selectedVoterCount": quantiles(row, "selected_voter_count"),
        "selectedStakeUma": quantiles(row, "selected_stake_uma"),
        "selectedDirectCost": quantiles(row, "selected_direct_cost_usd"),
        "coverageRatio": quantiles(row, "coverage_ratio"),
        "rewardToCost": quantiles(row, "reward_to_selected_cost_ratio"),
        "illustration": illustration,
    }


def panel_summary_payload(row: dict[str, object]) -> dict[str, object]:
    return {
        "scenario": row["scenario"],
        "unitCount": integer(row["unit_count"]),
        "feasibleCount": integer(row["feasible_unit_count"]),
        "feasibleShare": number(row["feasible_share"]),
        "postedReward": quantiles(row, "posted_greedy_reward_usd"),
        "selectedVoterCount": quantiles(row, "selected_voter_count"),
        "selectedDirectCost": quantiles(row, "selected_direct_cost_usd"),
    }


def rolling_payload(row: dict[str, str]) -> dict[str, object]:
    return {
        "feasibleShare": number(row["rolling_capacity_feasible_share"]),
        "priorLocksInducedInfeasibleShare": number(
            row["prior_locks_induced_infeasible_share"]
        ),
        "residualRequiresMoreVotersShare": number(
            row["residual_requires_more_voters_share_conditional_feasible"]
        ),
        "preAdmissionActiveLoadUma": quantiles(
            row, "pre_admission_active_load_uma"
        ),
        "postedReward": quantiles(row, "posted_greedy_reward_usd"),
        "selectedVoterCount": quantiles(row, "selected_voter_count"),
    }


def build_illustrations(
    loader: PanelLoader,
    master_seed: int,
    correlation: float,
    cache_path: Path,
    panel_sha256: str,
    voter_sha256: str,
) -> dict[str, dict[str, dict[str, object] | None]]:
    """Create one faithful, deterministic greedy draw per unit and scenario."""

    cache_meta = {
        "schema": "greedy-illustrations-v1",
        "panel_sha256": panel_sha256,
        "voter_sha256": voter_sha256,
        "master_seed": master_seed,
        "correlation": correlation,
    }
    if cache_path.exists():
        cached = read_json(cache_path)
        if cached.get("meta") == cache_meta:
            return cached["units"]

    greedy = greedy_module()
    draw_normalized_costs = greedy.draw_normalized_costs
    greedy_scan = greedy.greedy_scan
    simulate_cost_batch = greedy.simulate_cost_batch
    stable_seed = greedy.stable_seed

    markets, candidates = loader.load()
    scales = [0.2, 1.0, 4.0]
    output: dict[str, dict[str, dict[str, object] | None]] = {}
    for market in markets:
        vector = candidates[market.oo_request_id]
        required = market.security_load_uma
        unit: dict[str, dict[str, object] | None] = {
            name: None for name in SCENARIOS
        }
        if vector.candidate_stake_uma + 1e-9 >= required:
            base_costs = draw_normalized_costs(
                1,
                vector.candidate_count,
                correlation,
                stable_seed(master_seed, market.job_id),
            )
            simulation = simulate_cost_batch(
                vector.stakes_uma,
                base_costs,
                required,
                scales,
                continuous_tolerance_usd=1e-8,
            )
            for scenario_index, (scenario, scale) in enumerate(
                zip(SCENARIOS, scales)
            ):
                reward = float(simulation.posted_reward_usd[0, scenario_index])
                costs = base_costs[0] * scale
                scan = greedy_scan(
                    reward,
                    vector.stakes_uma,
                    costs,
                    voter_ids=vector.voter_addresses,
                )
                if scan.total_stake_uma + 1e-7 < required:
                    raise AssertionError(
                        f"illustrative draw failed coverage: {market.job_id}"
                    )
                if (
                    len(scan.selected_indices)
                    != int(simulation.selected_voter_count[0, scenario_index])
                    or not math.isclose(
                        scan.total_stake_uma,
                        float(simulation.selected_stake_uma[0, scenario_index]),
                        rel_tol=1e-10,
                        abs_tol=1e-6,
                    )
                    or not math.isclose(
                        scan.selected_cost_usd,
                        float(
                            simulation.selected_direct_cost_usd[
                                0, scenario_index
                            ]
                        ),
                        rel_tol=1e-10,
                        abs_tol=1e-9,
                    )
                ):
                    raise AssertionError(
                        f"illustrative greedy scan mismatch: {market.job_id}"
                    )
                selected = [
                    {
                        "id": vector.voter_addresses[index],
                        "stakeUma": float(vector.stakes_uma[index]),
                        "costUsd": float(costs[index]),
                    }
                    for index in scan.selected_indices
                ]
                unit[scenario] = {
                    "rewardUsd": reward,
                    "selectedStakeUma": scan.total_stake_uma,
                    "selectedDirectCostUsd": scan.selected_cost_usd,
                    "selectedVoters": selected,
                }
        output[market.unit_id] = unit
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps({"meta": cache_meta, "units": output}, separators=(",", ":")),
        encoding="utf-8",
    )
    return output


def budget_caps_from_summary(panel_summary: list[dict[str, object]]) -> list[float]:
    """Recover the --budget-caps of the frozen run from its summary keys."""

    caps: set[float] = set()
    for row in panel_summary:
        for key in row:
            match = re.fullmatch(r"posted_reward_le_(.+)_usd_share", key)
            if match:
                caps.add(float(match.group(1)))
    if not caps:
        raise AssertionError("panel summary has no posted_reward_le_<cap>_usd_share fields")
    return sorted(caps)


def build_stake_snapshots(
    loader: PanelLoader,
    panel_by_unit: dict[str, dict[str, str]],
    full_by_unit: dict[str, dict[str, dict[str, str]]],
    meta: dict[str, object],
    output_path: Path,
) -> dict[str, object]:
    """Write one stake snapshot per DVM round for the browser counterfactual page.

    The cache key is the subset of ``meta`` in ``SNAPSHOT_CACHE_KEYS``; when it
    matches the existing file, the 66 MB voter table is not re-read.
    """

    if output_path.exists():
        cached = read_json(output_path)
        cached_meta = cached.get("meta")
        if isinstance(cached_meta, dict) and all(
            cached_meta.get(key) == meta[key] for key in SNAPSHOT_CACHE_KEYS
        ):
            print(f"Reusing cached stake snapshots at {output_path}")
            return cached

    markets, candidates = loader.load()
    snapshots: list[dict[str, object]] = []
    for union in round_unions(markets, candidates):
        if any(market.total_stake_uma != union.anchor.total_stake_uma for market in union.markets):
            raise AssertionError(f"round {union.round} attempts disagree on cumulativeStakeAtRound")
        attempts: list[dict[str, object]] = []
        for market in union.markets:
            panel = panel_by_unit[market.unit_id]
            baseline = full_by_unit[market.unit_id]["baseline"]
            feasible = boolean(baseline["capacity_feasible"])
            attempts.append(
                {
                    "unitId": market.unit_id,
                    "rank": market.sample_rank,
                    "question": market.question,
                    "negRisk": boolean(panel["neg_risk"]),
                    "oiUsd": market.oi_usd,
                    "feasible": feasible,
                    "baselineRewardP50Usd": (
                        number(baseline["posted_greedy_reward_usd_p50"]) if feasible else None
                    ),
                }
            )
        anchor_panel = panel_by_unit[union.anchor.unit_id]
        snapshots.append(
            {
                "round": union.round,
                "windowStartUtc": utc_iso(union.round * ROUND_WINDOW_SECONDS),
                "windowEndUtc": utc_iso((union.round + 1) * ROUND_WINDOW_SECONDS),
                "anchorDisputeUtc": union.anchor.dispute_utc,
                "anchorUnitId": union.anchor.unit_id,
                "anchorRank": union.anchor.sample_rank,
                "umaPriceUsd": union.anchor.uma_price_usd,
                "umaPriceMethod": anchor_panel["uma_price_method"],
                "cumulativeStakeAtRoundUma": union.anchor.total_stake_uma,
                "voterCount": len(union.stakes_uma),
                "unionStakeUma": union.union_stake_uma,
                "stakesUma": list(union.stakes_uma),
                "attempts": attempts,
            }
        )

    if len(snapshots) != len({market.dvm_round for market in markets}):
        raise AssertionError("snapshot count does not match the number of DVM rounds")
    if sum(len(snapshot["attempts"]) for snapshot in snapshots) != len(markets):
        raise AssertionError("snapshot attempts do not cover every panel unit")
    rounds = [int(snapshot["round"]) for snapshot in snapshots]
    if rounds != sorted(rounds):
        raise AssertionError("snapshots must be sorted by round")
    for snapshot in snapshots:
        stakes = snapshot["stakesUma"]
        if not stakes or any(not math.isfinite(stake) or stake <= 0 for stake in stakes):
            raise AssertionError(f"round {snapshot['round']} has an invalid stake vector")
        anchor_timestamp = iso_to_timestamp(str(snapshot["anchorDisputeUtc"]))
        window_end = iso_to_timestamp(str(snapshot["windowEndUtc"]))
        for attempt in snapshot["attempts"]:
            dispute_timestamp = iso_to_timestamp(panel_by_unit[attempt["unitId"]]["dispute_utc"])
            if anchor_timestamp > dispute_timestamp:
                raise AssertionError(f"round {snapshot['round']} anchor is not the earliest dispute")
            if dispute_timestamp >= window_end:
                raise AssertionError(f"round {snapshot['round']} dispute arrives after its voting window")

    payload: dict[str, object] = {
        "meta": meta
        | {
            "roundCount": len(snapshots),
            "positiveStakeCount": sum(int(snapshot["voterCount"]) for snapshot in snapshots),
        },
        "snapshots": snapshots,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )
    print(
        f"Wrote {output_path} with {len(snapshots)} DVM-round stake snapshots "
        f"({payload['meta']['positiveStakeCount']} positive stakes)"
    )
    return payload


def build(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    panel_path = args.panel_dir / "economic_markets.csv"
    voter_path = args.panel_dir / "economic_market_voters.csv.gz"
    full_results_path = args.full_release_dir / "economic_market_results.csv"
    rolling_results_path = args.rolling_dir / "rolling_economic_market_results.csv"

    panel_rows = read_csv(panel_path)
    full_rows = read_csv(full_results_path)
    rolling_rows = read_csv(rolling_results_path)
    panel_manifest = read_json(args.panel_dir / "economic_market_manifest.json")
    bundle_manifest = read_json(args.bundle_dir / "bundle_oi_manifest.json")
    census_manifest = read_json(args.census_dir / "manifest.json")
    full_summary = read_json(args.full_release_dir / "summary.json")
    rolling_summary = read_json(args.rolling_dir / "rolling_summary.json")

    full_by_unit: dict[str, dict[str, dict[str, str]]] = {}
    for row in full_rows:
        if row["unit_type"] != "economic_market_attempt":
            continue
        full_by_unit.setdefault(row["unit_id"], {})[row["scenario"]] = row
    rolling_by_job: dict[str, dict[str, dict[str, str]]] = {}
    for row in rolling_rows:
        rolling_by_job.setdefault(row["job_id"], {})[row["scenario"]] = row

    reproducibility = full_summary["reproducibility"]
    cost_model = full_summary["cost_model"]
    loader = PanelLoader(panel_path, voter_path)
    illustrations = build_illustrations(
        loader,
        int(reproducibility["master_seed"]),
        float(cost_model["within_unit_pairwise_correlation"]),
        args.output_dir / "illustrations.json",
        str(panel_manifest["market_sha256"]),
        str(panel_manifest["voter_sha256"]),
    )

    markets: list[dict[str, object]] = []
    for panel in sorted(panel_rows, key=lambda row: int(row["sample_rank"])):
        unit_id = panel["unit_id"]
        scenario_rows = full_by_unit[unit_id]
        baseline = scenario_rows["baseline"]
        rolling_baseline = rolling_by_job[panel["job_id"]]["baseline"]
        condition_oi = number(panel.get("condition_oi_usd"))
        markets.append(
            {
                "id": unit_id,
                "rank": integer(panel["sample_rank"]),
                "question": panel["question"],
                "slug": panel["slug"],
                "conditionId": panel["condition_id"],
                "requestId": panel["oo_request_id"],
                "eventId": panel["event_id"],
                "oracleVariant": panel["anchor_oracle_variant"],
                "oracleSourceUrl": panel["anchor_oracle_source_url"],
                "oracleSourceId": panel["anchor_oracle_source_id"],
                "componentOracleVariants": sorted(
                    set(json.loads(panel["component_oracle_variants_json"]))
                ),
                "componentCount": integer(panel["component_count"]),
                "unitKind": (
                    "neg_risk_event_round"
                    if panel["economic_market_type"] == "neg_risk_bundle_round"
                    else "ordinary_request"
                ),
                "disputeUtc": panel["dispute_utc"],
                "releaseUtc": panel["dvm_resolution_utc"],
                "dvmRound": integer(panel["dvm_round"]),
                "tooEarly": boolean(panel["oo_too_early"]),
                "negRisk": boolean(panel["neg_risk"]),
                "oiUsd": number(panel["oi_usd"]),
                "conditionOiUsd": condition_oi,
                "bundleConditionCount": integer(panel["bundle_condition_count"]),
                "oiScope": (
                    "event-wide active-condition signed sum"
                    if boolean(panel["neg_risk"])
                    else "condition"
                ),
                "umaPriceUsd": number(panel["uma_price_usd"]),
                "securityLoadUsd": number(panel["security_load_usd"]),
                "securityLoadUma": number(panel["security_load_uma"]),
                "capacityRatio": number(baseline["capacity_ratio"]),
                "feasible": boolean(baseline["capacity_feasible"]),
                "candidates": {
                    "observedRevealerCount": integer(
                        baseline["observed_revealer_count"]
                    ),
                    "candidateCount": integer(baseline["candidate_count"]),
                    "candidateStakeUma": number(baseline["candidate_stake_uma"]),
                    "stakeDescMinimumVoterCount": integer(
                        baseline["stake_desc_minimum_voter_count"]
                    ),
                    "effectiveCandidateCount": number(
                        baseline["effective_candidate_count"]
                    ),
                },
                "scenarios": {
                    scenario: scenario_payload(
                        scenario_rows[scenario], illustrations[unit_id][scenario]
                    )
                    for scenario in SCENARIOS
                },
                "rollingBaseline": rolling_payload(rolling_baseline),
            }
        )

    full_panel = {row["scenario"]: row for row in full_summary["panel_summary"]}
    rolling_panel = {
        row["scenario"]: row for row in rolling_summary["panel_summary"]
    }
    full_total_mean = {
        scenario: sum(
            float(row["posted_greedy_reward_usd_mean"])
            for row in full_rows
            if row["scenario"] == scenario
            and row["posted_greedy_reward_usd_mean"]
        )
        for scenario in SCENARIOS
    }
    baseline_full = full_panel["baseline"]
    baseline_rolling = rolling_panel["baseline"]

    raw_counts = census_manifest["candidate_counts_by_oracle_variant"]
    eligible_counts = census_manifest["eligible_counts_by_oracle_variant"]
    source_urls = census_manifest["oracle_source_urls"]
    attempt_counts: dict[str, int] = {variant: 0 for variant in raw_counts}
    for panel in panel_rows:
        variant = panel["anchor_oracle_variant"]
        if variant not in attempt_counts:
            raise AssertionError(f"unknown anchor oracle variant: {variant}")
        attempt_counts[variant] += 1
    oracle_sources = [
        {
            "variant": variant,
            "label": ORACLE_SOURCE_LABELS[variant],
            "sourceUrl": source_urls[variant],
            "rawCount": int(raw_counts[variant]),
            "eligibleCount": int(eligible_counts[variant]),
            "attemptCount": int(attempt_counts[variant]),
        }
        for variant in ORACLE_SOURCE_LABELS
    ]
    if sum(item["rawCount"] for item in oracle_sources) != int(
        census_manifest["inventory_count"]
    ):
        raise AssertionError("oracle-source raw counts do not reconcile")
    if sum(item["eligibleCount"] for item in oracle_sources) != int(
        panel_manifest["source_request_count"]
    ):
        raise AssertionError("oracle-source eligible counts do not reconcile")
    if sum(item["attemptCount"] for item in oracle_sources) != int(
        panel_manifest["economic_market_count"]
    ):
        raise AssertionError("oracle-source attempt counts do not reconcile")

    payload = {
        "meta": {
            "inventoryCount": census_manifest["inventory_count"],
            "sourceRequestCount": panel_manifest["source_request_count"],
            "economicUnitCount": panel_manifest["economic_market_count"],
            "ordinaryUnitCount": panel_manifest["ordinary_singleton_count"],
            "negRiskUnitCount": panel_manifest["neg_risk_bundle_round_count"],
            "negRiskEventCount": bundle_manifest["neg_risk_bundle_count"],
            "excludedCount": census_manifest["ineligible_request_count"],
            "cutoffUtc": census_manifest["dispute_cutoff_utc"],
            "trialsPerUnitScenario": reproducibility["trials_per_unit"],
            "masterSeed": reproducibility["master_seed"],
            "costCorrelation": cost_model["within_unit_pairwise_correlation"],
            "corruptionThreshold": census_manifest["corruption_threshold"],
            "attackCaptureFraction": census_manifest["attack_capture_fraction"],
            "slashFraction": full_summary["security"]["slash_fraction"],
            "reviewWindowDays": rolling_summary["rolling_lock_model"][
                "review_window_days"
            ],
            "groupingRule": panel_manifest["grouping_rule"],
            "oiRule": panel_manifest["oi_rule"],
            "oracleSources": oracle_sources,
        },
        "panelSummaries": [
            panel_summary_payload(row) for row in full_summary["panel_summary"]
        ],
        "comparison": {
            "fullRelease": {
                "admissionShare": baseline_full["feasible_share"],
                "postedReward": quantiles(
                    baseline_full, "posted_greedy_reward_usd"
                ),
                "selectedVoterCount": quantiles(
                    baseline_full, "selected_voter_count"
                ),
                "totalRewardHistoryMeanUsd": full_total_mean["baseline"],
            },
            "rolling2d": {
                "admissionShare": baseline_rolling[
                    "rolling_capacity_feasible_share"
                ],
                "capacityReducedShare": baseline_rolling[
                    "capacity_reduced_by_prior_lock_share"
                ],
                "priorLocksInducedInfeasibleShare": baseline_rolling[
                    "prior_locks_induced_infeasible_share_of_snapshot_feasible_draws"
                ],
                "residualRequiresMoreVotersShare": baseline_rolling[
                    "residual_requires_more_voters_share_conditional_feasible"
                ],
                "preAdmissionActiveLoadUma": quantiles(
                    baseline_rolling, "pre_admission_active_load_uma"
                ),
                "postedReward": quantiles(
                    baseline_rolling, "posted_greedy_reward_usd"
                ),
                "selectedVoterCount": quantiles(
                    baseline_rolling, "selected_voter_count"
                ),
                "pathTotalRewardUsd": quantiles(
                    baseline_rolling, "path_total_posted_reward_usd"
                ),
                "pathPeakActiveLoadUma": quantiles(
                    baseline_rolling, "path_peak_active_load_uma"
                ),
            },
        },
        "limitations": list(
            dict.fromkeys(
                full_summary["limitations"] + rolling_summary["limitations"]
            )
        ),
        "markets": markets,
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    # These filenames belonged to the superseded condition/request-level demo.
    # Remove them from the publishable tree so reviewers cannot accidentally
    # download data with the old OI scope.
    for legacy_name in (
        "events.csv",
        "event_results.csv",
        "requests.csv",
        "request_results.csv",
        "manifest.json",
        "summary.json",
    ):
        (args.output_dir / legacy_name).unlink(missing_ok=True)
    (args.output_dir / "dashboard.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    copies = {
        panel_path: "economic_markets.csv",
        full_results_path: "economic_market_results.csv",
        rolling_results_path: "rolling_economic_market_results.csv",
        args.panel_dir
        / "economic_market_manifest.json": "economic_market_manifest.json",
        args.bundle_dir / "bundle_oi_manifest.json": "bundle_oi_manifest.json",
        args.census_dir / "manifest.json": "census_manifest.json",
        args.census_dir
        / "inventory_manifest.json": "census_inventory_manifest.json",
        args.census_dir / "inventory.csv": "census_inventory.csv",
        args.census_dir / "candidates.csv": "census_candidates.csv",
        args.census_dir / "requests.csv": "eligible_requests.csv",
        args.full_release_dir / "summary.json": "full_release_summary.json",
        args.rolling_dir / "rolling_summary.json": "rolling_2d_summary.json",
    }
    for source, name in copies.items():
        shutil.copy2(source, args.output_dir / name)

    if len(markets) != int(panel_manifest["economic_market_count"]):
        raise AssertionError("economic-market count mismatch")
    if len(full_by_unit) != len(markets) or len(rolling_by_job) != len(markets):
        raise AssertionError("simulation join is incomplete")
    if not all(set(market["scenarios"]) == set(SCENARIOS) for market in markets):
        raise AssertionError("scenario join is incomplete")
    for market in markets:
        for scenario in SCENARIOS:
            illustration = market["scenarios"][scenario]["illustration"]
            if bool(market["feasible"]) != (illustration is not None):
                raise AssertionError("illustration feasibility mismatch")
            if illustration is None:
                continue
            voters = illustration["selectedVoters"]
            if (
                not math.isclose(
                    sum(voter["stakeUma"] for voter in voters),
                    illustration["selectedStakeUma"],
                    rel_tol=1e-10,
                    abs_tol=1e-6,
                )
                or not math.isclose(
                    sum(voter["costUsd"] for voter in voters),
                    illustration["selectedDirectCostUsd"],
                    rel_tol=1e-10,
                    abs_tol=1e-9,
                )
                or illustration["selectedStakeUma"] + 1e-7
                < market["securityLoadUma"]
            ):
                raise AssertionError("illustration totals do not reconcile")
    if "Beta(2, 8)" not in str(cost_model["marginal_distribution"]):
        raise AssertionError("cost model is not the documented Beta(2, 8) construction")
    snapshot_meta: dict[str, object] = {
        "schema": STAKE_SNAPSHOT_SCHEMA,
        "panelSha256": str(panel_manifest["market_sha256"]),
        "voterSha256": str(panel_manifest["voter_sha256"]),
        "snapshotRule": (
            "union of positive-stake revealers across all attempts in one DVM round; "
            "exact same-round stake agreement asserted"
        ),
        "anchorRule": "earliest dispute in the round supplies UMA price and dispute time",
        "roundWindowSeconds": ROUND_WINDOW_SECONDS,
        "security": {
            "corruptionThreshold": float(census_manifest["corruption_threshold"]),
            "attackCaptureFraction": float(census_manifest["attack_capture_fraction"]),
            "slashFraction": float(full_summary["security"]["slash_fraction"]),
        },
        "costModel": {
            "beta": [2, 8],
            "multiplierSupport": [0.25, 4.0],
            "scenarioMeansUsd": {
                scenario: float(cost_model["scenario_means_usd"][scenario])
                for scenario in SCENARIOS
            },
            "correlation": float(cost_model["within_unit_pairwise_correlation"]),
        },
        "defaults": {
            "oiUsd": 1_000_000,
            "seed": int(reproducibility["master_seed"]),
            "trials": int(reproducibility["trials_per_unit"]),
            "maxTrials": 5000,
            "budgetCapsUsd": budget_caps_from_summary(full_summary["panel_summary"]),
        },
    }
    build_stake_snapshots(
        loader,
        {row["unit_id"]: row for row in panel_rows},
        full_by_unit,
        snapshot_meta,
        args.output_dir / "stake_snapshots.json",
    )
    print(
        f"Wrote {args.output_dir / 'dashboard.json'} with "
        f"{len(markets)} corrected economic settlement attempts"
    )


if __name__ == "__main__":
    build()
