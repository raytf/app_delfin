/**
 * Benchmark sweep — auto-spawns the TypeScript sidecar once per LITERT_BACKEND
 * value (CPU, GPU, …), benchmarks each config, and tears the sidecar down
 * between configs.
 *
 * Unlike `run-benchmark.mjs` (which benchmarks an already-running backend),
 * this script owns the sidecar lifecycle, so a single invocation produces a
 * full CPU-vs-GPU comparison. Every run lands in the shared
 * results/summary-<date>.csv tagged with its `litert_backend` value — pivot
 * by litert_backend × scenario to compare.
 *
 * Usage:
 *   npm run benchmark:sweep
 *   npm run benchmark:sweep -- --litert-backends CPU,GPU --runs 5 --device-label my-pc
 *
 * Note: RSS (peak memory) is not auto-tracked in sweep mode — run-benchmark.mjs
 * --sidecar-pid is for a manually-started backend. The sweep still captures
 * TTFT, throughput, and total turn time per config.
 */

import { spawn, spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenvConfig({ path: join(rootDir, '.env') })

const port = process.env.SIDECAR_PORT ?? '8321'
const healthUrl = `http://localhost:${port}/health`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- CLI -------------------------------------------------------------------
function printUsage() {
  console.log(`
benchmark-sweep — auto-sweep LITERT_BACKEND across the TypeScript sidecar.

Usage:
  npm run benchmark:sweep
  npm run benchmark:sweep -- [options]

Options:
  --litert-backends <list>  Comma-separated LITERT_BACKEND values (default: CPU,GPU)
  --runs <n>                Runs per scenario, forwarded to run.py (default: 5)
  --scenarios <ids>         Scenario IDs, forwarded (default: s1,s2,s3)
  --device-label <label>    Device label, forwarded (default: hostname)
  --model-name <name>       Model label, forwarded (optional)
  --ready-timeout <sec>     Seconds to wait for the sidecar to be ready (default: 180)
  -h, --help                Show this help
`)
}

function parseArgs(argv) {
  const opts = {
    litertBackends: ['CPU', 'GPU'],
    runs: '5',
    scenarios: 's1,s2,s3',
    deviceLabel: null,
    modelName: null,
    readyTimeout: 180,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--litert-backends':
        opts.litertBackends = (argv[++i] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        break
      case '--runs': opts.runs = argv[++i]; break
      case '--scenarios': opts.scenarios = argv[++i]; break
      case '--device-label': opts.deviceLabel = argv[++i]; break
      case '--model-name': opts.modelName = argv[++i]; break
      case '--ready-timeout': opts.readyTimeout = Number(argv[++i]); break
      case '-h':
      case '--help':
        printUsage()
        process.exit(0)
        break
      default:
        console.error(`[benchmark-sweep] Unknown option: ${arg}`)
        printUsage()
        process.exit(1)
    }
  }
  if (opts.litertBackends.length === 0) {
    console.error('[benchmark-sweep] --litert-backends must list at least one value.')
    process.exit(1)
  }
  if (!Number.isFinite(opts.readyTimeout) || opts.readyTimeout <= 0) {
    console.error('[benchmark-sweep] --ready-timeout must be a positive number.')
    process.exit(1)
  }
  return opts
}

const opts = parseArgs(process.argv.slice(2))

let currentSidecar = null
let currentBenchmark = null
let cleaningUp = false

// --- Sidecar lifecycle -----------------------------------------------------
async function fetchHealth() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

function spawnSidecar(litertBackend) {
  // `node --import tsx` runs index.ts in a single node process — no npm/tsx
  // wrapper to orphan. index.ts loads .env itself; dotenv does not override
  // our explicit LITERT_BACKEND.
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx', join('sidecar', 'src', 'index.ts')],
    {
      cwd: rootDir,
      env: { ...process.env, LITERT_BACKEND: litertBackend },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  )
  let log = ''
  const capture = (chunk) => {
    log = (log + chunk.toString()).slice(-4000)
  }
  proc.stdout.on('data', capture)
  proc.stderr.on('data', capture)
  return { proc, getLog: () => log }
}

async function waitForReady(proc, timeoutSec) {
  const deadline = Date.now() + timeoutSec * 1000
  let lastNote = 0
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(
        `sidecar exited before becoming ready (code ${proc.exitCode}, signal ${proc.signalCode})`,
      )
    }
    const health = await fetchHealth()
    if (health) {
      const engine = health.engine ?? {}
      if (engine.error) {
        throw new Error(`sidecar engine failed to start: ${engine.error}`)
      }
      if (engine.ready === true) return
    }
    const elapsed = Math.round((Date.now() - (deadline - timeoutSec * 1000)) / 1000)
    if (elapsed - lastNote >= 15) {
      lastNote = elapsed
      console.log(`[benchmark-sweep]   …loading model (${elapsed}s)`)
    }
    await sleep(1000)
  }
  throw new Error(`sidecar did not become ready within ${timeoutSec}s`)
}

async function stopSidecar(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return
  const exited = new Promise((res) => proc.once('exit', () => res()))
  if (process.platform === 'win32') {
    // taskkill /T kills the delfin_litert_bridge child too; /F forces it.
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    await exited
    return
  }
  // Unix: the detached child leads its own process group — kill the group so
  // the delfin_litert_bridge child goes with it.
  try {
    process.kill(-proc.pid, 'SIGTERM')
  } catch {
    try { proc.kill('SIGTERM') } catch { /* already gone */ }
  }
  const forceKill = setTimeout(() => {
    try {
      process.kill(-proc.pid, 'SIGKILL')
    } catch {
      try { proc.kill('SIGKILL') } catch { /* already gone */ }
    }
  }, 10_000)
  await exited
  clearTimeout(forceKill)
}

function runBenchmarkOnce(litertBackend) {
  const args = [
    join('scripts', 'run-benchmark.mjs'),
    '--backend', 'litert-cpp',
    '--runs', String(opts.runs),
    '--scenarios', opts.scenarios,
  ]
  if (opts.deviceLabel) args.push('--device-label', opts.deviceLabel)
  if (opts.modelName) args.push('--model-name', opts.modelName)

  return new Promise((res) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: { ...process.env, LITERT_BACKEND: litertBackend },
      stdio: 'inherit',
    })
    currentBenchmark = child
    child.once('exit', (code) => {
      currentBenchmark = null
      res(code ?? 1)
    })
  })
}

// --- Cleanup ---------------------------------------------------------------
async function cleanup() {
  if (cleaningUp) return
  cleaningUp = true
  if (currentBenchmark) {
    try { currentBenchmark.kill() } catch { /* ignore */ }
    currentBenchmark = null
  }
  if (currentSidecar) {
    await stopSidecar(currentSidecar.proc).catch(() => {})
    currentSidecar = null
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[benchmark-sweep] ${signal} received — stopping sidecar…`)
    cleanup().finally(() => process.exit(130))
  })
}

// --- Main ------------------------------------------------------------------
async function main() {
  console.log('='.repeat(60))
  console.log('  Delfin Benchmark Sweep')
  console.log('='.repeat(60))
  console.log(`  LITERT_BACKEND values : ${opts.litertBackends.join(', ')}`)
  console.log(`  Scenarios             : ${opts.scenarios}`)
  console.log(`  Runs per scenario     : ${opts.runs}`)
  console.log(`  Port                  : ${port}`)
  console.log('')

  // Pre-flight: the sweep must own the sidecar — nothing else on the port.
  if (await fetchHealth()) {
    console.error(`[benchmark-sweep] A backend is already responding on :${port}.`)
    console.error('[benchmark-sweep] Stop it first — the sweep manages its own sidecar so it')
    console.error('[benchmark-sweep] can control LITERT_BACKEND per config.')
    process.exit(1)
  }

  const failures = []
  for (const litertBackend of opts.litertBackends) {
    console.log('-'.repeat(60))
    console.log(`  Config: LITERT_BACKEND=${litertBackend}`)
    console.log('-'.repeat(60))

    console.log(`[benchmark-sweep] Starting sidecar (LITERT_BACKEND=${litertBackend})…`)
    currentSidecar = spawnSidecar(litertBackend)
    const sidecar = currentSidecar

    try {
      await waitForReady(sidecar.proc, opts.readyTimeout)
    } catch (err) {
      console.error(`[benchmark-sweep] ${err.message}`)
      const log = sidecar.getLog().trim()
      if (log) {
        console.error('--- sidecar log (tail) ---')
        console.error(log)
        console.error('--------------------------')
      }
      await stopSidecar(sidecar.proc)
      currentSidecar = null
      failures.push(litertBackend)
      console.log('')
      continue
    }

    console.log('[benchmark-sweep] Sidecar ready — running benchmark…\n')
    const status = await runBenchmarkOnce(litertBackend)
    if (status !== 0) {
      console.error(
        `[benchmark-sweep] benchmark exited with code ${status} for LITERT_BACKEND=${litertBackend}`,
      )
      failures.push(litertBackend)
    }

    console.log(`\n[benchmark-sweep] Stopping sidecar (LITERT_BACKEND=${litertBackend})…`)
    await stopSidecar(sidecar.proc)
    currentSidecar = null
    await sleep(1000) // let the port settle before the next config
    console.log('')
  }

  console.log('='.repeat(60))
  if (failures.length === 0) {
    console.log(`  Sweep complete — ${opts.litertBackends.length} config(s) benchmarked.`)
    console.log('  Compare results/summary-<date>.csv by litert_backend × scenario.')
    console.log('='.repeat(60))
    process.exit(0)
  }
  console.log(`  Sweep finished with failures: ${failures.join(', ')}`)
  console.log(
    `  ${opts.litertBackends.length - failures.length}/${opts.litertBackends.length} config(s) succeeded.`,
  )
  console.log('='.repeat(60))
  process.exit(1)
}

main().catch(async (err) => {
  console.error(`[benchmark-sweep] ${err.stack ?? err}`)
  await cleanup()
  process.exit(1)
})
