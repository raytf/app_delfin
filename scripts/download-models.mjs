/**
 * Downloads Kokoro TTS model files into sidecar/ if they are not already present.
 * Destination filenames are read from KOKORO_MODEL_PATH / KOKORO_VOICES_PATH in .env
 * (falls back to .env.example, then to built-in defaults).
 *
 * Usage:
 *   node scripts/download-models.mjs
 *   npm run download:models
 */

import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sidecarDir = join(rootDir, 'sidecar')

// GitHub is the reliable source — HuggingFace CDN has proven unreliable for these files.
const KOKORO_MODEL_URL =
  'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx'
const VOICES_URL =
  'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin'

/** Parse a .env-style file into a plain object (no shell expansion). */
function parseEnvFile(filePath) {
  const env = {}
  for (const raw of readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return env
}

/** Load env vars from .env, falling back to .env.example. */
function loadEnv() {
  for (const name of ['.env', '.env.example']) {
    const p = join(rootDir, name)
    if (existsSync(p)) return parseEnvFile(p)
  }
  return {}
}

/** Resolve a model path env value to an absolute path (relative → sidecar/). */
function resolvePath(envValue, fallback) {
  const value = envValue ?? fallback
  return isAbsolute(value) ? value : join(sidecarDir, value)
}

/** Stream a URL to disk, printing progress every 10 %. */
async function downloadFile(url, destPath, label) {
  console.log(`\n[download-models] Downloading ${label}`)
  console.log(`  from: ${url}`)
  console.log(`  to:   ${destPath}`)

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || response.body === null) {
    throw new Error(`HTTP ${response.status} ${response.statusText} — ${url}`)
  }

  const totalBytes = parseInt(response.headers.get('content-length') ?? '0', 10)
  const totalMB = totalBytes > 0 ? (totalBytes / 1048576).toFixed(0) : '?'

  const writer = createWriteStream(destPath)
  let downloaded = 0
  let lastPercent = -1

  for await (const chunk of response.body) {
    writer.write(chunk)
    downloaded += chunk.length
    if (totalBytes > 0) {
      const pct = Math.floor((downloaded / totalBytes) * 100)
      if (pct >= lastPercent + 10) {
        process.stdout.write(
          `\r  ${String(pct).padStart(3)}%  (${(downloaded / 1048576).toFixed(0)} / ${totalMB} MB)   `,
        )
        lastPercent = pct
      }
    }
  }

  await new Promise((res, rej) => {
    writer.end()
    writer.on('finish', res)
    writer.on('error', rej)
  })

  process.stdout.write('\n')
  console.log(`[download-models] ✅ ${label} saved.\n`)
}

async function main() {
  const env = loadEnv()

  const files = [
    {
      label: 'kokoro-v1.0.onnx (Kokoro TTS model, ~311 MB)',
      url: KOKORO_MODEL_URL,
      dest: resolvePath(env['KOKORO_MODEL_PATH'], 'kokoro-v1.0.onnx'),
    },
    {
      label: 'voices-v1.0.bin (Kokoro voice embeddings, ~27 MB)',
      url: VOICES_URL,
      dest: resolvePath(env['KOKORO_VOICES_PATH'], 'voices-v1.0.bin'),
    },
  ]

  let anyDownloaded = false

  for (const { label, url, dest } of files) {
    if (existsSync(dest)) {
      console.log(`[download-models] ✅ Already present — skipping: ${dest}`)
      continue
    }
    await downloadFile(url, dest, label)
    anyDownloaded = true
  }

  if (!anyDownloaded) {
    console.log('[download-models] All Kokoro model files are already present.')
  }
}

main().catch((err) => {
  console.error('\n[download-models] ❌ Download failed:', err.message)
  process.exit(1)
})
