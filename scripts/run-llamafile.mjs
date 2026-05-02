/**
 * Starts the llamafile server using the binary and model downloaded by setup-llamafile.mjs.
 *
 * Usage:
 *   node scripts/run-llamafile.mjs
 *   npm run dev:llamafile
 *
 * Env vars (read from .env, then .env.example, then defaults):
 *   LLAMAFILE_VERSION     — binary version to locate (default: 0.8.17)
 *   LLAMAFILE_MODEL_FILE  — GGUF model filename (default: google_gemma-4-E2B-it-IQ4_NL.gguf)
 *   LLAMAFILE_PORT        — port to listen on (default: 8080)
 *   LLAMAFILE_BIN         — absolute path override for the binary (optional)
 *   LLAMAFILE_CTX         — context size in tokens (default: 8192)
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
  process.env.LLAMAFILE_VERSION ?? env['LLAMAFILE_VERSION'] ?? '0.8.17'
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

// --- Launch ---
console.log(`[run-llamafile] Starting llamafile server on 127.0.0.1:${port}`)
console.log(`[run-llamafile]   Binary : ${binPath}`)
console.log(`[run-llamafile]   Model  : ${modelPath}`)
console.log(`[run-llamafile]   Context: ${ctx} tokens`)
console.log()

const child = spawn(
  binPath,
  [
    '--server',
    '--host', '127.0.0.1',
    '--port', port,
    '--model', modelPath,
    '--ctx-size', ctx,
    '--no-mmap',
  ],
  { stdio: 'inherit' },
)

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
