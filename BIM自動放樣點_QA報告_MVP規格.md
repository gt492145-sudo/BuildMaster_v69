# BIM 自動放樣點 + QA 驗證報告（MVP 規格）

## 目標
- 將 BIM（IFC）模型自動轉成可施工的放樣點資料。
- 在輸出前完成 QA 檢核，並一鍵產生可交付報告。

---

## 1) MVP 範圍（第一版）

### 1.1 輸入
- IFC 檔（`.ifc` / `.ifczip`）
- 專案基準設定（樓層、原點、旋轉角）
- 放樣抽取類型（柱、牆、梁）

### 1.2 輸出
- 放樣點清單（CSV）
- QA 驗證報告（CSV）

### 1.3 不含（留第二版）
- 全 3D 幾何精準重建
- DXF 複雜圖層輸出
- 雲端多人協作

---

## 2) 核心流程

1. 上傳 IFC 模型  
2. 解析 Entity 與構件類型  
3. 依規則抽取放樣點（柱心、牆端點、梁線端點）  
4. 套用座標轉換（平移/旋轉）  
5. 執行 QA 檢核（重複點、偏差、缺漏）  
6. 匯出放樣點清單與 QA 報告  

---

## 3) 資料結構（建議）

## 3.1 放樣點
- `id`: 唯一編號（如 `LP-0001`）
- `sourceElementId`: IFC 來源構件（如 `#123`）
- `sourceType`: `IFCCOLUMN` / `IFCWALL` / `IFCBEAM`
- `pointType`: `CENTER` / `END_A` / `END_B`
- `x`, `y`, `z`
- `floorTag`
- `status`: `draft` / `checked` / `exported`

## 3.2 QA 結果
- `duplicatePointCount`
- `missingGeometryCount`
- `outOfRangeCount`
- `maxDeviation`
- `qaScore`（0~100）
- `warnings[]`

---

## 4) 抽點規則（MVP 簡化版）

### 柱（IFCCOLUMN）
- 抽「中心點」1 點

### 牆（IFCWALL）
- 抽「起點 + 終點」2 點

### 梁（IFCBEAM）
- 抽「起點 + 終點」2 點

> 若幾何資訊不足，先記錄為 QA 警示，不中斷整體流程。

---

## 5) QA 驗證規則（MVP）

- **重複點檢查**：點位距離 < 1 cm 視為重複
- **空值檢查**：x/y/z 任一缺失列為錯誤
- **範圍檢查**：超出專案合理邊界列為警示
- **類型完整性**：有構件但未抽出點位列為警示

### QA 分數建議
- 基礎分 100
- 每項錯誤扣分（例如重複點每筆 -1，上限 -20）
- 最低 0 分

---

## 6) UI 設計（v69 內嵌）

新增區塊：`BIM 放樣助手（MVP）`

包含：
- 抽點類型勾選（柱/牆/梁）
- 產生放樣點按鈕
- QA 檢核按鈕
- 匯出放樣點 CSV
- 匯出 QA 報告 CSV
- 放樣點表格（前 200 筆預覽）

---

## 7) 匯出格式

## 7.1 放樣點 CSV 欄位
- 點位ID,來源構件,構件類型,點位類型,X,Y,Z,樓層,狀態

## 7.2 QA 報告 CSV 欄位
- 報告時間,專案名稱,模型檔名,點位總數,重複點,缺漏幾何,越界點,最大偏差,QA分數,警示摘要

---

## 8) 驗收標準（MVP）

- 可讀 IFC 並成功產生放樣點
- 可一鍵匯出 2 份報告（放樣點 + QA）
- QA 檢核結果可重現（同檔重跑一致）
- 錯誤檔案不白畫面，有明確提示

---

## 9) 開發順序（建議）

1. 建 `layoutPoints` 資料模型  
2. 做 `generateLayoutPointsFromIFC()`  
3. 做 `runLayoutQaCheck()`  
4. 做 `exportLayoutPointsCSV()`  
5. 做 `exportLayoutQaReportCSV()`  
6. 接入 `audit log` + `snapshot`

---

## 10) 第二版可升級方向

- 與量圖數據雙向比對（BIM vs 現場）
- 放樣點偏移/旋轉批次修正
- DXF 匯出與圖層映射
- 雲端會員協作與權限流程
