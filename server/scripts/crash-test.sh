#!/usr/bin/env bash
set -u -o pipefail

SERVICE_NAME="buildmaster"
HOST="127.0.0.1"
PORT="8787"
WAIT_SECONDS="25"
KILL_SIGNAL="KILL"
SKIP_HTTP_CHECK="false"

color_red="\033[31m"
color_yellow="\033[33m"
color_green="\033[32m"
color_reset="\033[0m"

log_ok() {
  printf "%b[OK]%b %s\n" "${color_green}" "${color_reset}" "$1"
}

log_warn() {
  printf "%b[WARN]%b %s\n" "${color_yellow}" "${color_reset}" "$1"
}

log_error() {
  printf "%b[ERROR]%b %s\n" "${color_red}" "${color_reset}" "$1"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --service <name>      systemd 服務名稱（預設: buildmaster）
  --host <ip-or-host>   健康檢查主機（預設: 127.0.0.1）
  --port <number>       健康檢查埠號（預設: 8787）
  --wait <seconds>      等待自動復原秒數（預設: 25）
  --signal <name>       kill 訊號（預設: KILL）
  --skip-http-check     略過 HTTP 恢復檢查
  -h, --help            顯示說明

Example:
  sudo ./server/scripts/crash-test.sh --service buildmaster --wait 30
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --wait)
      WAIT_SECONDS="$2"
      shift 2
      ;;
    --signal)
      KILL_SIGNAL="$2"
      shift 2
      ;;
    --skip-http-check)
      SKIP_HTTP_CHECK="true"
      shift 1
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

if ! [[ "${WAIT_SECONDS}" =~ ^[0-9]+$ ]]; then
  log_error "--wait 必須是整數秒數"
  exit 2
fi

if ! command -v systemctl >/dev/null 2>&1; then
  log_error "找不到 systemctl。此腳本需在 systemd Linux 主機執行。"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 && [[ "${SKIP_HTTP_CHECK}" != "true" ]]; then
  log_error "找不到 curl。請安裝 curl 或使用 --skip-http-check。"
  exit 1
fi

if ! systemctl list-unit-files --type=service | awk '{print $1}' | grep -Eq "^${SERVICE_NAME}\.service$"; then
  log_error "找不到 ${SERVICE_NAME}.service"
  exit 1
fi

state="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)"
if [[ "${state}" != "active" ]]; then
  log_warn "服務目前非 active（${state}），先嘗試重啟"
  if ! systemctl restart "${SERVICE_NAME}"; then
    log_error "服務重啟失敗，無法進行當機演練"
    exit 1
  fi
  sleep 1
fi

old_pid="$(systemctl show -p MainPID --value "${SERVICE_NAME}" 2>/dev/null || true)"
if ! [[ "${old_pid}" =~ ^[0-9]+$ ]] || [[ "${old_pid}" -le 1 ]]; then
  log_error "無法取得有效 MainPID（${old_pid:-empty}）"
  exit 1
fi
log_ok "演練前 MainPID=${old_pid}"

echo "Inject crash: kill -${KILL_SIGNAL} ${old_pid}"
if ! kill "-${KILL_SIGNAL}" "${old_pid}" 2>/dev/null; then
  log_warn "直接 kill 失敗，改用 systemctl kill"
  if ! systemctl kill -s "${KILL_SIGNAL}" "${SERVICE_NAME}"; then
    log_error "無法發送 kill 訊號，請以 sudo 執行"
    exit 1
  fi
fi

deadline=$((SECONDS + WAIT_SECONDS))
new_pid=""
recovered="false"

while [[ "${SECONDS}" -lt "${deadline}" ]]; do
  sleep 1
  state="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)"
  current_pid="$(systemctl show -p MainPID --value "${SERVICE_NAME}" 2>/dev/null || true)"
  if [[ "${state}" == "active" ]] && [[ "${current_pid}" =~ ^[0-9]+$ ]] && [[ "${current_pid}" -gt 1 ]] && [[ "${current_pid}" != "${old_pid}" ]]; then
    new_pid="${current_pid}"
    recovered="true"
    break
  fi
done

if [[ "${recovered}" != "true" ]]; then
  log_error "服務未在 ${WAIT_SECONDS}s 內自動復原"
  systemctl status "${SERVICE_NAME}" --no-pager -l || true
  exit 1
fi

log_ok "服務已自動復原，新 MainPID=${new_pid}"

if [[ "${SKIP_HTTP_CHECK}" == "true" ]]; then
  log_warn "已略過 HTTP 檢查"
  echo "Crash test result: PASS (process auto-restart)"
  exit 0
fi

health_url="http://${HOST}:${PORT}"
http_deadline=$((SECONDS + WAIT_SECONDS))
http_ok="false"

while [[ "${SECONDS}" -lt "${http_deadline}" ]]; do
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${health_url}" || true)"
  case "${code}" in
    2*|3*|4*)
      http_ok="true"
      break
      ;;
    *)
      sleep 1
      ;;
  esac
done

if [[ "${http_ok}" != "true" ]]; then
  log_error "服務程序復原，但 HTTP 未在 ${WAIT_SECONDS}s 內可用：${health_url}"
  exit 1
fi

log_ok "HTTP 已恢復：${health_url}"
echo "Crash test result: PASS ✅"
