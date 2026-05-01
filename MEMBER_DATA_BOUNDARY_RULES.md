# BuildMaster 會員 / 工作區 / 共享池資料邊界規則

本文件為 BuildMaster 正式資料邊界規則。

目的只有一個：避免把「會員資料」、「會員工作資料」與「共享池技術資料」混在一起，造成隱私、法律、維護與產品責任混亂。

---

## 1. 正式資料中心

BuildMaster 正式資料中心固定為：

- `Node` 後端 API
- `PostgreSQL`

下列位置不是正式會員資料中心：

- `Git`：只管理程式碼、靜態檔、版本化資料
- `localStorage / sessionStorage`：只作為本機暫存或斷線保底
- `Google Sites` 等公開頁：只作為公開說明 / 隱私頁，不存會員資料

---

## 2. 會員資料 (`app_members`)

會員資料只負責「身份、權限、授權狀態」。

### 可存欄位

- `account`
- `password_hash`
- `password_salt`
- `level`
- `feature_overrides`
- `can_manage_members`
- `trial_ends_at`
- `created_at`
- `updated_at`

### 不可存欄位

- 計算結果
- 量測紀錄
- 校正紀錄
- 圖面學習樣本
- 共享池資料
- 會員工作成果明細

### 固定原則

- 會員資料層只存最小必要個資與授權資訊。
- 會員資料不可兼作工作區或共享池。
- 密碼不得明文存放。

---

## 3. 會員工作資料 (`app_workspaces`)

會員工作資料只負責「該會員自己的工作內容與暫存成果」。

### 可存欄位

- `list`
- `measurementLogs`
- `bimRuleMap`
- `bimAuditLogs`
- `bimSnapshots`
- `stakingRunHistory`
- `stakingReviewMemory`
- `autoInterpretMemory`
- `guidedPrecisionReviews`
- `blueprintLearningAssets`
- `autoInterpretLearningJobs`
- `autoInterpretLearningReviews`
- 其他屬於該會員本人工作區的資料

### 不可存欄位

- 其他會員的身份資料
- 全站共享池正式樣本
- 不屬於該會員的管理資料

### 固定原則

- 每個會員對應一份自己的工作區資料。
- 工作區資料可刪除、可同步、可作為校正前的個人資料來源。
- 會員刪除帳號時，其工作區資料應一併處理。

---

## 4. 共享池資料 (`shared pool`)

共享池只服務一件事：提升 BuildMaster 整體運算 / 校正 / 記憶核心能力。

### 共享池只可存

- 計算完成後的結果資料
- 校正完成後的結果資料
- 樣本向量
- 技術特徵
- 去識別化後的技術樣本
- 已複核通過、可重用的核心學習資料

### 共享池絕對不可存

- 會員帳號
- 會員姓名
- Email
- 電話
- 地址
- 裝置識別資訊
- 可直接回推會員身份的欄位
- 任何非必要個資

### 固定原則

- 共享池只存技術資料，不存會員資料。
- 共享池資料必須去識別化。
- 共享池只接受已驗證、已校正、可重用的結果。
- 未複核或半成品資料不得直接進共享池。

---

## 5. 來源追蹤規則

若系統確實需要追蹤共享樣本來源：

- 不得在共享池主表中保存會員可識別資料。
- 應改用獨立內部稽核對照表處理。
- 對照表僅限後端管理用途，不屬於共享池內容。

也就是說：

- `shared pool` = 技術資料
- `audit mapping` = 內部追蹤資料

兩者不得混表、不得混用。

---

## 6. 本機暫存規則

`localStorage / sessionStorage` 只允許作為：

- 斷線保底
- 暫時快取
- 單機操作狀態保存

不得視為正式會員資料中心。

### 固定原則

- 本機資料不是正式共享來源。
- 後端恢復時，應以後端正式資料層為準。
- 本機暫存不得取代正式會員資料或共享池資料定義。

---

## 7. Git 規則

`Git` 只管理：

- 程式碼
- 靜態資產
- 價格檔
- 腳本
- 文件

不得把會員資料、會員工作資料、共享池資料當作 Git runtime storage。

---

## 8. 目前起算後的固定結論

自本文件生效起，BuildMaster 資料邊界固定如下：

1. 會員資料進 `Node + PostgreSQL`
2. 會員工作資料進 `Node + PostgreSQL`
3. 共享池資料進 `Node + PostgreSQL`
4. 共享池不存會員任何可識別資料
5. 本機瀏覽器資料只作為暫存 / 保底
6. `Git` 與公開頁不是會員正式資料中心

---

## 9. 本文件優先原則

若未來程式、文件或臨時實作與本文件衝突，以本文件為資料邊界準則，後續應調整程式實作與資料表設計來符合本規則。
