/**
 * One-shot setup for the LiteRT-LM C++ native backend.
 * Usage: node scripts/setup-litert-cpp.mjs [options]
 *        npm run setup:litert-cpp
 * Run with --help for all options.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { buildBridge, commandExists, rootDir } from './build-litert-cpp-bridge.mjs'
import { installVoice, listInstalledVoices, useVoice } from './piper-voice.mjs'
import { downloadFile, loadEnv } from './download-models.mjs'

export const LITERT_LM_REPO = 'https://github.com/google-ai-edge/LiteRT-LM.git'
// Pinned upstream LiteRT-LM ref. Both this script and the CI workflow at
// .github/workflows/build-litert-cpp-bridge.yml consume this constant — keep
// them in sync. Bump only after revalidating the bridge against the new ref.
export const LITERT_LM_REF = process.env.LITERT_LM_REF ?? 'v0.10.2'
const DEFAULT_PIPER_VOICE = 'en/en_US/hfc_female/medium'
const HF_BASE = 'https://huggingface.co'

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

// ─── CLI args ─────────────────────────────────────────────────────────────────

export function usage() {
  return `Usage: node scripts/setup-litert-cpp.mjs [options]
       npm run setup:litert-cpp

Default developer environment is Linux / macOS (arm64) / WSL2. On a Windows
host without --native-windows, this script prints WSL2 setup instructions
and exits — the actual build runs inside WSL2.

Options:
  --litert-lm-dir <path>   LiteRT-LM checkout path
                           (default: <parent folder of project>/LiteRT-LM)
  --native-windows         Build natively on Windows using Bazel + MSVC
                           (Developer PowerShell for VS 2022 required).
                           Only valid on Windows.
  --install-prereqs        Auto-install Bazelisk via winget (Win) or brew (Mac)
  --skip-clone             Use existing checkout; skip git clone
  --skip-build             Skip Bazel build (env / Piper / model steps still run)
  --no-piper               Skip Piper voice setup
  --piper-voice <hf-path>  Piper voice to install (default: ${DEFAULT_PIPER_VOICE})
  --no-model               Skip .litertlm model copy/download
  --dry-run, --plan        Print planned actions without executing them
  --help, -h               Show this message`
}

export function parseArgs(argv) {
  const opts = {
    litertLmDir: undefined, installPrereqs: false, skipClone: false, skipBuild: false,
    noPiper: false, piperVoice: DEFAULT_PIPER_VOICE, noModel: false, dryRun: false,
    nativeWindows: false, help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--litert-lm-dir')         { opts.litertLmDir = argv[++i]; continue }
    if (a === '--native-windows')        { opts.nativeWindows = true; continue }
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
Native Windows local builds remain available via --native-windows.

  1. wsl --install -d Ubuntu
  2. Inside WSL2 (Ubuntu):
       sudo apt update && sudo apt install -y git git-lfs build-essential \\
         clang python3 python3-pip default-jdk
       mkdir -p ~/.local/bin
       curl -L -o ~/.local/bin/bazelisk \\
         https://github.com/bazelbuild/bazelisk/releases/latest/download/bazelisk-linux-amd64
       chmod +x ~/.local/bin/bazelisk
       export PATH="$HOME/.local/bin:$PATH"
       # Clone Delfin under your WSL2 home (NOT under /mnt/c — Bazel is
       # unusably slow on the cross-filesystem boundary).
       cd ~ && git clone <delfin repo> app_delfin
       cd ~/app_delfin && npm install && npm run setup:litert-cpp
  3. In a second terminal on the Windows host:
       cd C:\\path\\to\\app_delfin && npm install && npm run dev
       # Electron connects to ws://localhost:8321 forwarded by WSL2.

To build a fully native Windows .exe locally instead, rerun this script
with --native-windows from a Developer PowerShell for VS 2022:

  npm run setup:litert-cpp -- --native-windows
`)
}

function stepPlatformCheck(opts) {
  if (opts.nativeWindows && process.platform !== 'win32') {
    console.error('[setup-litert-cpp] ❌ --native-windows is only valid on Windows.')
    process.exit(1)
  }
  if (process.platform === 'win32' && !opts.nativeWindows) {
    printWsl2Instructions()
    process.exit(0)
  }
  if (process.platform === 'win32' && opts.nativeWindows) {
    console.log('[setup-litert-cpp] --native-windows: running native Windows Bazel + MSVC flow.')
  }
}

async function stepPrereqs(opts) {
  if (!commandExists('git')) {
    console.error('[setup-litert-cpp] ❌ git is not on PATH. Install from https://git-scm.com and retry.')
    process.exit(1)
  }
  const hasBazel = commandExists('bazelisk') || commandExists('bazel')
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
      console.error(`[setup-litert-cpp] ❌ Bazelisk/Bazel not on PATH.\n  Install: ${hint}\n  Or pass --install-prereqs.`)
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
  // On Windows, also copy the constraint-provider DLL next to the exe.
  if (process.platform === 'win32') {
    const dllName = 'libGemmaModelConstraintProvider.dll'
    const srcDll = join(litertLmDir, 'bazel-bin', 'runtime', 'engine', dllName)
    const destDll = join(plan.outputDir, dllName)
    if (existsSync(srcDll)) {
      if (!existsSync(destDll)) {
        mkdirSync(plan.outputDir, { recursive: true })
        copyFileSync(srcDll, destDll)
        console.log('[setup-litert-cpp] ✅ DLL copied to:', destDll)
      } else {
        console.log('[setup-litert-cpp] ✅ DLL already in bin/ — skipping copy.')
      }
    } else {
      console.warn(`[setup-litert-cpp] ⚠️  DLL not found at expected path: ${srcDll}`)
    }
  }
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
  if (opts.noPiper) { console.log('[setup-litert-cpp] --no-piper: skipping voice setup.'); return }
  if (opts.dryRun) {
    console.log(`[setup-litert-cpp] [dry-run] Would install/use Piper voice: ${opts.piperVoice}`)
    return
  }
  const voices = await listInstalledVoices()
  if (voices.length > 0) {
    const target = voices.find((v) => v.ready) ?? voices[0]
    await useVoice(target.name, { envPath })
    console.log(`[setup-litert-cpp] ✅ Piper voice activated: ${target.name}`)
  } else {
    console.log(`[setup-litert-cpp] Downloading Piper voice: ${opts.piperVoice}`)
    const result = await installVoice(opts.piperVoice, { use: true, envPath })
    console.log(`[setup-litert-cpp] ✅ Piper voice ready: ${result.name} (${result.sampleRate}Hz)`)
  }
}

async function stepModel(opts, env) {
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
  const url = `${HF_BASE}/${modelRepo}/resolve/main/${modelFile}`
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
    console.warn(`[setup-litert-cpp] ⚠️  Model download failed: ${err.message}`)
    console.warn('  Copy the file manually to: ' + destPath)
    console.warn('  Or run: npm run download:models')
  }
}

function printSummary(litertLmDir, opts) {
  const exe = process.platform === 'win32' ? 'delfin_litert_bridge.exe' : 'delfin_litert_bridge'
  const binPath = join(rootDir, 'bin', exe)
  const dllPath = join(rootDir, 'bin', 'libGemmaModelConstraintProvider.dll')
  const envPath = join(rootDir, '.env')

  console.log('\n' + '═'.repeat(60))
  console.log('  Delfin — LiteRT-LM C++ setup complete')
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
  await stepPrereqs(opts)

  const litertLmDir = resolveLitertLmDir(opts)
  console.log(`[setup-litert-cpp] LiteRT-LM target: ${litertLmDir}`)
  await stepClone(litertLmDir, opts)
  await stepBuild(litertLmDir, opts)

  const envPath = join(rootDir, '.env')
  const env = loadEnv()
  stepInitEnv(envPath)
  stepUpsertEnv(envPath, opts, env)
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
