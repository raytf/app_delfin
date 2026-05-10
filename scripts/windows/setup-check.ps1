[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-DelfinRepoRoot
$config = Read-DelfinEnv -IncludeExample
$modelFile = if ($config.ContainsKey('MODEL_FILE')) { $config['MODEL_FILE'] } else { 'gemma-4-E2B-it.litertlm' }
$kokoroModel = Resolve-DelfinEnvPath $config['KOKORO_MODEL_PATH'] './sidecar/kokoro-v1.0.onnx'
$kokoroVoices = Resolve-DelfinEnvPath $config['KOKORO_VOICES_PATH'] './sidecar/voices-v1.0.bin'
$bridgeBin = Resolve-DelfinEnvPath $config['LITERT_CPP_BIN'] './bin/delfin_litert_bridge.exe'
$bridgeDll = Resolve-DelfinRepoPath 'bin/libGemmaModelConstraintProvider.dll'
$bridgeModel = Resolve-DelfinEnvPath $config['LITERT_CPP_MODEL'] "./models/$modelFile"
$piperBin = Resolve-DelfinEnvPath $config['PIPER_BIN'] './bin/piper/venv/Scripts/piper.exe'
$piperModel = Resolve-DelfinEnvPath $config['PIPER_MODEL'] './models/piper/en_US-hfc_female-medium.onnx'
$piperConfig = Resolve-DelfinEnvPath $config['PIPER_CONFIG'] './models/piper/en_US-hfc_female-medium.onnx.json'

Push-Location $repoRoot
try {
  Write-Host "=== Delfin Setup Check ===" -ForegroundColor Cyan
  Write-Host ""

  if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "✅ Node.js: $(node -v)" -ForegroundColor Green }
  else { Write-Host "❌ Node.js: not found (need 20+)" -ForegroundColor Red }

  if (Get-Command python -ErrorAction SilentlyContinue) { Write-Host "✅ Python: $(python --version)" -ForegroundColor Green }
  else { Write-Host "❌ Python: not found (need 3.12+)" -ForegroundColor Red }

  $litert = python -c "import litert_lm; print('ok')" 2>$null
  if ($litert -eq 'ok') { Write-Host "✅ litert-lm: installed" -ForegroundColor Green }
  else { Write-Host "❌ litert-lm: not installed (run: npm run setup:sidecar)" -ForegroundColor Red }

  if (Test-Path 'sidecar\.venv') { Write-Host "✅ sidecar/.venv: present" -ForegroundColor Green }
  else { Write-Host "⚠️  sidecar/.venv: missing (run: npm run setup:sidecar)" -ForegroundColor Yellow }

  if (Test-Path 'node_modules') { Write-Host "✅ node_modules: present" -ForegroundColor Green }
  else { Write-Host "⚠️  node_modules: missing (run: npm install)" -ForegroundColor Yellow }

  if (Test-Path '.env') { Write-Host "✅ .env: present" -ForegroundColor Green }
  else { Write-Host "⚠️  .env: missing (copy from .env.example)" -ForegroundColor Yellow }

  if ((Test-Path '.env') -and (Test-Path '.env.example')) {
    $exampleKeys = Get-Content '.env.example' | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object { ($_ -split '=', 2)[0].Trim() } | Where-Object { $_ -ne '' }
    $envContent = Get-Content '.env'
    $missingKeys = $exampleKeys | Where-Object { $key = $_; -not ($envContent | Where-Object { $_ -match ('^' + [regex]::Escape($key) + '=') }) }
    if (@($missingKeys).Count -eq 0) { Write-Host "✅ .env: all keys from .env.example are present" -ForegroundColor Green }
    else {
      Write-Host "⚠️  .env is missing keys from .env.example:" -ForegroundColor Yellow
      foreach ($key in $missingKeys) { Write-Host "    - $key" -ForegroundColor Yellow }
    }
  }

  if (Test-Path $kokoroModel) { Write-Host "✅ Kokoro model: present ($kokoroModel)" -ForegroundColor Green }
  else { Write-Host "⚠️  Kokoro model: missing ($kokoroModel)" -ForegroundColor Yellow }

  if (Test-Path $kokoroVoices) { Write-Host "✅ Kokoro voices: present ($kokoroVoices)" -ForegroundColor Green }
  else { Write-Host "⚠️  Kokoro voices: missing ($kokoroVoices)" -ForegroundColor Yellow }

  if (Test-Path $bridgeBin) { Write-Host "✅ LiteRT C++ bridge: present ($bridgeBin)" -ForegroundColor Green }
  else { Write-Host "⚠️  LiteRT C++ bridge: missing ($bridgeBin)" -ForegroundColor Yellow }

  if (Test-Path $bridgeDll) { Write-Host "✅ LiteRT C++ bridge DLL: present ($bridgeDll)" -ForegroundColor Green }
  else { Write-Host "⚠️  LiteRT C++ bridge DLL: missing ($bridgeDll)" -ForegroundColor Yellow }

  if (Test-Path $bridgeModel) { Write-Host "✅ LiteRT C++ model: present ($bridgeModel)" -ForegroundColor Green }
  else { Write-Host "⚠️  LiteRT C++ model: missing ($bridgeModel)" -ForegroundColor Yellow }

  if (Test-Path $piperBin) { Write-Host "✅ Piper runtime: present ($piperBin)" -ForegroundColor Green }
  else { Write-Host "⚠️  Piper runtime: missing ($piperBin)" -ForegroundColor Yellow }

  if (Test-Path $piperModel) { Write-Host "✅ Piper voice model: present ($piperModel)" -ForegroundColor Green }
  else { Write-Host "⚠️  Piper voice model: missing ($piperModel)" -ForegroundColor Yellow }

  if (Test-Path $piperConfig) { Write-Host "✅ Piper voice config: present ($piperConfig)" -ForegroundColor Green }
  else { Write-Host "⚠️  Piper voice config: missing ($piperConfig)" -ForegroundColor Yellow }

  $port = if ($env:SIDECAR_PORT) { $env:SIDECAR_PORT } else { '8321' }
  try {
    Invoke-WebRequest -Uri "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
    Write-Host "✅ Sidecar: running on port $port" -ForegroundColor Green
  } catch {
    Write-Host "⚠️  Sidecar: not running on port $port (start with: npm run dev:full or npm run dev:sidecar)" -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "=== Done ===" -ForegroundColor Cyan
} finally {
  Pop-Location
}
