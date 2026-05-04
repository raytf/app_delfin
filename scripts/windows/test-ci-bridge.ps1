[CmdletBinding()]
param(
  [switch]$DownloadArtifact,
  [string]$RunId,
  [string]$ArtifactName = 'delfin-litert-bridge-windows-x64',
  [string]$Repo,
  [int]$Port = 8321,
  [switch]$SkipModelDownload,
  [switch]$SkipBenchmark
)

. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-DelfinRepoRoot
$envPath = Resolve-DelfinRepoPath '.env'
$envExamplePath = Resolve-DelfinRepoPath '.env.example'
$logPath = Join-Path ([System.IO.Path]::GetTempPath()) 'delfin-litert-cpp-proxy.log'
$errorLogPath = Join-Path ([System.IO.Path]::GetTempPath()) 'delfin-litert-cpp-proxy.err.log'
$proxyProcess = $null

function Ensure-LitertModel([string]$ModelRepo, [string]$ModelFile, [string]$DestinationPath) {
  if (Test-Path $DestinationPath) {
    Write-Host "✅ LiteRT model already present: $DestinationPath" -ForegroundColor Green
    return
  }

  if ($SkipModelDownload) {
    throw "LiteRT model missing at $DestinationPath and -SkipModelDownload was set."
  }

  $url = "https://huggingface.co/$ModelRepo/resolve/main/$ModelFile"
  New-Item -ItemType Directory -Force (Split-Path -Parent $DestinationPath) | Out-Null
  Write-Host "Downloading LiteRT model (~3+ GB): $url" -ForegroundColor Cyan
  Invoke-WebRequest -Uri $url -OutFile $DestinationPath
  Write-Host "✅ LiteRT model saved: $DestinationPath" -ForegroundColor Green
}

Push-Location $repoRoot
try {
  if ($DownloadArtifact) {
    & (Join-Path $PSScriptRoot 'download-ci-bridge.ps1') -RunId $RunId -ArtifactName $ArtifactName -Destination 'bin' -Repo $Repo
    if ($LASTEXITCODE -ne 0) { throw 'Artifact download helper failed.' }
  }

  if (-not (Test-Path $envPath)) {
    Copy-Item $envExamplePath $envPath
    Write-Host 'Created .env from .env.example' -ForegroundColor Cyan
  }

  $config = Read-DelfinEnv -IncludeExample
  $modelRepo = if ($config.ContainsKey('MODEL_REPO')) { $config['MODEL_REPO'] } else { 'litert-community/gemma-4-E2B-it-litert-lm' }
  $modelFile = if ($config.ContainsKey('MODEL_FILE')) { $config['MODEL_FILE'] } else { 'gemma-4-E2B-it.litertlm' }
  $bridgeBinRelative = './bin/delfin_litert_bridge.exe'
  $bridgeBinPath = Resolve-DelfinRepoPath 'bin/delfin_litert_bridge.exe'
  $bridgeDllPath = Resolve-DelfinRepoPath 'bin/libGemmaModelConstraintProvider.dll'
  $modelRelative = "./models/$modelFile"
  $bridgeModelPath = Resolve-DelfinRepoPath (Join-Path 'models' $modelFile)

  if (-not (Test-Path $bridgeBinPath)) { throw "Bridge executable not found: $bridgeBinPath" }
  if (-not (Test-Path $bridgeDllPath)) { throw "Bridge DLL not found: $bridgeDllPath" }

  Ensure-LitertModel -ModelRepo $modelRepo -ModelFile $modelFile -DestinationPath $bridgeModelPath
  Set-DelfinEnvValue -Path $envPath -Key 'LITERT_CPP_BIN' -Value $bridgeBinRelative
  Set-DelfinEnvValue -Path $envPath -Key 'LITERT_CPP_MODEL' -Value $modelRelative
  Write-Host '✅ .env updated for the downloaded Windows bridge artifact' -ForegroundColor Green

  Remove-Item $logPath, $errorLogPath -Force -ErrorAction SilentlyContinue
  $proxyProcess = Start-Process -FilePath (Get-NpmCommand) -ArgumentList @('run', 'dev:litert-cpp') -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath
  Write-Host "Started LiteRT C++ proxy (PID $($proxyProcess.Id)); waiting for health on port $Port..." -ForegroundColor Cyan

  $deadline = (Get-Date).AddSeconds(150)
  $health = $null
  do {
    Start-Sleep -Seconds 3
    $proxyProcess.Refresh()
    if ($proxyProcess.HasExited) {
      throw "Proxy exited early. See $logPath and $errorLogPath"
    }
    try {
      $health = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 5 -ErrorAction Stop
    } catch {
      $health = $null
    }
  } while (-not $health -and (Get-Date) -lt $deadline)

  if (-not $health) {
    throw "Timed out waiting for /health on port $Port. See $logPath and $errorLogPath"
  }

  Write-Host '✅ Proxy health:' -ForegroundColor Green
  $health | ConvertTo-Json -Depth 5

  if (-not $SkipBenchmark) {
    & (Get-NpmCommand) 'run' 'benchmark:litert-cpp'
    if ($LASTEXITCODE -ne 0) {
      throw 'benchmark:litert-cpp failed.'
    }
  }
} finally {
  if ($proxyProcess -and -not $proxyProcess.HasExited) {
    Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped LiteRT C++ proxy (PID $($proxyProcess.Id))." -ForegroundColor Cyan
  }
  Pop-Location
}
