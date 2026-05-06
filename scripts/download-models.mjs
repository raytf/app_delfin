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
import { once } from 'node:events'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
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
export function parseEnvFile(filePath) {
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
export function loadEnv() {
  for (const name of ['.env', '.env.example']) {
    const p = join(rootDir, name)
    if (existsSync(p)) return parseEnvFile(p)
  }
  return {}
}

/** Resolve a model path env value to an absolute path (relative → sidecar/). */
export function resolvePath(envValue, fallback) {
  const value = envValue ?? fallback
  return isAbsolute(value) ? value : join(sidecarDir, value)
}

async function removeIfExists(filePath) {
  await rm(filePath, { force: true })
}

async function getFileSize(filePath) {
  try {
    return (await stat(filePath)).size
  } catch {
    return 0
  }
}

function parseTotalBytes(response, downloadedBytes) {
  const range = response.headers.get('content-range')
  const match = range?.match(/\/([0-9]+)$/)
  if (match) return Number(match[1])

  const contentLength = Number(response.headers.get('content-length') ?? '0')
  if (!Number.isFinite(contentLength) || contentLength <= 0) return 0
  return downloadedBytes + contentLength
}

/** Stream a URL to disk with retry/resume support, printing progress every 10 %. */
export async function downloadFile(url, destPath, label, options = {}) {
  console.log(`\n[download-models] Downloading ${label}`)
  console.log(`  from: ${url}`)
  console.log(`  to:   ${destPath}`)

  await mkdir(dirname(destPath), { recursive: true })
  const tempPath = `${destPath}.part`
  const maxAttempts = options.maxAttempts ?? 5
  const fetchImpl = options.fetchImpl ?? fetch

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let existingBytes = await getFileSize(tempPath)
    const headers = { ...(options.headers ?? {}) }
    if (existingBytes > 0) headers.Range = `bytes=${existingBytes}-`

    if (attempt > 1) {
      console.log(`[download-models] Retry ${attempt}/${maxAttempts} for ${label}`)
    }

    let response
    try {
      response = await fetchImpl(url, { redirect: 'follow', headers })
    } catch (error) {
      if (attempt === maxAttempts) throw error
      console.warn(`[download-models] ⚠️  ${label} request failed: ${error.message}`)
      continue
    }
    if (response.status === 416) {
      await removeIfExists(tempPath)
      existingBytes = 0
      continue
    }
    if (!response.ok || response.body === null) {
      throw new Error(`HTTP ${response.status} ${response.statusText} — ${url}`)
    }

    const canAppend = existingBytes > 0 && response.status === 206
    if (existingBytes > 0 && !canAppend) {
      console.log('[download-models] Server did not resume partial file; restarting download.')
      await removeIfExists(tempPath)
      existingBytes = 0
    }

    const totalBytes = parseTotalBytes(response, existingBytes)
    const totalMB = totalBytes > 0 ? (totalBytes / 1048576).toFixed(0) : '?'
    const writer = createWriteStream(tempPath, { flags: existingBytes > 0 ? 'a' : 'w' })
    let downloaded = existingBytes
    let lastPercent = totalBytes > 0 ? Math.floor((downloaded / totalBytes) * 100) - 10 : -1

    try {
      for await (const chunk of response.body) {
        if (!writer.write(chunk)) await once(writer, 'drain')
        downloaded += chunk.length
        if (totalBytes > 0) {
          const pct = Math.floor((downloaded / totalBytes) * 100)
          if (pct >= lastPercent + 10 || pct === 100) {
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

      if (totalBytes > 0 && downloaded !== totalBytes) {
        throw new Error(`Downloaded ${(downloaded / 1048576).toFixed(1)} MB, expected ${(totalBytes / 1048576).toFixed(1)} MB.`)
      }

      await rename(tempPath, destPath)
      process.stdout.write('\n')
      console.log(`[download-models] ✅ ${label} saved.\n`)
      return
    } catch (error) {
      writer.destroy()
      if (attempt === maxAttempts) throw error
      console.warn(`[download-models] ⚠️  ${label} download interrupted: ${error.message}`)
    }
  }
}

export async function main() {
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

const isDirectExecution = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectExecution) {
  main().catch((err) => {
    console.error('\n[download-models] ❌ Download failed:', err.message)
    process.exit(1)
  })
}
