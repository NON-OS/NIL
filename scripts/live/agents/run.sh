#!/usr/bin/env bash
# The live agent checks, each against a fresh Nil started from this checkout. Opt-in: nothing
# here runs in npm test. See docs/development.md.
#   scripts/live/agents/run.sh [check ...]
# Checks: mcp rest approvals privacy addresses webhooks (no model needed; the default), and
# service runner injection limits (need a model server, see startOllama.sh) and ui (needs
# `npm run build` and Playwright's Chromium; LIVE_UI_RUN=1 also opens a built-in run's log).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORT="${LIVE_PORT:-3917}"
SERVICE_PORT="${AGENT_SERVICE_PORT:-4700}"
export LIVE_DIR="${LIVE_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/nil-live-agents.XXXXXX")}"
export NIL_URL="http://127.0.0.1:$PORT"
export SETUP_TOKEN="live-agents-setup-token-0001"
CHECKS=("$@")
[ ${#CHECKS[@]} -eq 0 ] && CHECKS=(mcp rest approvals privacy addresses webhooks)

[ -d "$HERE/node_modules/@modelcontextprotocol" ] || npm install --prefix "$HERE" --no-audit --no-fund >/dev/null

server_pid=""
service_pid=""
stop() {
  [ -n "$service_pid" ] && kill "$service_pid" 2>/dev/null || true
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  wait 2>/dev/null || true
  server_pid=""
  service_pid=""
}
trap stop EXIT

# A fresh server and workspace for one check; extra arguments are settings for this server.
start_nil() {
  local name="$1"
  shift
  stop
  local dir="$LIVE_DIR/$name"
  rm -rf "$dir"
  mkdir -p "$dir"
  export LIVE_STATE="$dir/state.json"
  env PORT="$PORT" HOST=127.0.0.1 DATA_DIR="$dir/data" APP_URL="$NIL_URL" NOX_RPC_URL=off \
    AGENT_ALLOW_LOCAL_ENDPOINTS=true AGENT_RUN_TIMEOUT_SECONDS=1800 AGENT_POLL_SECONDS=1 AGENT_CONCURRENCY=1 "$@" \
    node --disable-warning=ExperimentalWarning "$ROOT/server/index.js" >"$dir/server.log" 2>&1 &
  server_pid=$!
  for _ in $(seq 1 100); do
    curl -sf "$NIL_URL/api/agent/v1/openapi.json" -o /dev/null && return
    sleep 0.3
  done
  echo "Nil didn't start; see $dir/server.log" >&2
  return 1
}

bootstrap() {
  node "$HERE/bootstrap.js" --state "$LIVE_STATE" --webhook "http://127.0.0.1:$SERVICE_PORT/nil" "$@" >/dev/null
}

start_service() {
  local dir
  dir="$(dirname "$LIVE_STATE")"
  node "$HERE/agentService/server.js" --port "$SERVICE_PORT" --state "$LIVE_STATE" --log "$dir/agent-service.jsonl" >"$dir/agent-service.log" 2>&1 &
  service_pid=$!
  for _ in $(seq 1 50); do
    curl -sf "http://127.0.0.1:$SERVICE_PORT/log" -o /dev/null && return
    sleep 0.2
  done
}

status=0
for check in "${CHECKS[@]}"; do
  case "$check" in
    mcp) start_nil mcp && bootstrap && node "$HERE/mcpCheck.js" --sdk v2 && node "$HERE/mcpCheck.js" --sdk v1 || status=1 ;;
    rest) start_nil rest && bootstrap && node "$HERE/restCheck.js" || status=1 ;;
    approvals) start_nil approvals && bootstrap && node "$HERE/approvalsCheck.js" || status=1 ;;
    privacy) start_nil privacy && bootstrap && start_service && curl -sf -X POST -d '{"work":false}' "http://127.0.0.1:$SERVICE_PORT/control" >/dev/null && node "$HERE/privacyCheck.js" --service "http://127.0.0.1:$SERVICE_PORT" || status=1 ;;
    addresses)
      start_nil addresses AGENT_ALLOW_LOCAL_ENDPOINTS=false && bootstrap --no-helper --webhook none && node "$HERE/addressCheck.js" --strict || status=1
      start_nil addresses-local && bootstrap && node "$HERE/addressCheck.js" || status=1
      ;;
    webhooks) start_nil webhooks AGENT_WEBHOOK_BACKOFF_SECONDS=1 AGENT_WEBHOOK_MAX_ATTEMPTS=4 AGENT_WEBHOOK_DISABLE_AFTER=6 && bootstrap && start_service && node "$HERE/webhookCheck.js" --service "http://127.0.0.1:$SERVICE_PORT" || status=1 ;;
    service)
      start_nil service && bootstrap && start_service && node "$HERE/serviceCheck.js" --service "http://127.0.0.1:$SERVICE_PORT" || status=1
      secret=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).agents.scout.webhookSecret)" "$LIVE_STATE")
      python3 -I "$HERE/verifySnippet.py" "$(dirname "$LIVE_STATE")/agent-service.jsonl" "$secret" || status=1
      ;;
    runner) start_nil runner && bootstrap && node "$HERE/runnerCheck.js" || status=1 ;;
    injection) start_nil injection && bootstrap && node "$HERE/injectionCheck.js" || status=1 ;;
    limits) start_nil limits && bootstrap && node "$HERE/limitsCheck.js" || status=1 ;;
    ui) start_nil ui && bootstrap && node "$HERE/uiCheck.js" ${LIVE_UI_RUN:+--with-run} || status=1 ;;
    *) echo "unknown check: $check" >&2; status=1 ;;
  esac
done
echo "Logs and screenshots: $LIVE_DIR"
exit $status
