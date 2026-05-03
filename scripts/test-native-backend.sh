#!/usr/bin/env bash
# scripts/test-native-backend.sh
#
# Builds the LiteRT-LM C++ bridge, starts the proxy, and runs the full
# benchmark suite (S1 text · S2 vision · S3 multi-turn KV-cache).
# Supported platforms: macOS (arm64/x64) and Linux x64.
#
# Usage:
#   ./scripts/test-native-backend.sh /path/to/LiteRT-LM
#   LITERT_LM_DIR=/path/to/LiteRT-LM ./scripts/test-native-backend.sh
# -----------------------------------------------------------------------
set -euo pipefail

PLATFORM=$(uname -s)
case "$PLATFORM" in
  Darwin) PLATFORM_NAME="macOS" ;;
  Linux)  PLATFORM_NAME="Linux" ;;
  *)      echo "❌ Unsupported platform: $PLATFORM (run on macOS or Linux)"; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ok()  { echo "✅ $*"; }
err() { echo "❌ $*" >&2; }

# ── Prerequisite checks ─────────────────────────────────────────────────────
echo "=== Checking prerequisites ($PLATFORM_NAME) ==="
ERRORS=0

command -v node    >/dev/null 2>&1 && ok "node $(node -v)"      || { err "node not found — install v20+ from https://nodejs.org"; ERRORS=1; }
command -v npm     >/dev/null 2>&1 && ok "npm $(npm -v)"        || { err "npm not found"; ERRORS=1; }
command -v python3 >/dev/null 2>&1 && ok "$(python3 --version)" || { err "python3 not found"; ERRORS=1; }
command -v git     >/dev/null 2>&1 && ok "git $(git --version | head -1 | awk '{print $3}')" || { err "git not found"; ERRORS=1; }

if   command -v bazelisk >/dev/null 2>&1; then ok "bazelisk"; BAZEL=bazelisk
elif command -v bazel    >/dev/null 2>&1; then ok "bazel";    BAZEL=bazel
else err "bazelisk not found — install: https://github.com/bazelbuild/bazelisk#installation"; ERRORS=1; BAZEL=""
fi

if [[ "$PLATFORM" == "Darwin" ]]; then
  command -v clang >/dev/null 2>&1 && ok "clang (Xcode CLT)" \
    || { err "clang not found — run: xcode-select --install"; ERRORS=1; }
else
  (command -v g++ >/dev/null 2>&1 || command -v clang++ >/dev/null 2>&1) && ok "C++ compiler" \
    || { err "C++ compiler not found — run: sudo apt install build-essential"; ERRORS=1; }
fi

[[ $ERRORS -gt 0 ]] && { echo ""; echo "Fix the issues above and re-run."; exit 1; }

# ── LiteRT-LM directory ─────────────────────────────────────────────────────
LITERT_LM_DIR="${1:-${LITERT_LM_DIR:-}}"
if [[ -z "$LITERT_LM_DIR" ]]; then
  read -rp "Path to your LiteRT-LM checkout (or set LITERT_LM_DIR env var): " LITERT_LM_DIR
fi
LITERT_LM_DIR="${LITERT_LM_DIR/#\~/$HOME}"   # expand ~ if present

[[ -d "$LITERT_LM_DIR" ]] \
  || { err "Directory not found: $LITERT_LM_DIR"; exit 1; }
[[ -f "$LITERT_LM_DIR/runtime/engine/BUILD" ]] \
  || { err "Doesn't look like a LiteRT-LM checkout (missing runtime/engine/BUILD)"; exit 1; }
ok "LiteRT-LM: $LITERT_LM_DIR"

# ── npm install ─────────────────────────────────────────────────────────────
if [[ ! -d "$ROOT/node_modules" ]]; then
  echo ""; echo "→ Running npm install …"
  npm --prefix "$ROOT" install
fi

# ── Build bridge ────────────────────────────────────────────────────────────
echo ""; echo "=== Building delfin_litert_bridge ($PLATFORM_NAME) ==="
node "$ROOT/scripts/build-litert-cpp-bridge.mjs" --litert-lm-dir "$LITERT_LM_DIR"

BRIDGE_BIN="$ROOT/bin/delfin_litert_bridge"
[[ -f "$BRIDGE_BIN" ]] || { err "Binary not found after build: $BRIDGE_BIN"; exit 1; }
ok "Built: $BRIDGE_BIN"

# ── Model file ──────────────────────────────────────────────────────────────
MODEL_FILE="${LITERT_CPP_MODEL:-$ROOT/models/gemma-4-E2B-it.litertlm}"
if [[ ! -f "$MODEL_FILE" ]]; then
  echo ""; echo "⚠️  Model not found at $MODEL_FILE"
  read -rp "Download now? [Y/n] " DL
  if [[ "${DL:-y}" =~ ^[Yy] ]]; then
    npm --prefix "$ROOT" run download:models
  else
    err "Model required to run the benchmark."; exit 1
  fi
fi
ok "Model: $MODEL_FILE"

# ── Patch .env ──────────────────────────────────────────────────────────────
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] || cp "$ROOT/.env.example" "$ENV_FILE"

set_env() {
  local key="$1" val="$2"
  if grep -qE "^#?${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s|^#\?${key}=.*|${key}=${val}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}
set_env "LITERT_CPP_BIN"   "./bin/delfin_litert_bridge"
set_env "LITERT_CPP_MODEL" "./models/gemma-4-E2B-it.litertlm"
ok ".env updated (LITERT_CPP_BIN, LITERT_CPP_MODEL)"

# ── Piper TTS setup ─────────────────────────────────────────────────────────
echo ""; echo "=== Piper TTS setup (recommended for voice feedback) ==="
set_env "VOICE_ENABLED" "true"
set_env "LITERT_CPP_TTS_BACKEND" "piper"

# Check if any Piper voice is already configured
if ! grep -q "PIPER_MODEL=" "$ENV_FILE" 2>/dev/null; then
  echo "⚠️  No Piper voice configured in .env."
  read -rp "Install recommended hfc_female voice? [Y/n] " VOICE_DL
  if [[ "${VOICE_DL:-y}" =~ ^[Yy] ]]; then
    npm --prefix "$ROOT" run voice:install -- en/en_US/hfc_female/medium --use
  fi
else
  ok "Piper voice already configured in .env"
fi

# ── Start proxy ─────────────────────────────────────────────────────────────
echo ""; echo "=== Starting litert-cpp proxy (model load can take 1–2 min on first run) ==="
node "$ROOT/scripts/litert-cpp-proxy.mjs" &
PROXY_PID=$!
trap "echo ''; echo '→ Stopping proxy (PID $PROXY_PID)…'; kill $PROXY_PID 2>/dev/null || true" EXIT

SIDECAR_PORT="${SIDECAR_PORT:-8321}"
echo -n "   Waiting for bridge ready on :$SIDECAR_PORT"
ELAPSED=0
until curl -sf "http://localhost:$SIDECAR_PORT/health" >/dev/null 2>&1; do
  sleep 3; ELAPSED=$((ELAPSED + 3)); echo -n "."
  if [[ $ELAPSED -ge 150 ]]; then
    echo ""
    err "Timed out (150 s) waiting for proxy. Check LITERT_CPP_BIN and LITERT_CPP_MODEL in .env."
    exit 1
  fi
done
echo " ready (${ELAPSED}s)"
curl -s "http://localhost:$SIDECAR_PORT/health" | python3 -m json.tool 2>/dev/null || true

# ── Run benchmark ───────────────────────────────────────────────────────────
echo ""; echo "=== Benchmark: S1 (text) · S2 (vision) · S3 (multi-turn KV-cache) ==="
node "$ROOT/scripts/run-benchmark.mjs" \
  --backend litert-cpp --runs 5 --scenarios s1,s2,s3 \
  --sidecar-pid "$PROXY_PID"

echo ""
ok "Done — results saved to: $ROOT/results/"
echo "   Share the latest results/*.json with the team."
