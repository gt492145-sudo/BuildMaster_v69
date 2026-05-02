# Construction Master V9.6 local archive record

This folder is a local release archive record for the V9.6 AppLogo and version update.

## Release identity

- Branch: `cursor/update-app-logo-9-6-9f41`
- Commit: `f8abd99 Update release branding to 9.6`
- Web version label: `Construction Master V9.6`
- iOS marketing version: `9.6`
- iOS build version: `96`

## What changed

- Replaced the Web AppLogo, wallpaper, favicon, Apple touch icon, and PWA icons with the V9.6 black hole artwork.
- Replaced iOS AppIcon universal, dark, and tinted 1024x1024 assets.
- Updated Web cache-busting keys from `v951` to `v960` where release assets load.
- Updated release notes and App Store review follow-up references from V9.5.1 to V9.6.

## Files in this archive record

- `changed-files.txt`: full list of files changed by the V9.6 branding commit.
- `checksums-sha256.txt`: SHA-256 checksums for the V9.6 image assets.

## Mac / Xcode use

After pulling this branch on your Mac, open the Xcode project and confirm:

- Target Version is `9.6`.
- Target Build is `96`.
- AppIcon preview shows the black hole logo.

Before submitting to App Store Connect, run Product -> Clean Build Folder, create a new Archive, and submit only the archive marked `9.6 (96)`.
