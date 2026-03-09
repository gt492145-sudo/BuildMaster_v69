# LiDAR 雷射測距鏡 (Native iOS App)

這是一個安全用途的 Native iOS App 範本，使用 `SwiftUI + ARKit + RealityKit` 提供:

- 中央準星即時測距
- 俯仰/翻滾角度顯示
- QA 精準等級（一般 / 精準 / Pro 精準）
- QA 門檻切換（標準 / 嚴格 / 超嚴格）
- QA 分數（0-100）即時顯示
- QA 分數門檻提醒（低分提示重測與校準）
- AI QA 錯誤矯正（即時診斷 + 一鍵矯正）
- AI 矯正比對（反覆矯正前後分數與趨勢統計）
- AI 自動連續矯正（依策略 2-4 輪，達標或趨緩自動停止）
- 自動矯正策略（穩定優先 / 速度優先）
- 量測結果紀錄
- AR 畫面截圖

## 開發環境

- Xcode 15+
- iOS 17+ (建議)
- 支援 LiDAR 的 iPhone / iPad Pro (最佳體驗)

## 快速啟用

1. 在 Xcode 建立新專案:
   - iOS App
   - Interface: SwiftUI
   - Language: Swift
2. 專案名稱可用 `LiDARRangefinder`
3. 將本資料夾內 `Sources` 的檔案加入你的 Xcode 專案。
4. 在 `Info.plist` 加入:
   - `Privacy - Camera Usage Description` = `需要相機與 LiDAR 進行工程量測`
5. 用實機執行（模擬器不支援 LiDAR / AR 相機）。

## 目前功能

- App 啟動後自動進入 AR 量測模式
- 持續讀取畫面中心點的 raycast 距離
- 可一鍵記錄量測值到本機 (`UserDefaults`)
- 可一鍵截圖並儲存到相簿

## 下一步可擴充

- 匯出 CSV / 分享報告
- 多點量測與路徑長度
- 牆面/地坪平整度 QA 模式
- BIM 座標對位與標記
