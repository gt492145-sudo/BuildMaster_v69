#!/usr/bin/env python3
"""QA validator for seasonal price data."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, List, Tuple

def fail(msg: str) -> None:
    raise ValueError(msg)


def parse_prices_json(path: Path) -> Dict:
    if not path.exists():
        fail(f"prices.json not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    for key in ["source", "source_site", "season", "generated_at", "items"]:
        if key not in payload:
            fail(f"missing key in prices.json: {key}")
    if not isinstance(payload["items"], list) or not payload["items"]:
        fail("items must be a non-empty list")
    mode = str(payload.get("price_update_mode", "")).strip()
    if mode == "fallback_seasonal_factor":
        try:
            factor = float(payload.get("seasonal_factor"))
        except Exception as e:  # noqa: BLE001
            fail(f"fallback mode requires numeric seasonal_factor: {e}")
        if factor <= 0:
            fail("seasonal_factor must be > 0")
    return payload


def validate_items(items: List[Dict]) -> Dict[str, float]:
    seen = {}
    for idx, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            fail(f"items[{idx}] is not an object")
        name = str(item.get("name", "")).strip()
        if not name:
            fail(f"items[{idx}] missing material name")
        try:
            price = float(item.get("price"))
        except Exception as e:  # noqa: BLE001
            fail(f"items[{idx}] invalid price: {e}")
        if price <= 0:
            fail(f"items[{idx}] price must be > 0: {name}")
        if price > 100000000:
            fail(f"items[{idx}] price too high: {name}={price}")
        if name in seen:
            fail(f"duplicate material name: {name}")
        seen[name] = price
    return seen


def parse_csv(path: Path) -> Dict[str, float]:
    if not path.exists():
        fail(f"csv file not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            fail("csv has no header")
        fields = {x.strip(): x for x in reader.fieldnames}
        name_col = fields.get("材料名稱") or fields.get("name")
        price_col = fields.get("單價 (已取高標)") or fields.get("單價") or fields.get("price")
        if not name_col or not price_col:
            fail("csv missing required columns: 材料名稱 + 單價")

        out: Dict[str, float] = {}
        for row in reader:
            name = str(row.get(name_col, "")).strip()
            raw = str(row.get(price_col, "")).strip().replace(",", "")
            if not name or not raw:
                continue
            try:
                price = float(raw)
            except Exception as e:  # noqa: BLE001
                fail(f"csv invalid price for {name}: {e}")
            if price <= 0:
                fail(f"csv non-positive price for {name}")
            if name in out:
                fail(f"csv duplicate material name: {name}")
            out[name] = price
    if not out:
        fail("csv has no valid rows")
    return out


def compare_with_csv(prices: Dict[str, float], csv_prices: Dict[str, float]) -> Tuple[int, int]:
    missing = [name for name in csv_prices if name not in prices]
    mismatch = []
    for name, csv_price in csv_prices.items():
        if name not in prices:
            continue
        if round(prices[name], 2) != round(csv_price, 2):
            mismatch.append((name, prices[name], csv_price))
    if missing:
        fail(f"prices.json missing csv materials: {', '.join(missing[:5])}")
    if mismatch:
        first = mismatch[0]
        fail(f"price mismatch: {first[0]} json={first[1]} csv={first[2]}")
    return len(csv_prices), len(mismatch)


def main() -> int:
    parser = argparse.ArgumentParser(description="QA validator for prices.json")
    parser.add_argument("--prices", default="prices.json", help="path to prices.json")
    parser.add_argument("--csv", default="", help="optional csv file for cross-check")
    args = parser.parse_args()

    payload = parse_prices_json(Path(args.prices))
    prices = validate_items(payload["items"])

    if args.csv:
        csv_prices = parse_csv(Path(args.csv))
        total_csv, _ = compare_with_csv(prices, csv_prices)
        print(f"PASS: prices.json validated with csv ({total_csv} rows)")
    else:
        print(f"PASS: prices.json validated ({len(prices)} items)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
