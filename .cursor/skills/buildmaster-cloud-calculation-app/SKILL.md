---
name: buildmaster-cloud-calculation-app
description: Run and test the BuildMaster calculation app, Node API, price data, and deployment scripts in Cursor Cloud.
---

# BuildMaster calculation App Cloud runbook

Use this skill when changing or testing the calculation App web UI, `stake.html`, Node API, price data scripts, billing/login flows, or deployment scripts. Keep native iOS App work in the separate native App skill.

## Code areas

- Calculation web app: `index.html`, `stake.html`, `styles/`, `scripts/`, `bm-auto-test.js`, `test-blueprint-*.png`.
- Node API/static server: `server/src/`, `server/package.json`, `server/.env.example`.
- Price data automation: `prices*.json`, `update_prices_from_arcnet.py`, `qa_validate_prices.py`, `import_regional_csvs.py`.
- Deployment scripts: `server/deploy/`, `server/scripts/`.

## Setup and start

1. Install API dependencies once:
   - `cd server && npm install`
2. Create local env when API behavior matters:
   - `cp server/.env.example server/.env.local`
   - For Cloud smoke tests, keep default demo secrets and leave `DATABASE_URL` blank.
   - Access-code login defaults to `BUILDMASTER_ACCESS_CODE=ChangeMe2026!`.
3. Start the combined API/static server from `server/`:
   - `npm start`
   - Open `http://127.0.0.1:8787/index.html`.

## Login, flags, and mocks

- Preferred test path: start `server` and log in with the access code from `server/.env.local` or `server/.env.example`.
- If Postgres is unavailable, access-code login still works; member admin, workspace sync, and `/api/data/bootstrap` require a real DB.
- Frontend-only path: on `localhost` or `127.0.0.1`, click `先略過登入，進主流程（本機／不接後端）` to create a local pro demo session.
- If static hosting causes 404/501 API failures, use `將 API 指向本機 Node（8787）並重新整理` or set local storage `bm_69:api_base_url=http://127.0.0.1:8787`.
- Local offline demo grants most pro entitlements without backend calls, but not `quantumStake`.
- Optional integrations need secrets:
  - `OPENAI_ENABLED=true` plus `OPENAI_API_KEY` for `/api/ai/coach`.
  - `IBM_QUANTUM_API_KEY` for `/api/ibm/quantum-job`.
  - Stripe/Apple keys for billing redemption flows.
- Useful local storage toggles:
  - `bm_69:user_level`: `basic`, `standard`, or `pro`.
  - `bm_69:work_mode`: `calc` or `stake`.
  - `bm_69:demo_mode`: `1` enables demo data behavior.
  - `bm_69:measure_assist`, `bm_69:measure_strict`, `bm_69:gyro_mode`: set `1` to enable related tools.

## Testing workflows

### Web/API smoke test

1. Confirm API and static files are served:
   - `curl -sS http://127.0.0.1:8787/api/health`
   - `curl -I http://127.0.0.1:8787/index.html`
2. Smoke login with access code:
   - `curl -sS -X POST http://127.0.0.1:8787/api/auth/login -H 'Content-Type: application/json' -d '{"accessCode":"ChangeMe2026!"}'`
3. For UI changes, manually test in Chrome through `http://127.0.0.1:8787/index.html`, using access-code login or local offline demo.
4. For blueprint/staking changes, open the mobile drawer `功能` -> `🤖 藍圖自動測試（15 張）`; this loads `bm-auto-test.js` and `test-blueprint-*.png`.
5. If service worker behavior looks stale, close the tab, unregister the service worker in Chrome Application tools, then reload from the Node-served URL.

### API and deployment scripts

- There is no npm test script. Validate changed handlers with targeted `curl` requests and inspect server logs.
- Deployment preflight expects `server/.env.local` or an explicit env file:
  - `bash server/scripts/preflight-check.sh --env-file server/.env.local --health-url http://127.0.0.1:8787/api/health`
- `server/scripts/crash-test.sh` is for systemd hosts only. Do not run it in normal Cloud workspaces unless a real `buildmaster.service` exists.

### Price data

- Validate committed price data after any `prices*.json` or CSV importer change:
  - `python3 qa_validate_prices.py --prices prices.json`
- Generate fallback seasonal prices:
  - `python3 update_prices_from_arcnet.py`
- Validate against a reviewed CSV when present:
  - `python3 qa_validate_prices.py --prices prices.json --csv seasonal-prices.csv`
- Import regional CSVs from a folder containing `prices_taipei.csv`, `prices_newtaipei.csv`, etc.:
  - `python3 import_regional_csvs.py --input-dir <csv-dir> --output-dir .`

## Updating this skill

- Add new calculation/API runbook knowledge after discovering a repeatable setup fix, login trick, feature flag, fixture, or test command.
- Keep updates practical for Cloud agents: exact commands, required env vars, known limitations, and what success looks like.
- Replace stale instructions instead of appending caveats.
