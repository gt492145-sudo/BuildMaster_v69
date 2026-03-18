# 季更自動更新設定

這份專案已加入 GitHub Actions workflow：

- 檔案：`.github/workflows/quarterly-price-update.yml`
- 功能：每年 1/4/7/10 月 1 日自動更新 `prices.json`

## 1) 先決條件

1. 將專案放在 GitHub repository（不是只用 Netlify Drop）
2. Netlify 連接此 GitHub repository 自動部署

> 只要 `prices.json` 被更新並 push，Netlify 就會重新部署，App 會讀到新價格。

## 2) 手動觸發（建議）

在 GitHub：

1. 進入 `Actions`
2. 選 `Quarterly Price Update`
3. 點 `Run workflow`
4. 若你已校對好季價 CSV，可在 `csv_url` 填入檔案網址（可留空）

### CSV URL 優先順序

workflow 會按這個順序取 CSV：

1. `Run workflow` 時輸入的 `csv_url`
2. GitHub Secret：`SEASONAL_CSV_URL`（固定網址）
3. 都沒有就只更新 metadata，不覆蓋單價

## 3) 失敗通知（可選）

在 GitHub repo settings -> Secrets and variables -> Actions，新增：

- `PRICE_UPDATE_WEBHOOK`
- `SEASONAL_CSV_URL`（可選，建議填固定季價 CSV 連結）

可填入你自己的 webhook（例如 LINE Notify / Discord / Slack webhook），工作失敗時會通知。

## 4) 最穩流程（QA 建議）

由於公會來源常是 PDF，建議每季流程：

1. 取得公會最新行情資料
2. 複製 `seasonal-prices-template.csv` 為當季 CSV，人工校對後填值
3. 用 workflow 的 `csv_url` 更新

這樣精準度最高，也能避免 PDF 格式變動造成抓取偏差。

## 5) QA 驗證規格（已啟用）

workflow 內已加入 `qa_validate_prices.py`，會在 commit 前驗證：

- `prices.json` 欄位完整（source/season/generated_at/items）
- 材料名稱不可重複
- 單價必須為正數，且不可異常過大
- 必要材料 12 項不可缺漏
- 若有提供 CSV，`prices.json` 與 CSV 價格必須一致

任何一項不符，workflow 會直接失敗並停止更新。

## 6) 各縣市一鍵匯入（新增）

已提供批次匯入腳本：

- `import_regional_csvs.py`

### 準備 CSV 檔名（放同一個資料夾）

- `prices_taipei.csv`
- `prices_newtaipei.csv`
- `prices_taoyuan.csv`
- `prices_taichung.csv`
- `prices_tainan.csv`
- `prices_kaohsiung.csv`

CSV 欄位至少要有：

- `材料名稱`（或 `工種項目`）
- `單價`（或 `單價 (已取高標)`）
- `單位`（可選）

### 執行範例

```bash
cd BuildMaster_v69
python3 import_regional_csvs.py --input-dir "/Users/chenhongming/Downloads" --output-dir "."
```

執行後會自動更新對應檔：

- `prices-taipei.json`
- `prices-newtaipei.json`
- `prices-taoyuan.json`
- `prices-taichung.json`
- `prices-tainan.json`
- `prices-kaohsiung.json`
