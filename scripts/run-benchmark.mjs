/**
 * Runs scripts/benchmark/run.py inside a dedicated, self-contained benchmark
 * virtualenv (scripts/benchmark/.venv). The venv is bootstrapped automatically
 * on first run from scripts/benchmark/requirements.txt — the benchmark harness
 * is independent of the deprecated sidecar-old/ Python environment.
 *
 * .env is loaded here so LITERT_BACKEND / MODEL_REPO are inherited by run.py
 * and recorded in the benchmark metadata (device/config tagging).
 *
 * Usage:
 *   node scripts/run-benchmark.mjs [run.py args...]
 *   npm run benchmark:litert-cpp   (primary — TypeScript sidecar + C++ bridge)
 *   npm run benchmark:litert-py    (deprecated Python sidecar comparison)
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Load .env so LITERT_BACKEND / MODEL_REPO etc. flow through to run.py.
dotenvConfig({ path: join(rootDir, '.env') })

const benchmarkDir = join(rootDir, 'scripts', 'benchmark')
const venvDir = join(benchmarkDir, '.venv')
const requirementsPath = join(benchmarkDir, 'requirements.txt')
const benchmarkScript = join(benchmarkDir, 'run.py')
const venvPython = process.platform === 'win32'
  ? join(venvDir, 'Scripts', 'python.exe')
  : join(venvDir, 'bin', 'python')

function run(command, args) {
  return spawnSync(command, args, { cwd: rootDir, stdio: 'inherit' })
}

function findBootstrapPython() {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]]
  for (const [command, prefixArgs] of candidates) {
    const probe = spawnSync(command, [...prefixArgs, '--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (probe.status === 0) return { command, prefixArgs }
  }
  return null
}

// --- Bootstrap the dedicated benchmark venv on first run --------------------
if (!existsSync(venvPython)) {
  console.log('[run-benchmark] Benchmark venv not found — bootstrapping (first run only)…')
  const bootstrap = findBootstrapPython()
  if (bootstrap === null) {
    console.error('[run-benchmark] No Python interpreter found. Install Python 3.10+ and retry.')
    process.exit(1)
  }
  let result = run(bootstrap.command, [...bootstrap.prefixArgs, '-m', 'venv', venvDir])
  if (result.status !== 0) {
    console.error('[run-benchmark] Failed to create scripts/benchmark/.venv')
    process.exit(result.status ?? 1)
  }
  result = run(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath])
  if (result.status !== 0) {
    console.error('[run-benchmark] Failed to install benchmark dependencies')
    process.exit(result.status ?? 1)
  }
  console.log('[run-benchmark] Benchmark venv ready at scripts/benchmark/.venv')
}

// --- Run the benchmark -----------------------------------------------------
const extraArgs = process.argv.slice(2)
const child = spawn(venvPython, [benchmarkScript, ...extraArgs], {
  cwd: rootDir,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal)
  })
}

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
