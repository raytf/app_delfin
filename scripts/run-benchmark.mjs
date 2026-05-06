/**
 * Runs scripts/benchmark/run.py using the sidecar virtualenv Python so that
 * benchmark dependencies (httpx, psutil, etc.) are always available without
 * a separate install step.
 *
 * Usage:
 *   node scripts/run-benchmark.mjs [run.py args...]
 *   npm run benchmark:litert
 *   npm run benchmark:llamafile
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sidecarDir = join(rootDir, 'sidecar')
const venvPython = process.platform === 'win32'
  ? join(sidecarDir, '.venv', 'Scripts', 'python.exe')
  : join(sidecarDir, '.venv', 'bin', 'python')

const benchmarkScript = join(rootDir, 'scripts', 'benchmark', 'run.py')

// On native Windows without the sidecar venv, Node's spawn uses cmd.exe which
// may have a different PATH than PowerShell (user Python installs often only
// appear in PowerShell's PATH). Spawn via powershell.exe to get the same
// Python resolution the user sees in their terminal.
const useVenv = existsSync(venvPython)

if (!useVenv) {
  console.warn('[run-benchmark] Sidecar venv not found — falling back to system Python.')
  console.warn('[run-benchmark] If the benchmark fails, install deps with:')
  console.warn('[run-benchmark]   pip install httpx psutil pillow websockets')
  console.warn()
}

const extraArgs = process.argv.slice(2)
let child

if (!useVenv && process.platform === 'win32') {
  // Escape args for PowerShell and run via python directly
  const psArgs = [extraArgs.map(a => `'${a}'`).join(' ')]
  child = spawn(
    'powershell.exe',
    ['-NoProfile', '-Command', `python "${benchmarkScript}" ${psArgs}`],
    { cwd: rootDir, stdio: 'inherit' },
  )
} else {
  child = spawn(venvPython, [benchmarkScript, ...extraArgs], {
    cwd: rootDir,
    stdio: 'inherit',
  })
}

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
