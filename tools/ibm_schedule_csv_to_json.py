#!/usr/bin/env python3
import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASKS_CSV = ROOT / "ibm_scheduler_tasks.csv"
DEPS_CSV = ROOT / "ibm_scheduler_dependencies.csv"
RES_CSV = ROOT / "ibm_scheduler_resources.csv"
MAP_CSV = ROOT / "ibm_scheduler_ifc_mapping.csv"
OUT_JSON = ROOT / "ibm_scheduler_payload.json"


def read_csv(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main():
    payload = {
        "project_id": "buildmaster_v69_pilot",
        "source": "csv_templates",
        "tasks": read_csv(TASKS_CSV),
        "dependencies": read_csv(DEPS_CSV),
        "resources": read_csv(RES_CSV),
        "ifc_mapping": read_csv(MAP_CSV),
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated: {OUT_JSON}")


if __name__ == "__main__":
    main()
