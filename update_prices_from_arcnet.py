#!/usr/bin/env python3
"""
Quarterly price updater (automation scaffold).

What it does:
1) Finds latest "市場行情表" notice from arcnet.org.tw announcements.
2) Extracts latest PDF link from that notice.
3) Updates metadata in prices.json.
4) Optionally updates item prices from a local CSV (recommended for QA-grade accuracy).

Why CSV option exists:
- Arcnet publishes prices mostly as PDF, and PDF table parsing quality varies.
- For production accuracy, use this script to fetch latest source links,
  then feed a reviewed CSV from the latest PDF.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin
from urllib.request import Request, urlopen
import time

BASE = "https://www.arcnet.org.tw"
ANNOUNCEMENTS_URL = f"{BASE}/informations?locale=zh-TW&type=announcement"
NEWS_URL = f"{BASE}/news?locale=zh-TW"
SITEMAP_URL = f"{BASE}/sitemap.xml"
PRICES_FILE = Path(__file__).with_name("prices.json")
FALLBACK_FACTORS_BY_QUARTER = {
    1: 1.000,  # Q1 (spring)
    2: 1.010,  # Q2 (summer)
    3: 1.015,  # Q3 (autumn)
    4: 1.020,  # Q4 (winter)
}


@dataclass
class LatestNotice:
    notice_url: str
    pdf_url: str
    title: str


def fetch_text(url: str, timeout: int = 20, retries: int = 3) -> str:
    last_err: Optional[Exception] = None
    for i in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "BuildMaster/1.0"})
            with urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            last_err = e
            if i < retries - 1:
                time.sleep(1.2 * (i + 1))
    if last_err:
        raise last_err
    raise RuntimeError("unknown fetch error")


def _extract_pairs(html: str) -> List[Tuple[int, str]]:
    pairs: List[Tuple[int, str]] = []
    # 公告訊息 detail
    for sid in re.findall(r"/informations/(\d+)\?locale=zh-TW", html):
        sid_int = int(sid)
        pairs.append((sid_int, f"{BASE}/informations/{sid_int}?locale=zh-TW"))
    # 焦點360 detail
    for sid in re.findall(r"/news_details\?id=(\d+)&locale=zh-TW", html):
        sid_int = int(sid)
        pairs.append((sid_int, f"{BASE}/news_details?id={sid_int}&locale=zh-TW"))
    # 去重
    seen = set()
    out: List[Tuple[int, str]] = []
    for pid, url in sorted(pairs, key=lambda x: x[0], reverse=True):
        if url in seen:
            continue
        seen.add(url)
        out.append((pid, url))
    return out


def _extract_pairs_from_sitemap(xml_text: str) -> List[Tuple[int, str]]:
    pairs: List[Tuple[int, str]] = []
    for loc in re.findall(r"<loc>(https://www\.arcnet\.org\.tw/[^<]+)</loc>", xml_text):
        url = loc.replace("\\_", "_")
        m_info = re.search(r"/informations/(\d+)\?locale=zh-TW", url)
        if m_info:
            pairs.append((int(m_info.group(1)), url))
            continue
        m_news = re.search(r"/news_details\?id=(\d+)&locale=zh-TW", url)
        if m_news:
            pairs.append((int(m_news.group(1)), url))
    return pairs


def extract_latest_notice() -> Optional[LatestNotice]:
    pages = [ANNOUNCEMENTS_URL, NEWS_URL]
    candidates: List[Tuple[int, str]] = []
    for page in pages:
        try:
            html = fetch_text(page)
            candidates.extend(_extract_pairs(html))
        except Exception:
            continue
    # fallback: sitemap 可拿到歷史頁面
    try:
        sitemap = fetch_text(SITEMAP_URL)
        candidates.extend(_extract_pairs_from_sitemap(sitemap))
    except Exception:
        pass

    # 依 ID 由新到舊掃描；上限拉高，避免行情文在較舊頁面
    seen = set()
    ordered: List[Tuple[int, str]] = []
    for pid, url in sorted(candidates, key=lambda x: x[0], reverse=True):
        if url in seen:
            continue
        seen.add(url)
        ordered.append((pid, url))

    for _, notice_url in ordered[:180]:
        try:
            detail = fetch_text(notice_url)
        except Exception:
            continue
        if "行情表" not in detail and "工程市場資訊" not in detail:
            continue

        title_match = re.search(r"<h[1-3][^>]*>(.*?)</h[1-3]>", detail, flags=re.S)
        title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip() if title_match else "Notice"

        pdf_match = re.search(r'href="([^"]+\.pdf)"', detail, flags=re.I)
        if not pdf_match:
            continue
        pdf_url = urljoin(BASE, pdf_match.group(1))
        return LatestNotice(notice_url=notice_url, pdf_url=pdf_url, title=title)
    return None


def load_prices(path: Path) -> Dict:
    if not path.exists():
        return {"items": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_prices(path: Path, payload: Dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def quarter_str(now: datetime) -> str:
    q = ((now.month - 1) // 3) + 1
    return f"{now.year}Q{q}"


def quarter_number(now: datetime) -> int:
    return ((now.month - 1) // 3) + 1


def _normalize_price(value: float) -> float | int:
    rounded = round(value, 2)
    if rounded.is_integer():
        return int(rounded)
    return rounded


def apply_fallback_factor(items: List[Dict], factor: float) -> List[Dict]:
    updated: List[Dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        try:
            price = float(item.get("price"))
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"invalid item price for fallback factor: {name}: {exc}") from exc
        if price <= 0:
            raise ValueError(f"non-positive item price for fallback factor: {name}")

        next_item = dict(item)
        next_item["price"] = _normalize_price(price * factor)
        updated.append(next_item)
    return updated


def parse_csv_items(csv_path: Path) -> List[Dict[str, float]]:
    items: List[Dict[str, float]] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        # Accept common header variants
        name_keys = {"材料名稱", "工種項目", "name", "項目", "品名"}
        price_keys = {"單價 (已取高標)", "單價", "price", "價格"}
        unit_keys = {"單位", "unit"}

        field_map = {k.strip(): k for k in (reader.fieldnames or [])}
        name_col = next((field_map[k] for k in name_keys if k in field_map), None)
        price_col = next((field_map[k] for k in price_keys if k in field_map), None)
        unit_col = next((field_map[k] for k in unit_keys if k in field_map), None)
        if not name_col or not price_col:
            raise ValueError("CSV 缺少欄位：需要材料名稱/單價")

        for row in reader:
            name = str(row.get(name_col, "")).strip()
            raw = str(row.get(price_col, "")).strip().replace(",", "")
            if not name:
                continue
            try:
                price = float(raw)
            except ValueError:
                continue
            if price <= 0:
                continue
            record = {"name": name, "price": int(price) if price.is_integer() else price}
            if unit_col:
                unit = str(row.get(unit_col, "")).strip()
                if unit:
                    record["unit"] = unit
            items.append(record)
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Update prices.json from arcnet latest notice (quarterly scaffold).")
    parser.add_argument("--csv", help="Optional local CSV to replace items (recommended)")
    parser.add_argument("--output", default=str(PRICES_FILE), help="prices.json path")
    args = parser.parse_args()

    output = Path(args.output).expanduser().resolve()
    payload = load_prices(output)
    if (
        not args.csv
        and (not isinstance(payload.get("items"), list) or not payload.get("items"))
        and output != PRICES_FILE.resolve()
        and PRICES_FILE.exists()
    ):
        # Keep dry-run outputs usable by inheriting baseline items from repo prices.json.
        payload = load_prices(PRICES_FILE.resolve())

    notice = extract_latest_notice()
    if notice is None:
        print("WARN: 找不到最新行情公告，僅更新時間戳。")
    else:
        payload["source"] = "臺中市不動產建築開發商業同業公會"
        payload["source_site"] = BASE
        payload["latest_notice_title"] = notice.title
        payload["latest_notice_url"] = notice.notice_url
        payload["latest_pdf_url"] = notice.pdf_url
        print(f"INFO: latest notice => {notice.title}")
        print(f"INFO: notice URL   => {notice.notice_url}")
        print(f"INFO: pdf URL      => {notice.pdf_url}")

    if args.csv:
        csv_path = Path(args.csv).expanduser().resolve()
        if not csv_path.exists():
            raise FileNotFoundError(f"CSV not found: {csv_path}")
        items = parse_csv_items(csv_path)
        if not items:
            raise ValueError("CSV 解析後沒有有效資料列")
        payload["items"] = items
        payload["price_update_mode"] = "csv_reviewed"
        payload.pop("seasonal_factor", None)
        payload.pop("fallback_reason", None)
        print(f"INFO: items updated from CSV => {len(items)} rows")
    else:
        factor = FALLBACK_FACTORS_BY_QUARTER[quarter_number(datetime.now(timezone(timedelta(hours=8))))]
        current_items = payload.get("items", [])
        if not isinstance(current_items, list) or not current_items:
            raise ValueError("fallback requires existing non-empty items in prices.json")
        payload["items"] = apply_fallback_factor(current_items, factor)
        payload["price_update_mode"] = "fallback_seasonal_factor"
        payload["seasonal_factor"] = factor
        payload["fallback_reason"] = "csv_missing_or_unavailable"
        print(
            f"INFO: no --csv provided, applied fallback seasonal factor => x{factor} "
            f"({len(payload['items'])} rows)"
        )

    now = datetime.now(timezone(timedelta(hours=8)))
    payload["season"] = quarter_str(now)
    payload["generated_at"] = now.isoformat(timespec="seconds")
    save_prices(output, payload)
    print(f"DONE: updated {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
