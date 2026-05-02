/**
 * Starts the llamafile server using the binary and model downloaded by setup-llamafile.mjs.
 *
 * Usage:
 *   node scripts/run-llamafile.mjs
 *   npm run dev:llamafile
 *
 * Env vars (read from .env, then .env.example, then defaults):
 *   LLAMAFILE_VERSION      — binary version to locate (default: 0.10.1)
 *   LLAMAFILE_MODEL_FILE   — GGUF model filename (default: google_gemma-4-E2B-it-IQ4_NL.gguf)
 *   LLAMAFILE_MMPROJ_FILE  — vision projector filename (default: mmproj-google_gemma-4-E2B-it-f16.gguf)
 *   LLAMAFILE_PORT         — port to listen on (default: 8080)
 *   LLAMAFILE_BIN          — absolute path override for the binary (optional)
 *   LLAMAFILE_CTX          — context size in tokens (default: 8192)
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as dotenvConfig } from 'dotenv'

import { loadEnv } from './download-models.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenvConfig({ path: join(rootDir, '.env') })

const env = loadEnv()

const version =
  process.env.LLAMAFILE_VERSION ?? env['LLAMAFILE_VERSION'] ?? '0.10.1'
const modelFile =
  process.env.LLAMAFILE_MODEL_FILE ?? env['LLAMAFILE_MODEL_FILE'] ?? 'google_gemma-4-E2B-it-IQ4_NL.gguf'
const port =
  process.env.LLAMAFILE_PORT ?? env['LLAMAFILE_PORT'] ?? '8080'
const ctx =
  process.env.LLAMAFILE_CTX ?? env['LLAMAFILE_CTX'] ?? '8192'

const llamafileDir = join(rootDir, 'llamafile')
const binName =
  process.platform === 'win32' ? `llamafile-${version}.exe` : `llamafile-${version}`
const binPath =
  process.env.LLAMAFILE_BIN ?? join(llamafileDir, 'bin', binName)
const modelPath = join(llamafileDir, 'models', modelFile)
const mmprojFile =
  process.env.LLAMAFILE_MMPROJ_FILE ?? env['LLAMAFILE_MMPROJ_FILE'] ?? 'mmproj-google_gemma-4-E2B-it-f16.gguf'
const mmprojPath = join(llamafileDir, 'models', mmprojFile)

// --- Pre-flight checks ---
if (!existsSync(binPath)) {
  console.error('[run-llamafile] ❌ Binary not found at:', binPath)
  console.error('[run-llamafile]    Run `npm run setup:llamafile` first.')
  process.exit(1)
}

if (!existsSync(modelPath)) {
  console.error('[run-llamafile] ❌ Model not found at:', modelPath)
  console.error('[run-llamafile]    Run `npm run setup:llamafile` first.')
  process.exit(1)
}

const hasMmproj = existsSync(mmprojPath)
if (!hasMmproj) {
  console.warn('[run-llamafile] ⚠️  Vision projector not found — image input will be disabled.')
  console.warn(`[run-llamafile]    Expected: ${mmprojPath}`)
  console.warn('[run-llamafile]    Run `npm run setup:llamafile` to download it.')
  console.warn()
}

// --- Launch ---
console.log(`[run-llamafile] Starting llamafile server on 127.0.0.1:${port}`)
console.log(`[run-llamafile]   Binary : ${binPath}`)
console.log(`[run-llamafile]   Model  : ${modelPath}`)
if (hasMmproj) console.log(`[run-llamafile]   Mmproj : ${mmprojPath}`)
console.log(`[run-llamafile]   Context: ${ctx} tokens`)
console.log()

const spawnArgs = [
  '--server',
  '--host', '127.0.0.1',
  '--port', port,
  '--model', modelPath,
  '--ctx-size', ctx,
  '--no-mmap',
]

if (hasMmproj) {
  spawnArgs.push('--mmproj', mmprojPath)
}

const child = spawn(binPath, spawnArgs, { stdio: 'inherit' })

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
