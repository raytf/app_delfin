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

if (!existsSync(venvPython)) {
  console.error('[run-benchmark] No sidecar virtualenv Python found at:', venvPython)
  console.error('[run-benchmark] Run `npm run setup:sidecar` first.')
  process.exit(1)
}

const benchmarkScript = join(rootDir, 'scripts', 'benchmark', 'run.py')
const child = spawn(venvPython, [benchmarkScript, ...process.argv.slice(2)], {
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
