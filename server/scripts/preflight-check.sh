#!/usr/bin/env bash
set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE="${SERVER_ROOT}/.env.local"
SERVICE_NAME="buildmaster"
HEALTH_URL=""

errors=0
warnings=0

color_red="\033[31m"
color_yellow="\033[33m"
color_green="\033[32m"
color_reset="\033[0m"

log_ok() {
  printf "%b[OK]%b %s\n" "${color_green}" "${color_reset}" "$1"
}

log_warn() {
  warnings=$((warnings + 1))
  printf "%b[WARN]%b %s\n" "${color_yellow}" "${color_reset}" "$1"
}

log_error() {
  errors=$((errors + 1))
  printf "%b[ERROR]%b %s\n" "${color_red}" "${color_reset}" "$1"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --env-file <path>   指定環境檔案路徑 (預設: server/.env.local)
  --service <name>    指定 systemd 服務名稱 (預設: buildmaster)
  --health-url <url>  覆蓋健康檢查 URL (預設由 HOST/PORT 推導)
  -h, --help          顯示說明
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --service)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --health-url)
      HEALTH_URL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  log_error "找不到環境檔：${ENV_FILE}"
  echo "請先建立 .env.local（可從 .env.example 複製）。"
  exit 1
fi
log_ok "找到環境檔：${ENV_FILE}"

if awk '/\r$/{ found=1 } END{ exit found ? 0 : 1 }' "${ENV_FILE}"; then
  log_error ".env 檔含有 Windows CRLF。請先執行：sed -i 's/\\r$//' \"${ENV_FILE}\""
else
  log_ok "行尾格式為 LF（無 CRLF）"
fi

get_env_value() {
  local key="$1"
  awk -v key="$key" '
    function ltrim(s) { sub(/^[[:space:]]+/, "", s); return s }
    function rtrim(s) { sub(/[[:space:]]+$/, "", s); return s }
    {
      line = rtrim(ltrim($0))
      if (line == "" || substr(line, 1, 1) == "#") next
      pos = index(line, "=")
      if (pos <= 1) next
      k = rtrim(ltrim(substr(line, 1, pos - 1)))
      if (k != key) next
      v = rtrim(ltrim(substr(line, pos + 1)))
      if ((substr(v,1,1) == "\"" && substr(v,length(v),1) == "\"") || (substr(v,1,1) == "\047" && substr(v,length(v),1) == "\047")) {
        v = substr(v, 2, length(v) - 2)
      }
      print v
      exit
    }
  ' "${ENV_FILE}"
}

require_var() {
  local key="$1"
  local value="$2"
  local human="$3"
  if [[ -z "${value}" ]]; then
    log_error "缺少 ${human}（${key}）"
  else
    log_ok "${key} 已設定"
  fi
}

DATABASE_URL_VALUE="$(get_env_value "DATABASE_URL")"
DB_HOST_VALUE="$(get_env_value "DB_HOST")"
DB_NAME_VALUE="$(get_env_value "DB_NAME")"
DB_USER_VALUE="$(get_env_value "DB_USER")"
DB_PASSWORD_VALUE="$(get_env_value "DB_PASSWORD")"
DBPASS_VALUE="$(get_env_value "DBPASS")"
HOST_VALUE="$(get_env_value "HOST")"
PORT_VALUE="$(get_env_value "PORT")"

if [[ -n "${DATABASE_URL_VALUE}" ]]; then
  log_ok "使用 DATABASE_URL 連線模式"
else
  require_var "DB_HOST" "${DB_HOST_VALUE}" "資料庫主機"
  require_var "DB_NAME" "${DB_NAME_VALUE}" "資料庫名稱"
  require_var "DB_USER" "${DB_USER_VALUE}" "資料庫帳號"
  if [[ -z "${DB_PASSWORD_VALUE}" ]]; then
    if [[ -n "${DBPASS_VALUE}" ]]; then
      log_warn "偵測到舊變數 DBPASS。建議改名為 DB_PASSWORD。"
    else
      log_error "缺少資料庫密碼（DB_PASSWORD）"
    fi
  else
    log_ok "DB_PASSWORD 已設定"
  fi
fi

HOST_VALUE="${HOST_VALUE:-127.0.0.1}"
PORT_VALUE="${PORT_VALUE:-8787}"
if [[ -z "${HEALTH_URL}" ]]; then
  HEALTH_URL="http://${HOST_VALUE}:${PORT_VALUE}"
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl list-unit-files --type=service | awk '{print $1}' | grep -Eq "^${SERVICE_NAME}\.service$"; then
    log_ok "找到 systemd 服務：${SERVICE_NAME}.service"
    active_state="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)"
    if [[ "${active_state}" == "active" ]]; then
      log_ok "服務目前為 active"
    else
      log_warn "服務目前狀態：${active_state:-unknown}"
    fi
  else
    log_warn "找不到 ${SERVICE_NAME}.service（若使用其他服務名稱可用 --service 指定）"
  fi
else
  log_warn "系統未安裝 systemctl，略過服務檢查"
fi

if command -v curl >/dev/null 2>&1; then
  http_code="$(curl -sS -o /dev/null -w "%{http_code}" "${HEALTH_URL}" || true)"
  case "${http_code}" in
    2*|3*|4*)
    log_ok "HTTP 可連線：${HEALTH_URL}（status ${http_code}）"
    ;;
    *)
    log_warn "HTTP 尚未可用：${HEALTH_URL}（status ${http_code:-000}）"
    ;;
  esac
else
  log_warn "找不到 curl，略過 HTTP 健康檢查"
fi

echo
echo "---- Preflight Summary ----"
echo "Errors:   ${errors}"
echo "Warnings: ${warnings}"

if [[ ${errors} -gt 0 ]]; then
  echo "結果：未通過（請先修正錯誤）"
  exit 1
fi

if [[ ${warnings} -gt 0 ]]; then
  echo "結果：可用但有警告（建議修正）"
  exit 0
fi

echo "結果：通過 ✅"
