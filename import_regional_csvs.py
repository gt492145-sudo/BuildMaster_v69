#!/usr/bin/env python3
"""Batch import regional CSV files into prices-*.json."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

REGION_TO_FILE = {
    "台北市": "prices-taipei.json",
    "新北市": "prices-newtaipei.json",
    "桃園市": "prices-taoyuan.json",
    "台中市": "prices-taichung.json",
    "台南市": "prices-tainan.json",
    "高雄市": "prices-kaohsiung.json",
}

REGION_TO_CSV = {
    "台北市": "prices_taipei.csv",
    "新北市": "prices_newtaipei.csv",
    "桃園市": "prices_taoyuan.csv",
    "台中市": "prices_taichung.csv",
    "台南市": "prices_tainan.csv",
    "高雄市": "prices_kaohsiung.csv",
}

NAME_KEYS = {"材料名稱", "工種項目", "name", "項目", "品名"}
UNIT_KEYS = {"單位", "unit"}
PRICE_KEYS = {"單價", "單價 (已取高標)", "price", "價格"}


def quarter_str(now: datetime) -> str:
    q = ((now.month - 1) // 3) + 1
    return f"{now.year}Q{q}"


def parse_csv(path: Path) -> List[Dict]:
    items: List[Dict] = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError(f"CSV 沒有標題列: {path}")
        fields = {x.strip(): x for x in reader.fieldnames}

        name_col = next((fields[k] for k in NAME_KEYS if k in fields), None)
        price_col = next((fields[k] for k in PRICE_KEYS if k in fields), None)
        unit_col = next((fields[k] for k in UNIT_KEYS if k in fields), None)
        if not name_col or not price_col:
            raise ValueError(f"CSV 缺少必要欄位（材料名稱 + 單價）: {path}")

        for row in reader:
            name = str(row.get(name_col, "")).strip()
            raw = str(row.get(price_col, "")).strip().replace(",", "")
            unit = str(row.get(unit_col, "")).strip() if unit_col else ""
            if not name or not raw:
                continue
            try:
                price = float(raw)
            except ValueError:
                continue
            if price <= 0:
                continue
            item = {"name": name, "price": int(price) if price.is_integer() else round(price, 2)}
            if unit:
                item["unit"] = unit
            items.append(item)
    return items


def write_region_json(output_path: Path, region: str, items: List[Dict]) -> None:
    now = datetime.now(timezone(timedelta(hours=8)))
    payload = {
        "source": f"{region} 季更資料",
        "source_site": "regional_csv_import",
        "region": region,
        "season": quarter_str(now),
        "generated_at": now.isoformat(timespec="seconds"),
        "items": items,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch import regional CSV files.")
    parser.add_argument(
        "--input-dir",
        default=".",
        help="Folder containing regional CSV files (default: current directory)",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Folder for prices-*.json output (default: current directory)",
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    if not input_dir.exists():
        raise FileNotFoundError(f"input dir not found: {input_dir}")
    if not output_dir.exists():
        raise FileNotFoundError(f"output dir not found: {output_dir}")

    updated = 0
    for region, csv_name in REGION_TO_CSV.items():
        csv_path = input_dir / csv_name
        if not csv_path.exists():
            print(f"SKIP: {region} ({csv_name} not found)")
            continue

        items = parse_csv(csv_path)
        if not items:
            print(f"SKIP: {region} ({csv_name} has no valid rows)")
            continue

        out_file = output_dir / REGION_TO_FILE[region]
        write_region_json(out_file, region, items)
        print(f"OK: {region} -> {out_file.name} ({len(items)} items)")
        updated += 1

    if updated == 0:
        print("DONE: no regional files imported")
    else:
        print(f"DONE: updated {updated} regional JSON files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
