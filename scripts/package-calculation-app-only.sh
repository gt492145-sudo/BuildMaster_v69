#!/usr/bin/env bash
set -euo pipefail

# Build a release artifact that contains only the calculation app assets.
# This excludes native iOS app sources and review notes intended for native builds.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/release-artifacts"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="${ARTIFACTS_DIR}/calculation-app-only-${STAMP}"
REVIEW_EVIDENCE_DIR="${OUTPUT_DIR}/app-review-evidence"

mkdir -p "${OUTPUT_DIR}"
mkdir -p "${REVIEW_EVIDENCE_DIR}"

copy_path() {
    local src_rel="$1"
    if [[ -e "${ROOT_DIR}/${src_rel}" ]]; then
        cp -R "${ROOT_DIR}/${src_rel}" "${OUTPUT_DIR}/${src_rel}"
    fi
}

copy_evidence() {
    local src_abs="$1"
    if [[ -f "${src_abs}" ]]; then
        cp "${src_abs}" "${REVIEW_EVIDENCE_DIR}/"
    fi
}

mkdir -p "${OUTPUT_DIR}/scripts"

# Core web app files
copy_path "index.html"
copy_path "stake.html"
copy_path "service-worker.js"
copy_path "site.webmanifest"
copy_path "_headers"
copy_path "app.css"
copy_path "styles"
copy_path "scripts/bundles"
copy_path "scripts/features"
copy_path "scripts/core"
copy_path "scripts/modules"
copy_path "scripts/billing"
copy_path "scripts/app-main.js"

# Web/backend runtime files needed by calculation app
copy_path "server"
copy_path "prices.json"
copy_path "prices-kaohsiung.json"
copy_path "prices-newtaipei.json"
copy_path "prices-taichung.json"
copy_path "prices-tainan.json"
copy_path "prices-taipei.json"
copy_path "prices-taoyuan.json"
copy_path "bm-auto-test.js"
copy_path "ifc_smoke_test.ifc"
copy_path "ifc_smoke_test.json"
copy_path "test-blueprint-1.png"
copy_path "test-blueprint-2.png"
copy_path "test-blueprint-3.png"
copy_path "test-blueprint-4.png"
copy_path "test-blueprint-5.png"
copy_path "test-blueprint-6.png"
copy_path "test-blueprint-7.png"
copy_path "test-blueprint-8.png"
copy_path "test-blueprint-9.png"
copy_path "test-blueprint-10.png"
copy_path "test-blueprint-11.png"
copy_path "test-blueprint-12.png"
copy_path "test-blueprint-13.png"
copy_path "test-blueprint-14.png"
copy_path "test-blueprint-15.png"
copy_path "logo-app.png"
copy_path "app-wallpaper.jpg"
copy_path "favicon.ico"
copy_path "favicon-32.png"
copy_path "apple-touch-icon.png"
copy_path "icon-192.png"
copy_path "icon-512.png"

# App Review evidence artifacts (logs/videos/screenshots) that Apple may request.
# These are copied INTO the same submission bundle so you can upload once.
copy_evidence "/opt/cursor/artifacts/v95_full_verification_with_db.log"
copy_evidence "/opt/cursor/artifacts/v95_privacy_url_alignment_check.log"
copy_evidence "/opt/cursor/artifacts/v95_privacy_url_alignment_check_round2.log"
copy_evidence "/opt/cursor/artifacts/v95_mobile_icon_alignment.log"
copy_evidence "/opt/cursor/artifacts/v95_logo_v90_applied_demo.mp4"
copy_evidence "/opt/cursor/artifacts/v95_layout_single_surface_v3_demo.mp4"
copy_evidence "/opt/cursor/artifacts/v95_layout_single_surface_v3.png"
copy_evidence "/opt/cursor/artifacts/v95_logo_v90_applied_header.png"
copy_evidence "/opt/cursor/artifacts/v95_mobile_icon_logo_header_confirm.png"

# Purge native/iOS-only content if accidentally copied.
rm -rf "${OUTPUT_DIR}/LiDARRangefinder" || true
rm -f "${OUTPUT_DIR}/APP_STORE_REVIEW_FOLLOW_UP.md" || true
rm -f "${OUTPUT_DIR}/Xcode更新匯整存檔_黃色檔案.md" || true

MANIFEST_PATH="${OUTPUT_DIR}/CALC_APP_ONLY_MANIFEST.txt"
{
    echo "package_type=calculation_app_only"
    echo "created_at=${STAMP}"
    echo "excluded=LiDARRangefinder,APP_STORE_REVIEW_FOLLOW_UP.md,Xcode更新匯整存檔_黃色檔案.md"
    echo
    echo "included_files:"
    (cd "${OUTPUT_DIR}" && rg --files | sort)
} > "${MANIFEST_PATH}"

ARCHIVE_PATH="${ARTIFACTS_DIR}/calculation-app-only-${STAMP}.tar.gz"
tar -czf "${ARCHIVE_PATH}" -C "${ARTIFACTS_DIR}" "calculation-app-only-${STAMP}"

EVIDENCE_MANIFEST_PATH="${REVIEW_EVIDENCE_DIR}/APP_REVIEW_EVIDENCE_MANIFEST.txt"
{
    echo "package_type=app_review_evidence"
    echo "created_at=${STAMP}"
    echo
    echo "included_files:"
    (cd "${REVIEW_EVIDENCE_DIR}" && rg --files | sort)
} > "${EVIDENCE_MANIFEST_PATH}"

echo "Output directory: ${OUTPUT_DIR}"
echo "Archive: ${ARCHIVE_PATH}"
echo "Manifest: ${MANIFEST_PATH}"
echo "Review evidence directory: ${REVIEW_EVIDENCE_DIR}"
echo "Review evidence manifest: ${EVIDENCE_MANIFEST_PATH}"
