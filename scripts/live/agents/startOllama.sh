#!/usr/bin/env bash
# Starts Ollama for the live agent checks, pulls the model you name and makes the alias
# "local-agent" for it, which the checks use. Needs `ollama` on PATH, or OLLAMA_BIN.
#   LOCAL_MODEL=<model> scripts/live/agents/startOllama.sh
set -euo pipefail

: "${LOCAL_MODEL:?Set LOCAL_MODEL to a model that supports tool calling, as the Ollama library names it.}"
OLLAMA_BIN="${OLLAMA_BIN:-ollama}"
export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
# Nil's tool list alone is about 3,000 tokens and a run grows with each step; Ollama's default
# context without a GPU is 4,096.
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-16384}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-2h}"

if ! curl -sf "http://$OLLAMA_HOST/api/version" >/dev/null; then
  nohup "$OLLAMA_BIN" serve >"${LIVE_DIR:-${TMPDIR:-/tmp}}/ollama.log" 2>&1 &
  for _ in $(seq 1 60); do
    curl -sf "http://$OLLAMA_HOST/api/version" >/dev/null && break
    sleep 0.5
  done
fi
"$OLLAMA_BIN" pull "$LOCAL_MODEL"

# llama.cpp's threads wait on each other: on a machine that's already busy, one thread is
# several times faster than all of them. LOCAL_MODEL_THREADS overrides the guess.
cores=$(nproc)
load=$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)
threads="${LOCAL_MODEL_THREADS:-$([ "$load" -ge "$cores" ] && echo 1 || echo "$cores")}"
modelfile=$(mktemp)
printf 'FROM %s\nPARAMETER num_thread %s\n' "$LOCAL_MODEL" "$threads" >"$modelfile"
"$OLLAMA_BIN" create local-agent -f "$modelfile" >/dev/null
rm -f "$modelfile"
echo "local-agent is ready at http://$OLLAMA_HOST/v1 ($threads threads, context $OLLAMA_CONTEXT_LENGTH)"
