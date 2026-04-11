#!/usr/bin/env bash
set -e

echo "=== Screen Copilot Setup Check ==="
echo ""

# Node.js
if command -v node &> /dev/null; then
  NODE_V=$(node -v)
  echo "✅ Node.js: $NODE_V"
else
  echo "❌ Node.js: not found (need 20+)"
fi

# Python
if command -v python3 &> /dev/null; then
  PY_V=$(python3 --version)
  echo "✅ Python: $PY_V"
else
  echo "❌ Python 3: not found (need 3.12+)"
fi

# LiteRT-LM
if python3 -c "import litert_lm" 2>/dev/null; then
  echo "✅ litert-lm: installed"
else
  echo "❌ litert-lm: not installed (run: npm run setup:sidecar)"
fi

# Sidecar venv
if [ -d "sidecar/.venv" ]; then
  echo "✅ sidecar/.venv: present"
else
  echo "⚠️  sidecar/.venv: missing (run: npm run setup:sidecar)"
fi

# node_modules
if [ -d "node_modules" ]; then
  echo "✅ node_modules: present"
else
  echo "⚠️  node_modules: missing (run: npm install)"
fi

# .env
if [ -f ".env" ]; then
  echo "✅ .env: present"
else
  echo "⚠️  .env: missing (copy from .env.example)"
fi

# Kokoro TTS model files
KOKORO_MODEL=$(grep -E '^KOKORO_MODEL_PATH=' .env 2>/dev/null | cut -d= -f2)
KOKORO_MODEL=${KOKORO_MODEL:-kokoro-v1.0.onnx}
KOKORO_VOICES=$(grep -E '^KOKORO_VOICES_PATH=' .env 2>/dev/null | cut -d= -f2)
KOKORO_VOICES=${KOKORO_VOICES:-voices-v1.0.bin}

if [ -f "sidecar/$KOKORO_MODEL" ]; then
  echo "✅ Kokoro model ($KOKORO_MODEL): present"
else
  echo "⚠️  Kokoro model ($KOKORO_MODEL): missing (run: npm run download:models)"
fi

if [ -f "sidecar/$KOKORO_VOICES" ]; then
  echo "✅ Kokoro voices ($KOKORO_VOICES): present"
else
  echo "⚠️  Kokoro voices ($KOKORO_VOICES): missing (run: npm run download:models)"
fi

# Sidecar health check
SIDECAR_PORT=${SIDECAR_PORT:-8321}
if curl -s "http://localhost:$SIDECAR_PORT/health" > /dev/null 2>&1; then
  echo "✅ Sidecar: running on port $SIDECAR_PORT"
else
  echo "⚠️  Sidecar: not running on port $SIDECAR_PORT (start with: npm run dev:full)"
fi

echo ""
echo "=== Done ==="
