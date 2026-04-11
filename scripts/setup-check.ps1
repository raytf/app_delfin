# Screen Copilot Setup Check (PowerShell)
Write-Host "=== Screen Copilot Setup Check ===" -ForegroundColor Cyan
Write-Host ""

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeV = node -v
  Write-Host "✅ Node.js: $nodeV" -ForegroundColor Green
} else {
  Write-Host "❌ Node.js: not found (need 20+)" -ForegroundColor Red
}

# Python
if (Get-Command python -ErrorAction SilentlyContinue) {
  $pyV = python --version
  Write-Host "✅ Python: $pyV" -ForegroundColor Green
} else {
  Write-Host "❌ Python: not found (need 3.12+)" -ForegroundColor Red
}

# LiteRT-LM
$litert = python -c "import litert_lm; print('ok')" 2>$null
if ($litert -eq "ok") {
  Write-Host "✅ litert-lm: installed" -ForegroundColor Green
} else {
  Write-Host "❌ litert-lm: not installed (run: npm run setup:sidecar)" -ForegroundColor Red
}

# Sidecar venv
if (Test-Path "sidecar\.venv") {
  Write-Host "✅ sidecar/.venv: present" -ForegroundColor Green
} else {
  Write-Host "⚠️  sidecar/.venv: missing (run: npm run setup:sidecar)" -ForegroundColor Yellow
}

# node_modules
if (Test-Path "node_modules") {
  Write-Host "✅ node_modules: present" -ForegroundColor Green
} else {
  Write-Host "⚠️  node_modules: missing (run: npm install)" -ForegroundColor Yellow
}

# .env
if (Test-Path ".env") {
  Write-Host "✅ .env: present" -ForegroundColor Green
} else {
  Write-Host "⚠️  .env: missing (copy from .env.example)" -ForegroundColor Yellow
}

# Sidecar health check
$port = if ($env:SIDECAR_PORT) { $env:SIDECAR_PORT } else { "8321" }
try {
  $resp = Invoke-WebRequest -Uri "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
  Write-Host "✅ Sidecar: running on port $port" -ForegroundColor Green
} catch {
  Write-Host "⚠️  Sidecar: not running on port $port (start with: npm run dev:full)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
