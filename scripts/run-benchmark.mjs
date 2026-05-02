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

// Fall back to system Python on machines where the sidecar venv doesn't exist
// (e.g. native Windows without WSL2, where LiteRT-LM has no wheel).
// Use `py` (Windows Python Launcher) on Windows — more reliable than `python`
// when multiple Python versions are installed.
let pythonBin = venvPython
if (!existsSync(venvPython)) {
  pythonBin = process.platform === 'win32' ? 'py' : 'python3'
  console.warn('[run-benchmark] Sidecar venv not found — falling back to system Python.')
  console.warn('[run-benchmark] If the benchmark fails, install deps with:')
  console.warn('[run-benchmark]   pip install httpx psutil pillow websockets')
  console.warn()
}

const benchmarkScript = join(rootDir, 'scripts', 'benchmark', 'run.py')
const child = spawn(pythonBin, [benchmarkScript, ...process.argv.slice(2)], {
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
