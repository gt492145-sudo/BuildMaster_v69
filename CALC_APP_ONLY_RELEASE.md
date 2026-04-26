# Calculation App Only Release Guide

This repository contains both:
- Calculation app (web + API) files
- Native iOS prototype files under `LiDARRangefinder/`

For Apple review submission of the **calculation app only**, use the packaging script below to generate a filtered archive that excludes native iOS files.

## Build a calculation-only package

Run from repository root:

`bash scripts/package-calculation-app-only.sh`

The script outputs:

`dist/calculation-app-only-v9.2.tar.gz`

## What is excluded

- `LiDARRangefinder/` (all native iOS/Xcode/Swift files)
- iOS-specific follow-up note:
  - `APP_STORE_REVIEW_FOLLOW_UP.md`

## What is included

- Calculation web app pages and assets (`index.html`, `stake.html`, `styles/`, `scripts/`, etc.)
- Backend API (`server/`)
- Supporting JSON/CSV/assets used by the calculation app
