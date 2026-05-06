/**
 * One-shot setup for the LiteRT-LM C++ native backend.
 * Usage: node scripts/setup-litert-cpp.mjs [options]
 *        npm run setup:litert-cpp
 * Run with --help for all options.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, chmodSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { buildBridge, commandExists, rootDir } from './build-litert-cpp-bridge.mjs'
import { ensurePiperRuntime, installVoice, listInstalledVoices, useVoice } from './piper-voice.mjs'
import { downloadFile, loadEnv } from './download-models.mjs'

export const LITERT_LM_REPO = 'https://github.com/google-ai-edge/LiteRT-LM.git'
// Pinned upstream LiteRT-LM ref. Both this script and the CI workflow at
// .github/workflows/build-litert-cpp-bridge.yml consume this constant — keep
// them in sync. Bump only after revalidating the bridge against the new ref.
export const LITERT_LM_REF = process.env.LITERT_LM_REF ?? 'v0.10.2'
// Pinned HuggingFace model revision that matches LITERT_LM_REF above.
// Must be bumped together with LITERT_LM_REF whenever the bridge is updated.
// Use the exact commit SHA from huggingface.co/<repo>/commits/main.
export const MODEL_REVISION = process.env.MODEL_REVISION ?? '84b6978eff6e4eea02825bc2ee4ea48579f13109'
const DEFAULT_PIPER_VOICE = 'en/en_US/hfc_female/medium'
const HF_BASE = 'https://huggingface.co'
const BRIDGE_WORKFLOW_NAME = 'build-litert-cpp-bridge.yml'
const BRIDGE_SOURCES = new Set(['auto', 'release', 'artifact', 'build', 'existing'])

// ─── helpers ─────────────────────────────────────────────────────────────────

function upsertEnvValue(text, key, value) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.length ? text.split(/\r?\n/) : []
  const replacement = `${key}=${value}`
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`))
  if (idx >= 0) lines[idx] = replacement
  else lines.push(replacement)
  return lines.join(newline).replace(new RegExp(`${newline}+$`), '') + newline
}

function upsertEnvValues(envPath, kvPairs) {
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  let next = existing
  for (const [key, value] of kvPairs) next = upsertEnvValue(next, key, value)
  writeFileSync(envPath, next, 'utf8')
}

function runCommand(command, args, cwd) {
  return new Promise((res, rej) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('error', rej)
    child.on('exit', (code) => {
      if (code === 0) res()
      else rej(new Error(`${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}

function runCommandCapture(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result.stdout.trim()
}

export function bridgePlatformLabel(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'windows-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  return null
}

export function defaultBridgeArtifactName(platform = process.platform, arch = process.arch) {
  const label = bridgePlatformLabel(platform, arch)
  return label ? `delfin-litert-bridge-${label}` : null
}

function bridgeExecutableName(platform = process.platform) {
  return platform === 'win32' ? 'delfin_litert_bridge.exe' : 'delfin_litert_bridge'
}

function bridgeRequiredFiles(platform = process.platform) {
  const files = [bridgeExecutableName(platform)]
  if (platform === 'win32') files.push('libGemmaModelConstraintProvider.dll')
  else if (platform === 'darwin') files.push('libGemmaModelConstraintProvider.dylib')
  else if (platform === 'linux') files.push('libGemmaModelConstraintProvider.so')
  return files
}

function bridgeFilesPresent(platform = process.platform) {
  return bridgeRequiredFiles(platform).every((file) => existsSync(join(rootDir, 'bin', file)))
}

function parseGitHubRepoFromRemote(remote) {
  const trimmed = remote.trim().replace(/\.git$/, '')
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/)
  if (httpsMatch) return httpsMatch[1]
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+)$/)
  if (sshMatch) return sshMatch[1]
  return null
}

function resolveGitHubRepo(opts, env = process.env) {
  if (opts.repo) return opts.repo
  if (env.LITERT_CPP_BRIDGE_REPO) return env.LITERT_CPP_BRIDGE_REPO
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY

  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0 || !result.stdout) return null
  return parseGitHubRepoFromRemote(result.stdout)
}

export function resolveBridgePlan(opts, platform = process.platform, filesPresent = bridgeFilesPresent(platform), arch = process.arch) {
  if (opts.skipBuild) return { source: 'skip', needsLiteRtLm: false }
  if (opts.bridgeSource === 'existing') return { source: 'existing', needsLiteRtLm: false }
  if (opts.sourceBuild || opts.bridgeSource === 'build') return { source: 'build', needsLiteRtLm: true }
  if (opts.bridgeSource === 'release') return { source: 'release', needsLiteRtLm: false }
  if (opts.bridgeSource === 'artifact') return { source: 'artifact', needsLiteRtLm: false }
  if (filesPresent) return { source: 'existing', needsLiteRtLm: false }
  if (!defaultBridgeArtifactName(platform, arch)) return { source: 'unsupported', needsLiteRtLm: false }
  return { source: 'artifact', needsLiteRtLm: false }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'delfin-setup-litert-cpp',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} — ${url}`)
  return response.json()
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

export function usage() {
  return `Usage: node scripts/setup-litert-cpp.mjs [options]
       npm run setup:litert-cpp

Default setup reuses existing bin/ files or downloads the CI-built bridge
artifact for this platform (windows-x64, macos-arm64, linux-x64), then prepares
the model, Piper runtime/voice, and .env. Source builds are for backend
developers and require --source-build or --bridge-source build.

Options:
  --litert-lm-dir <path>   LiteRT-LM checkout path
                           (default: <parent folder of project>/LiteRT-LM)
  --native-windows         Force the native Windows flow. This is now the
                           default when running on a Windows host.
                           Only valid on Windows.
  --wsl2-instructions      Print the older WSL2 setup instructions and exit
  --bridge-source <mode>   Bridge provisioning mode: auto, release, artifact,
                           build, existing (default: auto)
  --source-build           Backend-developer path: clone/use LiteRT-LM and
                           build delfin_litert_bridge from source.
  --repo <owner/repo>      GitHub repo for Release/workflow artifact downloads
  --ci-run-id <id>         Specific GitHub Actions run for --bridge-source artifact
  --artifact-name <name>   Workflow artifact name
                           (default: delfin-litert-bridge-<platform>)
  --install-prereqs        Auto-install Bazelisk via winget (Win) or brew (Mac)
  --skip-clone             Use existing checkout; skip git clone
  --skip-build             Skip Bazel build (env / Piper / model steps still run)
  --no-piper               Skip Piper runtime + voice setup
  --piper-voice <hf-path>  Piper voice to install (default: ${DEFAULT_PIPER_VOICE})
  --no-model               Skip .litertlm model copy/download
  --dry-run, --plan        Print planned actions without executing them
  --help, -h               Show this message`
}

export function parseArgs(argv) {
  const opts = {
    litertLmDir: undefined, installPrereqs: false, skipClone: false, skipBuild: false,
    noPiper: false, piperVoice: DEFAULT_PIPER_VOICE, noModel: false, dryRun: false,
    nativeWindows: false, wsl2Instructions: false, bridgeSource: 'auto', repo: undefined,
    ciRunId: undefined, artifactName: undefined, sourceBuild: false, help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--litert-lm-dir')         { opts.litertLmDir = argv[++i]; continue }
    if (a === '--native-windows')        { opts.nativeWindows = true; continue }
    if (a === '--wsl2-instructions')     { opts.wsl2Instructions = true; continue }
    if (a === '--source-build')          { opts.sourceBuild = true; continue }
    if (a === '--bridge-source') {
      const value = argv[++i]
      if (!BRIDGE_SOURCES.has(value)) throw new Error(`Invalid --bridge-source: ${value}`)
      opts.bridgeSource = value
      continue
    }
    if (a === '--repo')                  { opts.repo = argv[++i]; continue }
    if (a === '--ci-run-id')             { opts.ciRunId = argv[++i]; continue }
    if (a === '--artifact-name')         { opts.artifactName = argv[++i]; continue }
    if (a === '--install-prereqs')       { opts.installPrereqs = true; continue }
    if (a === '--skip-clone')            { opts.skipClone = true; continue }
    if (a === '--skip-build')            { opts.skipBuild = true; continue }
    if (a === '--no-piper')              { opts.noPiper = true; continue }
    if (a === '--piper-voice')           { opts.piperVoice = argv[++i]; continue }
    if (a === '--no-model')              { opts.noModel = true; continue }
    if (a === '--dry-run' || a === '--plan') { opts.dryRun = true; continue }
    if (a === '--help' || a === '-h')    { opts.help = true; continue }
    if (!a.startsWith('--') && !opts.litertLmDir) { opts.litertLmDir = a; continue }
    throw new Error(`Unknown argument: ${a}`)
  }
  return opts
}

// ─── steps ───────────────────────────────────────────────────────────────────

function printWsl2Instructions() {
  console.log(`
Recommended developer environment on Windows is WSL2 (Ubuntu).
Default LiteRT C++ setup in WSL2 consumes the linux-x64 CI bridge artifact;
backend developers can force a local source build with --source-build.

  1. wsl --install -d Ubuntu
  2. Inside WSL2 (Ubuntu):
       sudo apt update && sudo apt install -y git curl python3 python3-pip python3-venv
       # Install GitHub CLI from https://github.com/cli/cli/blob/trunk/docs/install_linux.md
       gh auth login
       # Clone Delfin under your WSL2 home (NOT under /mnt/c — Bazel is
       # unusably slow on the cross-filesystem boundary).
       cd ~ && git clone <delfin repo> app_delfin
       cd ~/app_delfin && npm install && npm run setup:litert-cpp
  3. In a second terminal on the Windows host:
       cd C:\\path\\to\\app_delfin && npm install && npm run dev
       # Electron connects to ws://localhost:8321 forwarded by WSL2.

To build a fully native Windows .exe locally instead, rerun this script
with --source-build from a Developer PowerShell for VS 2022:

  npm run setup:litert-cpp -- --source-build
`)
}

function stepPlatformCheck(opts) {
  if (opts.nativeWindows && process.platform !== 'win32') {
    console.error('[setup-litert-cpp] ❌ --native-windows is only valid on Windows.')
    process.exit(1)
  }
  if (opts.wsl2Instructions) {
    printWsl2Instructions()
    process.exit(0)
  }
  if (process.platform === 'win32') {
    if (!opts.nativeWindows) {
      opts.nativeWindows = true
      console.log('[setup-litert-cpp] Windows host detected: using native one-shot setup by default.')
    } else {
      console.log('[setup-litert-cpp] --native-windows: using native Windows setup flow.')
    }
  }
}

async function stepPrereqs(opts, bridgePlan) {
  console.log('[setup-litert-cpp] Step 2/7 — Checking setup prerequisites.')
  const needsGit = bridgePlan.needsLiteRtLm || opts.bridgeSource === 'release'
  const needsBazel = bridgePlan.source === 'build'
  const needsGh = bridgePlan.source === 'artifact'

  if (opts.dryRun) {
    const checks = ['git as needed for repo inference']
    if (needsGh) checks.push('GitHub CLI (gh)')
    if (needsBazel) checks.push('Bazelisk/Bazel')
    console.log(`[setup-litert-cpp] [dry-run] Would check ${checks.join(', ')}.`)
    return
  }

  if (needsGh && !commandExists('gh')) {
    console.error('[setup-litert-cpp] ❌ GitHub CLI (gh) is required to download the default CI bridge artifact.')
    console.error('  Install: https://cli.github.com/ or use your package manager, then run: gh auth login')
    console.error('  Backend developers can build from source with: npm run setup:litert-cpp -- --source-build')
    process.exit(1)
  }

  if (needsGit && !commandExists('git')) {
    console.error('[setup-litert-cpp] ❌ git is not on PATH. Install from https://git-scm.com and retry.')
    process.exit(1)
  }
  const hasBazel = commandExists('bazelisk') || commandExists('bazel')
  if (!needsBazel) {
    console.log(`[setup-litert-cpp] ✅ Prerequisites: ${needsGh ? 'gh ✓; ' : ''}Bazel is not required for the selected bridge strategy.`)
    return
  }
  if (!hasBazel) {
    if (opts.installPrereqs) {
      if (opts.dryRun) { console.log('[setup-litert-cpp] [dry-run] Would install Bazelisk.'); return }
      console.log('[setup-litert-cpp] Installing Bazelisk…')
      if (process.platform === 'win32') {
        await runCommand('winget', [
          'install', '--id', 'Bazel.Bazelisk', '-e',
          '--accept-package-agreements', '--accept-source-agreements',
        ], rootDir)
      } else if (process.platform === 'darwin') {
        await runCommand('brew', ['install', 'bazelisk'], rootDir)
      } else {
        console.error('[setup-litert-cpp] ❌ --install-prereqs not supported on Linux.')
        console.error('  Download Bazelisk: https://github.com/bazelbuild/bazelisk/releases')
        process.exit(1)
      }
      console.log('[setup-litert-cpp] ✅ Bazelisk installed.')
    } else {
      const hint = process.platform === 'win32'
        ? 'winget install --id Bazel.Bazelisk -e'
        : process.platform === 'darwin' ? 'brew install bazelisk'
        : 'https://github.com/bazelbuild/bazelisk/releases'
      console.error(`[setup-litert-cpp] ❌ Bazelisk/Bazel not on PATH.\n  Install: ${hint}\n  Or omit --source-build to use the default CI artifact setup.`)
      process.exit(1)
    }
  } else {
    console.log('[setup-litert-cpp] ✅ Prerequisites: git ✓  bazel/bazelisk ✓')
  }
}

function resolveLitertLmDir(opts) {
  if (opts.litertLmDir) return resolve(opts.litertLmDir)
  if (process.env.LITERT_LM_DIR) return resolve(process.env.LITERT_LM_DIR)
  return join(dirname(rootDir), 'LiteRT-LM')
}

async function stepClone(litertLmDir, opts) {
  if (existsSync(litertLmDir)) {
    console.log(`[setup-litert-cpp] ✅ LiteRT-LM found — skipping clone:\n   ${litertLmDir}`)
    return
  }
  if (opts.skipClone) {
    console.error(`[setup-litert-cpp] ❌ --skip-clone given but checkout not found: ${litertLmDir}`)
    process.exit(1)
  }
  if (opts.dryRun) {
    console.log(`[setup-litert-cpp] [dry-run] Would clone ${LITERT_LM_REPO} @ ${LITERT_LM_REF} → ${litertLmDir}`)
    return
  }
  console.log(`[setup-litert-cpp] Cloning LiteRT-LM @ ${LITERT_LM_REF} → ${litertLmDir}`)
  await runCommand('git', ['clone', '--branch', LITERT_LM_REF, '--depth', '1', LITERT_LM_REPO, litertLmDir], rootDir)
  console.log('[setup-litert-cpp] ✅ Clone complete.')
}

async function stepBuild(litertLmDir, opts) {
  if (opts.skipBuild) { console.log('[setup-litert-cpp] --skip-build: skipping Bazel build.'); return }
  if (opts.dryRun) {
    console.log(`[setup-litert-cpp] [dry-run] Would run buildBridge({ litertLmDir: '${litertLmDir}' })`)
    return
  }
  const plan = await buildBridge({ litertLmDir })
  // Copy the constraint-provider library next to the bridge binary for all platforms.
  // The library is distributed as a prebuilt in LiteRT-LM, not built by Bazel.
  const libName =
    process.platform === 'win32' ? 'libGemmaModelConstraintProvider.dll' :
    process.platform === 'darwin' ? 'libGemmaModelConstraintProvider.dylib' :
    'libGemmaModelConstraintProvider.so'
  const prebuiltArch =
    process.platform === 'win32' ? 'windows_x86_64' :
    process.platform === 'darwin' ? 'macos_arm64' :
    'linux_x86_64'
  const srcLib = join(litertLmDir, 'prebuilt', prebuiltArch, libName)
  const destLib = join(plan.outputDir, libName)
  if (existsSync(srcLib)) {
    if (!existsSync(destLib)) {
      mkdirSync(plan.outputDir, { recursive: true })
      copyFileSync(srcLib, destLib)
      chmodSync(destLib, 0o755)
      console.log(`[setup-litert-cpp] ✅ Library copied to: ${destLib}`)
    } else {
      console.log(`[setup-litert-cpp] ✅ Library already in bin/ — skipping copy.`)
    }
  } else {
    console.warn(`[setup-litert-cpp] ⚠️  Library not found at expected path: ${srcLib}`)
  }
}

async function downloadReleaseBridge(opts) {
  const repo = resolveGitHubRepo(opts)
  if (!repo) {
    throw new Error('Could not infer GitHub repo. Set --repo <owner/repo> or LITERT_CPP_BRIDGE_REPO.')
  }

  console.log(`[setup-litert-cpp] Looking for latest GitHub Release bridge assets in ${repo}…`)
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`)
  const assets = Array.isArray(release.assets) ? release.assets : []
  const required = bridgeRequiredFiles()
  const missing = required.filter((name) => !assets.some((asset) => asset.name === name))
  if (missing.length > 0) {
    throw new Error(`Latest release does not contain required bridge asset(s): ${missing.join(', ')}`)
  }

  mkdirSync(join(rootDir, 'bin'), { recursive: true })
  for (const file of required) {
    const asset = assets.find((item) => item.name === file)
    await downloadFile(asset.browser_download_url, join(rootDir, 'bin', file), `GitHub Release asset ${file}`, {
      headers: { Accept: 'application/octet-stream' },
    })
    if (process.platform !== 'win32' && file === bridgeExecutableName()) chmodSync(join(rootDir, 'bin', file), 0o755)
  }
  console.log('[setup-litert-cpp] ✅ Bridge staged from latest GitHub Release.')
}

function findFileRecursive(dir, fileName) {
  if (!existsSync(dir)) return null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, fileName)
      if (found) return found
    } else if (entry.isFile() && entry.name === fileName) {
      return fullPath
    }
  }
  return null
}

function latestSuccessfulBridgeRunId(repo) {
  const output = runCommandCapture('gh', [
    'run', 'list',
    '--repo', repo,
    '--workflow', BRIDGE_WORKFLOW_NAME,
    '--status', 'success',
    '--limit', '1',
    '--json', 'databaseId,displayTitle,headBranch,updatedAt',
  ], rootDir)
  const runs = JSON.parse(output || '[]')
  if (!Array.isArray(runs) || runs.length < 1) {
    throw new Error(`No successful ${BRIDGE_WORKFLOW_NAME} workflow runs found in ${repo}.`)
  }
  const run = runs[0]
  console.log(`[setup-litert-cpp] Using latest successful ${BRIDGE_WORKFLOW_NAME} run ${run.databaseId} (${run.headBranch}, ${run.updatedAt}).`)
  return String(run.databaseId)
}

function stageBridgeArtifact(tempDir, platform = process.platform) {
  const binDir = join(rootDir, 'bin')
  mkdirSync(binDir, { recursive: true })
  for (const file of bridgeRequiredFiles(platform)) {
    const source = findFileRecursive(tempDir, file)
    if (!source) throw new Error(`Artifact did not contain required bridge file: ${file}`)
    const destination = join(binDir, file)
    copyFileSync(source, destination)
    if (platform !== 'win32' && file === bridgeExecutableName(platform)) chmodSync(destination, 0o755)
  }
  if (!bridgeFilesPresent(platform)) {
    throw new Error('Workflow artifact download completed but required bridge files are still missing from bin/.')
  }
}

async function downloadWorkflowBridge(opts) {
  if (!commandExists('gh')) {
    throw new Error('GitHub CLI (gh) is not on PATH. Install gh, run gh auth login, or use --source-build if you are a backend developer.')
  }
  const repo = resolveGitHubRepo(opts)
  if (!repo) {
    throw new Error('Could not infer GitHub repo. Set --repo <owner/repo> or LITERT_CPP_BRIDGE_REPO.')
  }
  const artifactName = opts.artifactName ?? defaultBridgeArtifactName()
  if (!artifactName) {
    throw new Error(`No default bridge artifact is defined for ${process.platform}/${process.arch}. Use --source-build on supported backend-development machines.`)
  }
  const runId = opts.ciRunId ?? latestSuccessfulBridgeRunId(repo)
  const tempDir = join(tmpdir(), `delfin-${artifactName}-${process.pid}`)

  console.log(`[setup-litert-cpp] Downloading GitHub Actions bridge artifact: ${artifactName}`)
  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })
  try {
    await runCommand('gh', [
      'run', 'download', runId,
      '--repo', repo,
      '--name', artifactName,
      '--dir', tempDir,
    ], rootDir)
    stageBridgeArtifact(tempDir)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
  console.log(`[setup-litert-cpp] ✅ Bridge staged from GitHub Actions artifact ${artifactName}.`)
}

async function buildBridgeFromSource(litertLmDir, opts) {
  if (!commandExists('git')) {
    throw new Error('git is required for the source-build fallback but is not on PATH.')
  }
  const hasBazel = commandExists('bazelisk') || commandExists('bazel')
  if (!hasBazel) {
    throw new Error('Bazelisk/Bazel is required for --source-build. Install Bazelisk or omit --source-build to use the default CI artifact setup.')
  }
  await stepClone(litertLmDir, opts)
  await stepBuild(litertLmDir, opts)
}

async function stepBridge(litertLmDir, opts, bridgePlan) {
  console.log('[setup-litert-cpp] Step 4/7 — Provisioning LiteRT C++ bridge binary.')
  if (bridgePlan.source === 'skip') {
    console.log('[setup-litert-cpp] --skip-build: skipping bridge provisioning.')
    return
  }
  if (bridgePlan.source === 'existing') {
    if (!bridgeFilesPresent()) {
      throw new Error('Bridge source set to existing, but required files are missing from bin/.')
    }
    console.log('[setup-litert-cpp] ✅ Bridge already present in bin/ — skipping provisioning.')
    return
  }
  if (opts.dryRun) {
    console.log(`[setup-litert-cpp] [dry-run] Bridge strategy: ${bridgePlan.source}`)
    if (bridgePlan.source === 'artifact') {
      console.log(`[setup-litert-cpp] [dry-run] Would download CI artifact: ${opts.artifactName ?? defaultBridgeArtifactName()}`)
    } else if (bridgePlan.source === 'build') {
      console.log('[setup-litert-cpp] [dry-run] Would clone/use LiteRT-LM and build from source because --source-build/--bridge-source build was requested.')
    } else if (bridgePlan.source === 'unsupported') {
      console.log(`[setup-litert-cpp] [dry-run] No default CI artifact is defined for ${process.platform}/${process.arch}.`)
    }
    return
  }

  if (bridgePlan.source === 'release') {
    await downloadReleaseBridge(opts)
    return
  }
  if (bridgePlan.source === 'artifact') {
    await downloadWorkflowBridge(opts)
    return
  }
  if (bridgePlan.source === 'build') {
    await buildBridgeFromSource(litertLmDir, opts)
    return
  }
  throw new Error(`No default CI bridge artifact is defined for ${process.platform}/${process.arch}. Backend developers can try: npm run setup:litert-cpp -- --source-build`)
}

function stepInitEnv(envPath) {
  if (existsSync(envPath)) { console.log('[setup-litert-cpp] ✅ .env exists — skipping init.'); return }
  const ex = join(rootDir, '.env.example')
  if (!existsSync(ex)) { console.warn('[setup-litert-cpp] ⚠️  .env.example not found.'); return }
  copyFileSync(ex, envPath)
  console.log('[setup-litert-cpp] ✅ Created .env from .env.example.')
}

function stepUpsertEnv(envPath, opts, env) {
  const exe = process.platform === 'win32' ? 'delfin_litert_bridge.exe' : 'delfin_litert_bridge'
  const modelFile = process.env.MODEL_FILE ?? env['MODEL_FILE'] ?? 'gemma-4-E2B-it.litertlm'
  const pairs = [
    ['LITERT_CPP_BIN', `./bin/${exe}`],
    ['LITERT_CPP_MODEL', `./models/${modelFile}`],
  ]
  if (opts.dryRun) {
    for (const [k, v] of pairs) console.log(`[setup-litert-cpp] [dry-run] Would set ${k}=${v}`)
    return
  }
  upsertEnvValues(envPath, pairs)
  console.log('[setup-litert-cpp] ✅ .env: LITERT_CPP_BIN and LITERT_CPP_MODEL written.')
}

async function stepPiper(envPath, opts) {
  console.log('[setup-litert-cpp] Step 5/7 — Setting up Piper runtime and default voice.')
  if (opts.noPiper) { console.log('[setup-litert-cpp] --no-piper: skipping Piper runtime + voice setup.'); return }
  if (opts.dryRun) {
    console.log('[setup-litert-cpp] [dry-run] Would ensure repo-local Piper runtime (piper-tts).')
    console.log(`[setup-litert-cpp] [dry-run] Would install/use Piper voice: ${opts.piperVoice}`)
    return
  }
  try {
    const runtime = await ensurePiperRuntime({ envPath })
    console.log(`[setup-litert-cpp] ✅ Piper runtime ${runtime.installed ? 'installed' : 'ready'}: ${runtime.binPath}`)
    if (runtime.repaired) {
      console.log('[setup-litert-cpp] ✅ Piper runtime dependencies repaired.')
    }

    const voices = await listInstalledVoices()
    const target = voices.find((v) => v.ready)
    if (target) {
      await useVoice(target.name, { envPath })
      console.log(`[setup-litert-cpp] ✅ Piper voice activated: ${target.name}`)
    } else {
      if (voices.length > 0) {
        console.log('[setup-litert-cpp] Existing Piper voice files are incomplete; re-downloading the default voice.')
      }
      console.log(`[setup-litert-cpp] Downloading Piper voice: ${opts.piperVoice}`)
      const result = await installVoice(opts.piperVoice, { use: true, envPath })
      console.log(`[setup-litert-cpp] ✅ Piper voice ready: ${result.name} (${result.sampleRate}Hz)`)
    }
  } catch (err) {
    console.warn(`[setup-litert-cpp] ⚠️  Piper setup skipped: ${err.message}`)
    console.warn('  LiteRT C++ turns will fall back to browser Web Speech until Piper is installed.')
    console.warn(`  Retry just this step with: npm run voice:install -- ${opts.piperVoice} --use`)
  }
}

async function stepModel(opts, env) {
  console.log('[setup-litert-cpp] Step 6/7 — Ensuring Gemma 4 LiteRT model is available.')
  if (opts.noModel) { console.log('[setup-litert-cpp] --no-model: skipping model.'); return }
  const modelFile = process.env.MODEL_FILE ?? env['MODEL_FILE'] ?? 'gemma-4-E2B-it.litertlm'
  const modelRepo = process.env.MODEL_REPO ?? env['MODEL_REPO'] ?? 'litert-community/gemma-4-E2B-it-litert-lm'
  const destDir = join(rootDir, 'models')
  const destPath = join(destDir, modelFile)

  if (existsSync(destPath)) {
    console.log(`[setup-litert-cpp] ✅ Model already present:\n   ${destPath}`)
    return
  }

  // Prefer copying from the Python sidecar directory if the file is already there.
  const sidecarPath = join(rootDir, 'sidecar', modelFile)
  if (existsSync(sidecarPath)) {
    if (opts.dryRun) {
      console.log(`[setup-litert-cpp] [dry-run] Would copy model from sidecar/ → ${destPath}`)
      return
    }
    mkdirSync(destDir, { recursive: true })
    copyFileSync(sidecarPath, destPath)
    console.log(`[setup-litert-cpp] ✅ Model copied from sidecar/:\n   ${destPath}`)
    return
  }

  // Fall back to downloading from HuggingFace.
  const modelRevision = process.env.MODEL_REVISION ?? MODEL_REVISION
  const url = `${HF_BASE}/${modelRepo}/resolve/${modelRevision}/${modelFile}`
  console.log(`[setup-litert-cpp] Model revision: ${modelRevision}`)
  if (opts.dryRun) {
    console.log(`[setup-litert-cpp] [dry-run] Would download model:\n   ${url}\n   → ${destPath}`)
    return
  }
  console.log('[setup-litert-cpp] Downloading .litertlm model (~3+ GB). This may take a while…')
  try {
    mkdirSync(destDir, { recursive: true })
    await downloadFile(url, destPath, modelFile)
    console.log(`[setup-litert-cpp] ✅ Model saved:\n   ${destPath}`)
  } catch (err) {
    throw new Error(
      `Model download failed: ${err.message}. Copy the file manually to ${destPath} or rerun setup after fixing network access.`,
    )
  }
}

function printSummary(litertLmDir, opts) {
  const exe = process.platform === 'win32' ? 'delfin_litert_bridge.exe' : 'delfin_litert_bridge'
  const binPath = join(rootDir, 'bin', exe)
  const dllPath = join(rootDir, 'bin', 'libGemmaModelConstraintProvider.dll')
  const envPath = join(rootDir, '.env')

  console.log('\n' + '═'.repeat(60))
  console.log('  Step 7/7 — Delfin LiteRT-LM C++ setup summary')
  console.log('═'.repeat(60))
  console.log(`\n  LiteRT-LM          : ${litertLmDir}`)
  console.log(`  Bridge binary      : ${binPath} ${existsSync(binPath) ? '✅' : '⚠️  (missing)'}`)
  if (process.platform === 'win32') {
    console.log(`  Bridge DLL         : ${dllPath} ${existsSync(dllPath) ? '✅' : '⚠️  (missing)'}`)
  }
  console.log(`  .env               : ${envPath} ${existsSync(envPath) ? '✅' : '⚠️  (missing)'}`)
  if (!opts.dryRun) {
    console.log('\n  Start the C++ backend:')
    console.log('    npm run dev:litert-cpp\n')
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { console.log(usage()); return }

  console.log('═'.repeat(60))
  console.log('  Delfin — LiteRT-LM C++ backend setup')
  console.log('═'.repeat(60))
  if (opts.dryRun) console.log('  *** DRY RUN — no files will be changed ***')
  console.log()

  stepPlatformCheck(opts)
  const bridgePlan = resolveBridgePlan(opts)
  console.log(`[setup-litert-cpp] Step 1/7 — Platform: ${process.platform}; bridge strategy: ${bridgePlan.source}.`)
  await stepPrereqs(opts, bridgePlan)

  const litertLmDir = resolveLitertLmDir(opts)
  console.log(`[setup-litert-cpp] LiteRT-LM target: ${litertLmDir}`)

  const envPath = join(rootDir, '.env')
  const env = loadEnv()
  console.log('[setup-litert-cpp] Step 3/7 — Initializing environment file.')
  stepInitEnv(envPath)
  stepUpsertEnv(envPath, opts, env)
  await stepBridge(litertLmDir, opts, bridgePlan)
  await stepPiper(envPath, opts)
  await stepModel(opts, env)

  printSummary(litertLmDir, opts)
}

function isDirectExecution() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  main().catch((err) => {
    console.error('\n[setup-litert-cpp] ❌ Setup failed:', err.message)
    process.exit(1)
  })
}
