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

function Format-ByteSize([Int64]$Bytes) {
  if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
  if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
  if ($Bytes -ge 1KB) { return ('{0:N1} KB' -f ($Bytes / 1KB)) }
  return "$Bytes B"
}

function Test-CurlOption([string]$Option) {
  $help = & curl.exe --help all 2>$null
  return ($help -match [regex]::Escape($Option))
}

function Get-RemoteContentLength([string]$Url) {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    $curlArgs = @('--silent', '--location', '--head', '--fail', '--http1.1', '--retry', '3', '--retry-delay', '3', $Url)
    if (Test-CurlOption -Option '--retry-all-errors') {
      $curlArgs = @('--retry-all-errors') + $curlArgs
    }

    try {
      $headers = & $curl.Source @curlArgs 2>$null
      if ($LASTEXITCODE -eq 0) {
        $lengths = @($headers | Where-Object { $_ -match '^content-length:\s*([0-9]+)' } | ForEach-Object { [Int64]$Matches[1] })
        if ($lengths.Count -gt 0) { return $lengths[-1] }
      }
    } catch {
      return -1
    }
    return -1
  }

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = 'HEAD'
    $request.AllowAutoRedirect = $true
    $request.UserAgent = 'delfin-windows-ci-bridge-test'
    $response = $request.GetResponse()
    try {
      return [Int64]$response.ContentLength
    } finally {
      $response.Close()
    }
  } catch {
    Write-Warning "Could not determine remote model size before download: $($_.Exception.Message)"
    return -1
  }
}

function Assert-DownloadedFileSize([string]$Path, [Int64]$ExpectedBytes) {
  if (-not (Test-Path $Path)) {
    throw "Download did not create expected file: $Path"
  }

  $actualBytes = (Get-Item $Path).Length
  if ($ExpectedBytes -gt 0 -and $actualBytes -ne $ExpectedBytes) {
    throw "Downloaded $(Format-ByteSize $actualBytes), expected $(Format-ByteSize $ExpectedBytes). Leaving partial file at $Path."
  }
}

function Get-HuggingFacePython {
  $venvPython = Resolve-DelfinRepoPath 'sidecar/.venv/Scripts/python.exe'
  $candidates = @()
  if (Test-Path $venvPython) { $candidates += $venvPython }

  $systemPython = Get-Command python -ErrorAction SilentlyContinue
  if ($systemPython) { $candidates += $systemPython.Source }

  foreach ($python in $candidates) {
    & $python -c 'import huggingface_hub' 2>$null
    if ($LASTEXITCODE -eq 0) { return $python }
  }

  return $null
}

function Save-LitertModelWithHuggingFaceHub([string]$ModelRepo, [string]$ModelFile, [string]$DestinationPath, [Int64]$ExpectedBytes) {
  $python = Get-HuggingFacePython
  if (-not $python) { return $false }

  Write-Host 'Using Python huggingface_hub downloader for the LiteRT model.' -ForegroundColor Cyan
  $script = @'
import os
import shutil
import sys

from huggingface_hub import hf_hub_download

repo_id, filename, destination = sys.argv[1:4]
destination = os.path.abspath(destination)
dest_dir = os.path.dirname(destination)
os.makedirs(dest_dir, exist_ok=True)

path = hf_hub_download(
    repo_id=repo_id,
    filename=filename,
    local_dir=dest_dir,
    local_dir_use_symlinks=False,
    resume_download=True,
)

if os.path.abspath(path) != destination:
    shutil.copyfile(path, destination)

print(destination)
'@

  & $python -c $script $ModelRepo $ModelFile $DestinationPath
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Python huggingface_hub download failed with exit code $LASTEXITCODE; falling back to Windows BITS, then curl.exe."
    return $false
  }

  Assert-DownloadedFileSize -Path $DestinationPath -ExpectedBytes $ExpectedBytes
  return $true
}

function Save-RemoteFileWithBits([string]$Url, [string]$PartialPath, [Int64]$ExpectedBytes) {
  if (-not (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue)) { return $false }

  Write-Host 'Using Windows BITS downloader before falling back to curl.exe.' -ForegroundColor Cyan
  Remove-Item $PartialPath -Force -ErrorAction SilentlyContinue

  $job = $null
  $deadline = (Get-Date).AddHours(4)
  try {
    $job = Start-BitsTransfer -Source $Url -Destination $PartialPath -DisplayName 'Delfin LiteRT model download' -Asynchronous -ErrorAction Stop

    do {
      Start-Sleep -Seconds 5
      $job = Get-BitsTransfer -JobId $job.JobId -ErrorAction Stop

      $totalBytes = if ($job.BytesTotal -gt 0) { [Int64]$job.BytesTotal } else { $ExpectedBytes }
      if ($totalBytes -gt 0) {
        $percent = [Math]::Min(100, [Math]::Round(($job.BytesTransferred / $totalBytes) * 100, 1))
        Write-Host "  BITS $percent% ($(Format-ByteSize $job.BytesTransferred) / $(Format-ByteSize $totalBytes))" -ForegroundColor DarkCyan
      } else {
        Write-Host "  BITS downloaded $(Format-ByteSize $job.BytesTransferred)" -ForegroundColor DarkCyan
      }

      if ($job.JobState -eq 'Transferred') {
        Complete-BitsTransfer -BitsJob $job -ErrorAction Stop
        Assert-DownloadedFileSize -Path $PartialPath -ExpectedBytes $totalBytes
        return $true
      }

      if ($job.JobState -eq 'TransientError') {
        Write-Warning "BITS transient error: $($job.ErrorDescription). Retrying..."
        Resume-BitsTransfer -BitsJob $job -Asynchronous -ErrorAction SilentlyContinue | Out-Null
      }

      if ($job.JobState -in @('Error', 'Cancelled')) {
        throw "BITS failed with state $($job.JobState): $($job.ErrorDescription)"
      }
    } while ((Get-Date) -lt $deadline)

    throw 'BITS timed out after 4 hours.'
  } catch {
    Write-Warning "BITS download failed: $($_.Exception.Message). Falling back to curl.exe."
    if ($job) { Remove-BitsTransfer -BitsJob $job -Confirm:$false -ErrorAction SilentlyContinue }
    return $false
  }
}

function Save-RemoteFileWithCurl([string]$Url, [string]$PartialPath, [Int64]$ExpectedBytes) {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) { return $false }

  Write-Host 'Using curl.exe for resilient download progress + retry/resume.' -ForegroundColor Cyan
  $curlArgsBase = @(
    '--location',
    '--fail',
    '--http1.1',
    '--retry', '3',
    '--retry-delay', '3',
    '--connect-timeout', '30',
    '--continue-at', '-',
    '--progress-bar',
    '--output', $PartialPath,
    $Url
  )

  if (Test-CurlOption -Option '--retry-all-errors') {
    $curlArgsBase = @('--retry-all-errors') + $curlArgsBase
  }

  $maxAttempts = 12
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $partialLabel = if (Test-Path $PartialPath) { Format-ByteSize ((Get-Item $PartialPath).Length) } else { '0 B' }
    Write-Host "curl attempt $attempt/$maxAttempts (currently downloaded: $partialLabel)" -ForegroundColor DarkCyan

    & $curl.Source @curlArgsBase
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      Assert-DownloadedFileSize -Path $PartialPath -ExpectedBytes $ExpectedBytes
      return $true
    }

    if ($attempt -lt $maxAttempts) {
      Write-Warning "curl.exe failed with exit code $exitCode; keeping partial file and retrying in 5 seconds."
      Start-Sleep -Seconds 5
      continue
    }

    throw "curl.exe failed with exit code $exitCode after $maxAttempts attempts. Partial file, if any, is at $PartialPath."
  }

  return $false
}

function Save-RemoteFileWithDotNet([string]$Url, [string]$PartialPath, [Int64]$ExpectedBytes) {
  Write-Host 'curl.exe not found; falling back to .NET streaming download.' -ForegroundColor Yellow

  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $request = [System.Net.HttpWebRequest]::Create($Url)
  $request.Method = 'GET'
  $request.AllowAutoRedirect = $true
  $request.UserAgent = 'delfin-windows-ci-bridge-test'
  $response = $request.GetResponse()

  $inputStream = $null
  $outputStream = $null
  try {
    $totalBytes = if ($response.ContentLength -gt 0) { [Int64]$response.ContentLength } else { $ExpectedBytes }
    $inputStream = $response.GetResponseStream()
    $outputStream = [System.IO.File]::Open($PartialPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $buffer = New-Object byte[] (1024 * 1024)
    $downloaded = [Int64]0
    $startedAt = Get-Date
    $lastReportAt = $startedAt.AddSeconds(-10)

    while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $outputStream.Write($buffer, 0, $read)
      $downloaded += $read

      $now = Get-Date
      if (($now - $lastReportAt).TotalSeconds -ge 5) {
        $elapsedSeconds = [Math]::Max(1, ($now - $startedAt).TotalSeconds)
        $speed = [Int64]($downloaded / $elapsedSeconds)
        if ($totalBytes -gt 0) {
          $percent = [Math]::Min(100, [Math]::Round(($downloaded / $totalBytes) * 100, 1))
          Write-Progress -Activity 'Downloading LiteRT model' -Status "$(Format-ByteSize $downloaded) / $(Format-ByteSize $totalBytes) at $(Format-ByteSize $speed)/s" -PercentComplete $percent
          Write-Host "  $percent% ($(Format-ByteSize $downloaded) / $(Format-ByteSize $totalBytes), $(Format-ByteSize $speed)/s)" -ForegroundColor DarkCyan
        } else {
          Write-Progress -Activity 'Downloading LiteRT model' -Status "$(Format-ByteSize $downloaded) at $(Format-ByteSize $speed)/s"
          Write-Host "  $(Format-ByteSize $downloaded) downloaded ($(Format-ByteSize $speed)/s)" -ForegroundColor DarkCyan
        }
        $lastReportAt = $now
      }
    }

    Write-Progress -Activity 'Downloading LiteRT model' -Completed
    $outputStream.Close()
    $outputStream = $null

    Assert-DownloadedFileSize -Path $PartialPath -ExpectedBytes $totalBytes
  } finally {
    if ($outputStream) { $outputStream.Close() }
    if ($inputStream) { $inputStream.Close() }
    $response.Close()
  }
}

function Save-RemoteFileWithProgress([string]$Url, [string]$DestinationPath, [Int64]$ExpectedBytes) {
  $partialPath = "$DestinationPath.part"

  if (Test-Path $partialPath) {
    $partialBytes = (Get-Item $partialPath).Length
    if ($ExpectedBytes -gt 0 -and $partialBytes -eq $ExpectedBytes) {
      Write-Host "Using complete existing partial download: $partialPath" -ForegroundColor Cyan
      Move-Item -Force $partialPath $DestinationPath
      return
    }

    if ($ExpectedBytes -gt 0 -and $partialBytes -gt $ExpectedBytes) {
      Write-Warning "Removing oversized partial download: $partialPath ($(Format-ByteSize $partialBytes), expected $(Format-ByteSize $ExpectedBytes))"
      Remove-Item $partialPath -Force
    }
  }

  $partialBytes = if (Test-Path $partialPath) { (Get-Item $partialPath).Length } else { 0 }
  if ($partialBytes -eq 0 -and (Save-RemoteFileWithBits -Url $Url -PartialPath $partialPath -ExpectedBytes $ExpectedBytes)) {
    Move-Item -Force $partialPath $DestinationPath
    return
  }

  if (-not (Save-RemoteFileWithCurl -Url $Url -PartialPath $partialPath -ExpectedBytes $ExpectedBytes)) {
    Remove-Item $partialPath -Force -ErrorAction SilentlyContinue
    Save-RemoteFileWithDotNet -Url $Url -PartialPath $partialPath -ExpectedBytes $ExpectedBytes
  }

  Move-Item -Force $partialPath $DestinationPath
}

function Ensure-LitertModel([string]$ModelRepo, [string]$ModelFile, [string]$DestinationPath) {
  $url = "https://huggingface.co/$ModelRepo/resolve/main/$ModelFile"

  if (-not (Test-Path $DestinationPath) -and $SkipModelDownload) {
    throw "LiteRT model missing at $DestinationPath and -SkipModelDownload was set."
  }

  New-Item -ItemType Directory -Force (Split-Path -Parent $DestinationPath) | Out-Null

  if (Save-LitertModelWithHuggingFaceHub -ModelRepo $ModelRepo -ModelFile $ModelFile -DestinationPath $DestinationPath -ExpectedBytes -1) {
    Write-Host "✅ LiteRT model ready via Python huggingface_hub: $DestinationPath ($(Format-ByteSize ((Get-Item $DestinationPath).Length)))" -ForegroundColor Green
    return
  }

  $expectedBytes = Get-RemoteContentLength -Url $url

  if (Test-Path $DestinationPath) {
    $actualBytes = (Get-Item $DestinationPath).Length
    if ($expectedBytes -le 0 -or $actualBytes -eq $expectedBytes) {
      Write-Host "✅ LiteRT model already present: $DestinationPath ($(Format-ByteSize $actualBytes))" -ForegroundColor Green
      return
    }

    Write-Warning "Existing LiteRT model size is $(Format-ByteSize $actualBytes), expected $(Format-ByteSize $expectedBytes). Re-downloading."
    Remove-Item $DestinationPath -Force
  }

  $sizeLabel = if ($expectedBytes -gt 0) { Format-ByteSize $expectedBytes } else { '~3+ GB' }
  Write-Host "Downloading LiteRT model with fallback chain ($sizeLabel): $url" -ForegroundColor Cyan
  Save-RemoteFileWithProgress -Url $url -DestinationPath $DestinationPath -ExpectedBytes $expectedBytes
  Write-Host "✅ LiteRT model saved: $DestinationPath ($(Format-ByteSize ((Get-Item $DestinationPath).Length)))" -ForegroundColor Green
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
  $proxyProcess = Start-Process -FilePath (Get-NpmCommand) -ArgumentList @('run', 'dev:backend') -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath
  Write-Host "Started LiteRT C++ backend proxy (PID $($proxyProcess.Id)); waiting for health on port $Port..." -ForegroundColor Cyan

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
