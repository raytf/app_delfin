# Delfin Setup Check (PowerShell)
Write-Host "=== Delfin Setup Check ===" -ForegroundColor Cyan
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

# .env key diff vs .env.example
if ((Test-Path ".env") -and (Test-Path ".env.example")) {
  $exampleKeys = Get-Content ".env.example" |
    Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } |
    ForEach-Object { ($_ -split '=', 2)[0].Trim() } |
    Where-Object { $_ -ne '' }
  $envContent = Get-Content ".env"
  $missingKeys = $exampleKeys | Where-Object {
    $key = $_
    -not ($envContent | Where-Object { $_ -match "^${key}=" })
  }
  if ($missingKeys.Count -eq 0) {
    Write-Host "✅ .env: all keys from .env.example are present" -ForegroundColor Green
  } else {
    Write-Host "⚠️  .env is missing keys from .env.example:" -ForegroundColor Yellow
    foreach ($key in $missingKeys) {
      Write-Host "    - $key" -ForegroundColor Yellow
    }
    Write-Host "   (copy missing values from .env.example and adjust for your machine)" -ForegroundColor Yellow
  }
}

# Kokoro TTS model files
$kokoroModel = "kokoro-v1.0.onnx"
$kokoroVoices = "voices-v1.0.bin"
if (Test-Path ".env") {
  $envLines = Get-Content ".env"
  foreach ($line in $envLines) {
    if ($line -match '^KOKORO_MODEL_PATH=(.+)') { $kokoroModel = $Matches[1] }
    if ($line -match '^KOKORO_VOICES_PATH=(.+)') { $kokoroVoices = $Matches[1] }
  }
}

if (Test-Path "sidecar\$kokoroModel") {
  Write-Host "✅ Kokoro model ($kokoroModel): present" -ForegroundColor Green
} else {
  Write-Host "⚠️  Kokoro model ($kokoroModel): missing (run: npm run download:models)" -ForegroundColor Yellow
}

if (Test-Path "sidecar\$kokoroVoices") {
  Write-Host "✅ Kokoro voices ($kokoroVoices): present" -ForegroundColor Green
} else {
  Write-Host "⚠️  Kokoro voices ($kokoroVoices): missing (run: npm run download:models)" -ForegroundColor Yellow
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
