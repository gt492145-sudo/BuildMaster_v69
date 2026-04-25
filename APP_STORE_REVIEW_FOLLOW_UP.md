# App Store Review Follow-up Checklist

Use this checklist before resubmitting after the April 25, 2026 review notes.

## 1) Demo login

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

## 2) Photo upload / take photo flow

- Build the calculation app package with the current web assets.
- Delete the previous app from the iPad before installing the new build.
- Open the calculation app and confirm the header shows `Construction Master V9.2`.
- Use the blueprint/photo upload control to choose or take a photo.
- Confirm the uploaded image appears and the app does not show the global abnormality warning.
- Confirm the loaded app package contains:
  - `index.html`
  - `scripts/bundles/bm-core.js`
  - `scripts/bundles/bm-blueprint.js`
  - `scripts/bundles/bm-calc.js`
  - `service-worker.js`

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
2. Photo upload/take photo flow: the calculation app package now includes the missing blueprint/calc bundle files and the upload flow is guarded so secondary UI or auto-calc failures do not trigger the global abnormality warning after a photo is loaded.
3. Payments: on iOS/iPadOS, external Stripe payment and redemption controls are hidden. The app directs iOS users to Apple In-App Purchase only, while Stripe remains limited to the web experience where permitted.

Please test with a clean install on iPad using the demo credentials provided in App Review Information.
```

## 5) Final local checks

- Run JavaScript syntax checks:

```bash
node --check server/src/index.js
node --check scripts/bundles/bm-core.js
node --check scripts/bundles/bm-blueprint.js
node --check scripts/bundles/bm-calc.js
node --check scripts/features/blueprint-measurement.js
node --check scripts/billing/membership-billing.js
```
