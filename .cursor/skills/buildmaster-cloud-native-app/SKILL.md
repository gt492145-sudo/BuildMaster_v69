---
name: buildmaster-cloud-native-app
description: Run and test the BuildMaster native iOS app area in Cursor Cloud.
---

# BuildMaster native App Cloud runbook

Use this skill only when changing or testing the native iOS app under `LiDARRangefinder/`. Do not put calculation web app or Node API workflows in this file.

## Native App area

- Native iOS project: `LiDARRangefinder/LiDARRangefinder/LiDARRangefinder.xcodeproj`.
- Swift sources: `LiDARRangefinder/LiDARRangefinder/**/*.swift`.
- App docs and field checklists: `LiDARRangefinder/README.md`, `LiDARRangefinder/*驗收*.md`, `LiDARRangefinder/*快速*.md`.
- CI quality gate: `.github/workflows/ios-enterprise-quality.yml`.

## Setup

- Cursor Cloud runs Linux, so it cannot build Xcode projects directly.
- Use Cloud for code review, source edits, plist/project-file checks, and security baseline checks.
- Use macOS or GitHub Actions for simulator builds.
- Use a physical LiDAR-capable iPhone/iPad for real AR camera and LiDAR validation.

## Testing workflow

1. Review changed Swift and project files:
   - `rg -n "TODO|FIXME|fatalError|print\\(" LiDARRangefinder/LiDARRangefinder --glob "*.swift"`
2. Preserve the transport/security baseline:
   - `rg -n "NSAllowsArbitraryLoads\\s*=\\s*YES" "LiDARRangefinder/LiDARRangefinder/LiDARRangefinder.xcodeproj/project.pbxproj" && exit 1 || true`
   - `rg -n "X-Client-Nonce|X-Client-Timestamp|X-Body-SHA256|X-DeviceCheck-Token" "LiDARRangefinder/LiDARRangefinder" --glob "*.swift"`
3. On macOS or CI, build the app:
   - `cd LiDARRangefinder/LiDARRangefinder`
   - `xcodebuild -project "LiDARRangefinder.xcodeproj" -scheme "LiDARRangefinder" -destination "generic/platform=iOS Simulator" -configuration Debug build`
4. For AR/LiDAR behavior, run on device and verify:
   - camera permission prompt appears with the expected purpose string,
   - central reticle distance updates,
   - measurement record/save/share flows still work,
   - AR blueprint tracking and QA prompts match the acceptance checklist.

## Backend/API assumptions for native App work

- Capacitor/iOS runtime defaults API calls to `https://wenwenming.com`.
- For calculation web app or local Node API testing, use the separate calculation App skill.
- Optional external integrations need real secrets and should be mocked or skipped unless the task specifically covers them.

## Updating this skill

- Add any repeatable app build, signing, device-test, or App Store review trick as soon as it is discovered.
- Keep notes practical: exact command, required device or OS, expected success signal, and known Cloud limitation.
- Replace stale instructions instead of adding conflicting caveats.
