# BuildMaster 上線（方案 A：同機同源）

Node 提供 `index.html` 與 `/api`，對外只開 **Nginx 443**，反代到 **127.0.0.1:8787**。

## 1. 伺服器目錄

建議：

```text
/var/www/buildmaster/          ← git clone 專案根（含 index.html、scripts/、server/）
/var/www/buildmaster/server/.env   ← 正式環境變數（勿提交）
```

在伺服器執行：

```bash
cd /var/www/buildmaster/server && npm install
```

## 2. `server/.env` 重點

由 **Node 啟動時讀取**（勿用 systemd `EnvironmentFile` 餵 `DATABASE_URL`，避免 `&` 等字元被拆壞）。  
若服務以 `www-data` 執行，請讓該使用者能讀此檔，例如：

```bash
sudo chown root:www-data /var/www/buildmaster/server/.env
sudo chmod 640 /var/www/buildmaster/server/.env
```

- `HOST=127.0.0.1`
- `PORT=8787`
- `DATABASE_URL='…'`（Neon，整條單引號）
- `AUTH_SECRET=`（長隨機）
- `BUILDMASTER_ACCESS_CODE=`、`DEFAULT_ADMIN_PASSWORD=`（強密碼）
- 若 Stripe Webhook 同網域，再補金鑰與 `ALLOWED_ORIGINS`（多數同源可省略）

## 3. systemd

```bash
sudo cp /var/www/buildmaster/server/deploy/buildmaster-api.service /etc/systemd/system/
sudo nano /etc/systemd/system/buildmaster-api.service   # 確認 User、路徑
sudo systemctl daemon-reload
sudo systemctl enable --now buildmaster-api
sudo systemctl status buildmaster-api
```

日誌：`journalctl -u buildmaster-api -f`

## 4. Nginx + HTTPS

```bash
sudo cp /var/www/buildmaster/server/deploy/nginx-reverse-proxy.example.conf /etc/nginx/sites-available/buildmaster
sudo nano /etc/nginx/sites-available/buildmaster
sudo ln -sf /etc/nginx/sites-available/buildmaster /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

## 5. 驗收

瀏覽器開 `https://你的網域/index.html`，登入後後端 log 應有 PostgreSQL 已連線。

## 6. 權限說明

範例使用 `User=www-data`。若權限不足，可改為你部署用的 Linux 使用者，並確保該使用者能讀取 `/var/www/buildmaster` 與 `server/.env`。
