# App Store Review Follow-up Checklist

Use this checklist before resubmitting after the April 25, 2026 review notes.

## 1) Demo login

- Computer-only local test URL for the V9.6 calculation app:
  - `http://127.0.0.1:8787/index.html`
- Do not use the `127.0.0.1` URL in Xcode/WebView phone testing; on a phone it points back to the phone, not the computer.
- For Xcode/WebView phone testing, load the GitHub Pages project URL, not the account root:
  - `https://gt492145-sudo.github.io/BuildMaster_v69/`
  - `https://gt492145-sudo.github.io/BuildMaster_v69/index.html`
- Do not use `https://gt492145-sudo.github.io` by itself; the account root returns GitHub Pages 404 and will show "We couldn't find the page you were looking for."
- If the phone still shows `www.wenwenming.com`, Xcode is still loading the old site URL. In the Xcode project, search for `wenwenming.com` and replace the WebView/launch URL with `https://gt492145-sudo.github.io/BuildMaster_v69/`, then delete the app from the phone and run again.
- `WebCalcHostView.swift` prints the loaded URL with `BM WebView URL:` after navigation finishes. The expected console value is `https://gt492145-sudo.github.io/BuildMaster_v69/index.html`.
- Calculation native app entry is `WebCalcHostView()`, which is separate from the LiDAR/AR `ContentView()` workflow and loads the V9.6 web calculation app.
- GitHub Pages phone testing can use the "先略過登入，進主流程（本機／不接後端）" button to validate the free/basic first-page calculation flow before the production API is deployed.
- Configure the production API environment with the exact credentials supplied in App Store Connect:
  - `APP_REVIEW_DEMO_ACCOUNT`
  - `APP_REVIEW_DEMO_PASSWORD`
  - `APP_REVIEW_DEMO_LEVEL=pro`
- Restart the API service after updating the environment file.
- Verify login from a clean install on iPad:
  - Delete the app.
  - Install the release build.
  - Log in with the App Review demo credentials.
  - Confirm the app enters the main workspace and shows pro-level access.

## 2) Take photo / screenshot crash

- Build and run the release configuration on a physical iPad.
- Tap the photo/screenshot button that saves the AR view to Photos.
- Confirm iPadOS shows the Photos add permission prompt and the app does not crash.
- Confirm the saved image appears in Photos.
- Confirm the release Info.plist includes:
  - `NSCameraUsageDescription`
  - `NSPhotoLibraryAddUsageDescription`

## 3) In-app purchase compliance

- On iOS/iPadOS, confirm the membership panel does not show:
  - Stripe payment links
  - Stripe Session ID input
  - Stripe redemption button
- Confirm iOS/iPadOS copy directs users to Apple in-app purchase only.
- Confirm web storefronts may still show Stripe payment where allowed.
- Confirm App Store Connect includes configured Apple IAP product IDs that match:
  - `APPLE_IAP_PRODUCT_BASIC`
  - `APPLE_IAP_PRODUCT_STANDARD`
  - `APPLE_IAP_PRODUCT_PRO`

## 4) Suggested App Review response

```text
Hello App Review Team,

Thank you for the detailed review notes. We addressed the reported issues in this resubmission:

1. Demo login: the production API now supports the App Review demo credentials through a dedicated configured review account, so the provided credentials can log in without depending on member database availability.
2. Take photo crash: the iOS target now includes the required Photos add permission description for saving measurement screenshots to the photo library, and the camera/photo flow should no longer terminate due to missing privacy usage text.
3. Payments: on iOS/iPadOS, external Stripe payment and redemption controls are hidden. The app directs iOS users to Apple In-App Purchase only, while Stripe remains limited to the web experience where permitted.

Please test with a clean install on iPad using the demo credentials provided in App Review Information.
```

## 4.1) Privacy consistency note (public site vs app)

- Confirm app login page points to the same public privacy URL:
  - `https://sites.google.com/view/buildmaster-privacy/首頁`
- Confirm in-app/website summary page `privacy.html` includes this exact maintenance note:
  - `[備注往後原生App完成後會做陸續更新進去這個版本]`
- Keep the public Google Sites privacy policy and app-side summary text aligned for every future release.

## 5) Final local checks

- Run JavaScript syntax checks:

```bash
node --check server/src/index.js
node --check scripts/bundles/bm-core.js
node --check scripts/billing/membership-billing.js
```

- Run an iOS build on macOS:

```bash
cd LiDARRangefinder/LiDARRangefinder
xcodebuild \
  -project "LiDARRangefinder.xcodeproj" \
  -scheme "LiDARRangefinder" \
  -destination "generic/platform=iOS Simulator" \
  -configuration Release \
  build
```

## 6) Prepare review attachment package (logs + videos)

- Apple review follow-up may require evidence artifacts. Build both submission package and evidence package:

```bash
bash scripts/package-calculation-app-only.sh
```

- The script now produces:
  - Main package: `release-artifacts/calculation-app-only-<timestamp>.tar.gz`
  - Review evidence package: `release-artifacts/calculation-app-review-evidence-<timestamp>.tar.gz`

- To include specific evidence files, put them under:
  - `release-artifacts/review-evidence/logs/`
  - `release-artifacts/review-evidence/videos/`
  - (optional) `release-artifacts/review-evidence/screenshots/`

- Example:

```bash
mkdir -p release-artifacts/review-evidence/logs release-artifacts/review-evidence/videos
cp /opt/cursor/artifacts/v95_full_verification_with_db.log release-artifacts/review-evidence/logs/
cp /opt/cursor/artifacts/v95_logo_v90_applied_demo.mp4 release-artifacts/review-evidence/videos/
bash scripts/package-calculation-app-only.sh
```
