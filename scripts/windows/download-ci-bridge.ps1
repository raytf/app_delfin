[CmdletBinding()]
param(
  [string]$RunId,
  [string]$ArtifactName = 'delfin-litert-bridge-windows-x64',
  [string]$Destination = 'bin',
  [string]$Repo
)

. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-DelfinRepoRoot
$destDir = Resolve-DelfinRepoPath $Destination
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "delfin-$ArtifactName"

function Get-GhArgs([string[]]$BaseArgs, [string]$RepoName) {
  if ([string]::IsNullOrWhiteSpace($RepoName)) { return $BaseArgs }
  return $BaseArgs + @('--repo', $RepoName)
}

Push-Location $repoRoot
try {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw @'
GitHub CLI (gh) is required for this helper.

Install it in PowerShell:
  winget install --id GitHub.cli -e

Then restart PowerShell and authenticate:
  gh auth login
'@
  }

  # headSha is recorded as bin/bridge.commit so `npm run setup:litert-cpp` can
  # detect a stale bridge when the Delfin bridge source moves.
  $headSha = $null
  if ([string]::IsNullOrWhiteSpace($RunId)) {
    $listArgs = Get-GhArgs @('run', 'list', '--workflow', 'build-litert-cpp-bridge.yml', '--status', 'success', '--limit', '1', '--json', 'databaseId,displayTitle,headBranch,headSha,updatedAt') $Repo
    $runs = @((& gh @listArgs) | ConvertFrom-Json)
    if ($runs.Count -lt 1) {
      throw 'No successful build-litert-cpp-bridge workflow runs found.'
    }
    $RunId = [string]$runs[0].databaseId
    $headSha = [string]$runs[0].headSha
    Write-Host "Using latest successful run $RunId ($($runs[0].headBranch), $($runs[0].updatedAt))" -ForegroundColor Cyan
  } else {
    $viewArgs = Get-GhArgs @('run', 'view', $RunId, '--json', 'headSha') $Repo
    try {
      $headSha = [string]((& gh @viewArgs | ConvertFrom-Json).headSha)
    } catch {
      Write-Warning "Could not resolve headSha for run ${RunId}; bridge.commit will not be recorded."
    }
  }

  Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $tempDir | Out-Null
  New-Item -ItemType Directory -Force $destDir | Out-Null

  $downloadArgs = Get-GhArgs @('run', 'download', $RunId, '-n', $ArtifactName, '-D', $tempDir) $Repo
  & gh @downloadArgs
  if ($LASTEXITCODE -ne 0) { throw "gh run download failed for run $RunId." }

  $exe = Get-ChildItem -Path $tempDir -Recurse -Filter 'delfin_litert_bridge.exe' | Select-Object -First 1
  if (-not $exe) { throw "Artifact $ArtifactName did not contain delfin_litert_bridge.exe." }
  $dll = Get-ChildItem -Path $tempDir -Recurse -Filter 'libGemmaModelConstraintProvider.dll' | Select-Object -First 1

  Copy-Item -Force $exe.FullName (Join-Path $destDir $exe.Name)
  if ($dll) {
    Copy-Item -Force $dll.FullName (Join-Path $destDir $dll.Name)
  } else {
    Write-Warning 'libGemmaModelConstraintProvider.dll was not present in the downloaded artifact.'
  }

  # Record provenance so `npm run setup:litert-cpp` can detect a stale bridge.
  try {
    $litertRef = & node --input-type=module -e "import('./scripts/setup-litert-cpp.mjs').then(m => process.stdout.write(m.LITERT_LM_REF))"
    if ($litertRef) {
      Set-Content -Path (Join-Path $destDir 'bridge.version') -Value $litertRef -Encoding ascii
    }
  } catch {
    Write-Warning 'Could not resolve LITERT_LM_REF; bridge.version not written.'
  }
  if ($headSha) {
    Set-Content -Path (Join-Path $destDir 'bridge.commit') -Value $headSha -Encoding ascii
    Write-Host "Recorded bridge.commit = $headSha" -ForegroundColor DarkGray
  }

  Write-Host "✅ Windows bridge artifact staged to $destDir" -ForegroundColor Green
  Get-ChildItem -Path $destDir -Filter 'delfin_litert_bridge*' | Select-Object Name, Length
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}
