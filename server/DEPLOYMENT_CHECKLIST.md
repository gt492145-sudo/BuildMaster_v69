# BuildMaster API Deployment Checklist

Use this checklist when deploying `buildmaster.service` to a Linux server.

## 1) Environment file

- Create `server/.env.local` from `server/.env.example`.
- Ensure these keys are set: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Use `DB_PASSWORD` only. `DBPASS` is deprecated and kept for migration compatibility.
- Normalize line endings if edited on Windows:

```bash
sed -i 's/\r$//' .env.local
```

## 1.5) Preflight self-check (recommended)

Run before restart to catch missing env vars and common setup issues:

```bash
chmod +x server/scripts/preflight-check.sh
./server/scripts/preflight-check.sh
```

## 2) Systemd wiring

- Confirm service references the correct working directory and env file:

```bash
sudo systemctl cat buildmaster
```

- Verify `EnvironmentFile=` points to the same `server/.env.local` you edited.

## 3) Restart and health checks

```bash
sudo systemctl daemon-reload
sudo systemctl restart buildmaster
sleep 2
sudo systemctl status buildmaster --no-pager -l
sudo systemctl is-active buildmaster
curl -i http://127.0.0.1:8787
```

Expected:
- `is-active` returns `active`
- API log contains `BuildMaster security API listening on http://127.0.0.1:8787`

## 4) Troubleshooting quick path

```bash
sudo journalctl -u buildmaster -n 100 --no-pager
```

If you see missing PostgreSQL config errors, re-check `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

## 5) Security hygiene

- Do not commit real secrets to Git.
- Rotate any leaked API keys immediately.
- Keep `.env.local` permission-restricted on server hosts.

## 6) Crash recovery drill (recommended)

Verify the service can auto-recover after process crash:

```bash
chmod +x server/scripts/crash-test.sh
sudo ./server/scripts/crash-test.sh --service buildmaster --wait 30
```

Expected:
- Main PID changes after kill
- `systemctl is-active buildmaster` returns `active`
- health check URL becomes reachable again
