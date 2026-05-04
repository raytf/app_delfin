Set-StrictMode -Version Latest

$Script:DelfinRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

function Get-DelfinRepoRoot {
  return $Script:DelfinRepoRoot
}

function Resolve-DelfinRepoPath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  return [System.IO.Path]::GetFullPath((Join-Path $Script:DelfinRepoRoot $RelativePath))
}

function Merge-DelfinEnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][hashtable]$Values
  )

  if (-not (Test-Path $Path)) { return }
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $parts = $line -split '=', 2
    $key = $parts[0].Trim()
    if ([string]::IsNullOrWhiteSpace($key)) { continue }
    $Values[$key] = $parts[1].Trim()
  }
}

function Read-DelfinEnv {
  param([switch]$IncludeExample)

  $values = @{}
  if ($IncludeExample) {
    Merge-DelfinEnvFile -Path (Resolve-DelfinRepoPath '.env.example') -Values $values
  }
  Merge-DelfinEnvFile -Path (Resolve-DelfinRepoPath '.env') -Values $values
  return $values
}

function Set-DelfinEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $replacement = "${Key}=${Value}"
  $lines = if (Test-Path $Path) { @(Get-Content $Path) } else { @() }
  $pattern = '^(#\s*)?' + [regex]::Escape($Key) + '='
  $updated = $false

  for ($i = 0; $i -lt $lines.Count; $i += 1) {
    if ($lines[$i] -match $pattern) {
      $lines[$i] = $replacement
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines += $replacement
  }

  Set-Content -Path $Path -Value $lines
}

function Resolve-DelfinEnvPath {
  param(
    [string]$ConfiguredPath,
    [Parameter(Mandatory = $true)][string]$DefaultRelativePath
  )

  $candidate = if (-not [string]::IsNullOrWhiteSpace($ConfiguredPath)) {
    $ConfiguredPath.Trim()
  } else {
    $DefaultRelativePath
  }

  if ([System.IO.Path]::IsPathRooted($candidate)) {
    return $candidate
  }

  if ($candidate.StartsWith('./') -or $candidate.StartsWith('.\\')) {
    $candidate = $candidate.Substring(2)
  }

  return Resolve-DelfinRepoPath $candidate
}

function Get-NpmCommand {
  if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    return 'npm.cmd'
  }

  return 'npm'
}
