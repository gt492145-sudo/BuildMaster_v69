# Calculation App Only Release Guide

This repository contains both:
- Calculation app (web + API) files
- Native iOS prototype files under `LiDARRangefinder/`

For Apple review submission of the **calculation app only**, use the packaging script below to generate a filtered archive that excludes native iOS files and can optionally bundle review evidence (logs/videos).
The script now has a hard guard: if any native iOS/Xcode file appears in the package, it exits with non-zero status to prevent accidental mixed submissions.

## Build package(s)

Run from repository root:

`bash scripts/package-calculation-app-only.sh`

The script now outputs under `release-artifacts/`:
- `calculation-app-submission-all-in-one-<timestamp>.tar.gz` (main submission package + review evidence in one archive)

## Review evidence sources (auto-collected into the all-in-one package)

The evidence archive is generated from these folders (if files exist):
- `/opt/cursor/artifacts`
- `review-evidence/` (optional repo-local folder)

Included evidence extensions:
- Logs: `.log`, `.txt`, `.json`, `.ndjson`
- Videos: `.mp4`, `.mov`, `.webm`
- Images: `.png`, `.jpg`, `.jpeg`, `.webp`

If no matching files are found, no `app-review-evidence/` folder will be created in the archive.

## What is excluded from main package

- `LiDARRangefinder/` (all native iOS/Xcode/Swift files)
- iOS-specific follow-up note:
  - `APP_STORE_REVIEW_FOLLOW_UP.md`
  - `Xcode更新匯整存檔_黃色檔案.md`

## Guard behavior (anti-rejection safety)

`scripts/package-calculation-app-only.sh` blocks packaging when any of these are found in the output:
- `LiDARRangefinder/**`
- `*.xcodeproj/**`
- `*.xcworkspace/**`
- `*.pbxproj`
- `*.swift`
- `*.xcscheme`

## What is included in main package

- Calculation web app pages and assets (`index.html`, `stake.html`, `styles/`, `scripts/`, etc.)
- Backend API (`server/`)
- Supporting JSON/CSV/assets used by the calculation app
