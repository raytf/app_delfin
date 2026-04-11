import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sidecarDir = join(rootDir, 'sidecar')

const pythonCandidates = process.platform === 'win32'
  ? [
      { command: 'py', prefixArgs: ['-3.12'] },
      { command: 'python', prefixArgs: [] },
    ]
  : [
      { command: 'python3.12', prefixArgs: [] },
      { command: 'python3', prefixArgs: [] },
      { command: 'python', prefixArgs: [] },
    ]

function run(command, args, cwd = rootDir) {
  return spawnSync(command, args, { cwd, stdio: 'inherit' })
}

function isAvailable(command, prefixArgs) {
  const result = spawnSync(command, [...prefixArgs, '--version'], { stdio: 'ignore' })
  return result.status === 0
}

function resolveBootstrapPython() {
  for (const candidate of pythonCandidates) {
    if (isAvailable(candidate.command, candidate.prefixArgs)) {
      return candidate
    }
  }

  return null
}

function resolveVenvPython() {
  const venvPython = process.platform === 'win32'
    ? join(sidecarDir, '.venv', 'Scripts', 'python.exe')
    : join(sidecarDir, '.venv', 'bin', 'python')

  return existsSync(venvPython) ? venvPython : null
}

const bootstrapPython = resolveBootstrapPython()
if (bootstrapPython === null) {
  console.error('[setup-sidecar] Could not find a suitable Python interpreter (need 3.12+).')
  process.exit(1)
}

let result = run(
  bootstrapPython.command,
  [...bootstrapPython.prefixArgs, '-m', 'venv', '.venv'],
  sidecarDir,
)
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const venvPython = resolveVenvPython()
if (venvPython === null) {
  console.error('[setup-sidecar] Virtualenv created, but its Python executable was not found.')
  process.exit(1)
}

result = run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], sidecarDir)
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

result = run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], sidecarDir)
process.exit(result.status ?? 0)
