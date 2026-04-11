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
  console.error('[run-sidecar] No sidecar virtualenv Python found at:', venvPython)
  console.error('[run-sidecar] Run `npm run setup:sidecar` first.')
  process.exit(1)
}

const host = process.env.SIDECAR_HOST ?? '0.0.0.0'
const port = process.env.SIDECAR_PORT ?? '8321'
const child = spawn(
  venvPython,
  ['-m', 'uvicorn', 'server:app', '--host', host, '--port', port],
  {
    cwd: sidecarDir,
    stdio: 'inherit',
  },
)

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal)
    }
  })
}

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
