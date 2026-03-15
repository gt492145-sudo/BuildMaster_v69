# BuildMaster 後端驗證規格（DeviceCheck + 防篡改）v1

## 1. 目的

本規格定義後端對原生 App 請求的最小安全驗證流程，目標是：

- 防止重放攻擊（Replay）
- 防止請求內容被中途篡改
- 提升「來自真實 Apple 裝置」的可驗證性
- 對異常請求提供一致錯誤碼與稽核事件

本規格對齊目前 iOS App 已加上的安全欄位：

- `X-Client-Nonce`
- `X-Client-Timestamp`
- `X-Body-SHA256`
- `X-DeviceCheck-Token`

---

## 2. 適用範圍

- 所有會寫入資料或觸發高成本任務的 API（POST/PUT/PATCH/DELETE）
- 建議逐步擴大到重要 GET（例如雲端量測結果、排程狀態）

---

## 3. 請求合約（Request Contract）

### 3.1 必填 Header

- `Authorization: Bearer <access_token>`
- `X-Client-Nonce: <uuid-v4>`
- `X-Client-Timestamp: <unix-seconds>`
- `X-Body-SHA256: <base64(sha256(raw_request_body_bytes))>`（有 body 時必填）
- `X-DeviceCheck-Token: <base64-token>`（支援 DeviceCheck 的裝置必填）

### 3.2 驗證順序（必須固定）

1. 驗證 `Authorization`
2. 驗證 `X-Client-Timestamp` 時窗
3. 驗證 `X-Client-Nonce` 未重複
4. 驗證 `X-Body-SHA256` 與 raw body 一致
5. 驗證 `X-DeviceCheck-Token`（呼叫 Apple DeviceCheck Server API）
6. 驗證業務資料本身（欄位、邏輯、權限）

若任一步驟失敗，立即拒絕並回傳對應錯誤碼，不執行下游業務邏輯。

---

## 4. 驗證規則細節

## 4.1 Authorization

- Access token 驗證失敗回 `401 UNAUTHORIZED`
- Token 過期回 `401 TOKEN_EXPIRED`
- 權限不足回 `403 FORBIDDEN`

## 4.2 Timestamp（防延遲重放）

- `X-Client-Timestamp` 必須是 Unix 秒
- 允許時差：`+-60 秒`（可調）
- 超出時窗回 `401 INVALID_TIMESTAMP`

## 4.3 Nonce（防重放）

- 以 `(user_id, nonce)` 作唯一鍵
- 建議存 Redis：`SET key value NX EX 300`
- 重複 nonce 回 `409 REPLAY_DETECTED`
- TTL 建議：`300 秒`

## 4.4 Body Hash（防內容篡改）

- 以「原始 request body bytes」計算 SHA-256（不可先 parse 再 stringify）
- Base64 後比對 `X-Body-SHA256`
- 不一致回 `422 BODY_HASH_MISMATCH`

## 4.5 DeviceCheck（裝置真實性）

- 後端接收 `X-DeviceCheck-Token`
- 透過 Apple DeviceCheck Server API 驗證 token 有效性
- 驗證失敗回 `401 DEVICE_NOT_TRUSTED`
- 建議快取驗證結果（短 TTL，例如 5~15 分鐘）降低 Apple API 壓力

備註：若裝置不支援 DeviceCheck，建議先走降級策略（風險標記 + 限流），不建議直接全放行。

---

## 5. 錯誤碼規格

- `401 UNAUTHORIZED`
- `401 TOKEN_EXPIRED`
- `401 INVALID_TIMESTAMP`
- `401 DEVICE_NOT_TRUSTED`
- `403 FORBIDDEN`
- `409 REPLAY_DETECTED`
- `422 BODY_HASH_MISMATCH`
- `429 RATE_LIMITED`
- `500 INTERNAL_ERROR`

回應格式建議統一：

```json
{
  "ok": false,
  "code": "REPLAY_DETECTED",
  "message": "Nonce already used",
  "request_id": "..."
}
```

---

## 6. 稽核與監控

每次驗證失敗都要記錄：

- `request_id`
- `user_id`（若可取得）
- `ip`
- `user_agent`
- 失敗階段（auth/timestamp/nonce/hash/devicecheck/business）
- 錯誤碼
- 伺服器時間

監控告警建議：

- `REPLAY_DETECTED` 每分鐘次數
- `DEVICE_NOT_TRUSTED` 比例
- `BODY_HASH_MISMATCH` 比例
- 驗證總失敗率

---

## 7. 上線策略（建議）

### Phase A（觀察模式，1~3 天）

- 驗證但不阻擋，只記錄 log
- 建立 baseline（正常/異常比例）

### Phase B（軟阻擋，3~7 天）

- 阻擋重放、hash mismatch
- DeviceCheck 失敗先限流 + 風險標記

### Phase C（硬阻擋）

- 對高風險 API 全量啟用硬阻擋

---

## 8. 與目前 App 簽章欄位的關係

目前 iOS `MeasurementRecord.signature` 使用的是「裝置本地 Keychain 金鑰」HMAC。

- 優點：可偵測本機資料被改動（本地完整性）
- 限制：後端無法直接驗證該簽章（因為伺服器沒有該裝置私有金鑰）

結論：後端仍需以上述 Header 驗證鏈為主，`MeasurementRecord.signature` 可作為本地風險輔助訊號。

---

## 9. v2 路線（建議）

下一版建議升級到 App Attest Assertion 驗章（後端可驗），建立「可伺服器驗證的裝置私鑰簽名鏈」，再把高風險操作全面綁定 Assertion 驗證。

