import { app } from 'electron'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
  unlinkSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { IncomingMessage } from 'node:http'
import { ModelAssetId, ModelStatus, DownloadProgress } from '../../shared/types'

interface AssetManifest {
  schema: number
  assets: Record<ModelAssetId, {
    path: string
    downloaded: boolean
    version?: string
    url?: string
  }>
}

// Pinned LiteRT-LM model revision. Must stay in sync with MODEL_REVISION in
// scripts/setup-litert-cpp.mjs and LITERT_LM_REF in the same file. The bridge
// binary's ABI is tied to this revision — bumping LITERT_LM_REF without
// bumping this constant produces "Vision Encoder model must have exactly one
// signature but got N" failures (the model schema changed but the bridge
// expects the older shape, or vice-versa). See AGENTS.md "Bump procedure".
const MODEL_REPO = 'litert-community/gemma-4-E2B-it-litert-lm'
const MODEL_FILE = 'gemma-4-E2B-it.litertlm'
const MODEL_REVISION = '84b6978eff6e4eea02825bc2ee4ea48579f13109'
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${MODEL_FILE}`

// Pinned Piper standalone release. Bump together with piper-voice.mjs PIPER_TTS_VERSION
// when upgrading. The standalone binary ships its own onnxruntime so no Python needed.
const PIPER_RELEASE_TAG = '2023.11.14-2'
const PIPER_VOICE_ID = 'en_US-hfc_female-medium'
const PIPER_VOICE_BASE =
  `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/hfc_female/medium`

function piperBinUrl(): string {
  if (process.platform === 'win32')
    return `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE_TAG}/piper_windows_amd64.zip`
  if (process.platform === 'darwin')
    return `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE_TAG}/piper_macos_aarch64.tar.gz`
  return `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE_TAG}/piper_linux_x86_64.tar.gz`
}

function piperBinRelPath(): string {
  return process.platform === 'win32' ? 'bin/piper/piper.exe' : 'bin/piper/piper'
}

const MANIFEST_PATH = join(app.getPath('userData'), 'manifest.json')
const MODELS_DIR = join(app.getPath('userData'), 'models')

let downloadInProgress = false

function expectedAssetVersion(id: ModelAssetId): string | undefined {
  if (id === 'litert-cpp-model') return MODEL_REVISION
  if (id === 'piper-bin') return PIPER_RELEASE_TAG
  return undefined
}

export function getModelStatus(): ModelStatus {
  const manifest = loadManifest()
  const missing: ModelAssetId[] = []

  for (const [id, asset] of Object.entries(manifest.assets) as [ModelAssetId, any][]) {
    const fullPath = join(app.getPath('userData'), asset.path)
    const expected = expectedAssetVersion(id)
    const versionMatches = expected === undefined || asset.version === expected
    if (!asset.downloaded || !existsSync(fullPath) || !versionMatches) {
      missing.push(id)
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    downloadInProgress
  }
}

function loadManifest(): AssetManifest {
  if (existsSync(MANIFEST_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as AssetManifest
      // Migrate manifests created before piper assets were added
      if (!parsed.assets['piper-bin']) {
        parsed.assets['piper-bin'] = { path: piperBinRelPath(), downloaded: false, url: piperBinUrl() }
      }
      if (!parsed.assets['piper-voice']) {
        parsed.assets['piper-voice'] = { path: `models/piper/${PIPER_VOICE_ID}.onnx`, downloaded: false }
      }
      // Fix stale voice path from early builds that used models/tts/ instead of models/piper/
      if (parsed.assets['piper-voice']?.path.startsWith('models/tts/')) {
        parsed.assets['piper-voice'] = { path: `models/piper/${PIPER_VOICE_ID}.onnx`, downloaded: false }
      }
      saveManifest(parsed)
      return parsed
    } catch (e) {
      console.error('[assetManager] Failed to parse manifest, recreating')
    }
  }

  // Piper binary and voice model are downloaded at first run.
  // Only the LiteRT-LM model was originally download-only; Piper was bundled
  // via extraResources but that created a build-time dependency. Both are now
  // first-run downloads so the installer works on any machine.
  const defaultManifest: AssetManifest = {
    schema: 1,
    assets: {
      'litert-cpp-model': {
        path: `models/${MODEL_FILE}`,
        downloaded: false,
        url: MODEL_URL
      },
      'piper-bin': {
        path: piperBinRelPath(),
        downloaded: false,
        url: piperBinUrl()
      },
      'piper-voice': {
        path: `models/piper/${PIPER_VOICE_ID}.onnx`,
        downloaded: false
      }
    }
  }

  saveManifest(defaultManifest)
  return defaultManifest
}

function saveManifest(manifest: AssetManifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
}

export async function downloadAssets(
  assetsToDownload: ModelAssetId[],
  onProgress: (progress: DownloadProgress) => void,
  onComplete: (asset: ModelAssetId) => void,
  onError: (asset: ModelAssetId, message: string) => void
): Promise<void> {
  if (downloadInProgress) return
  downloadInProgress = true

  const manifest = loadManifest()

  if (!existsSync(MODELS_DIR)) mkdirSync(MODELS_DIR, { recursive: true })
  if (!existsSync(join(MODELS_DIR, 'piper'))) mkdirSync(join(MODELS_DIR, 'piper'), { recursive: true })

  try {
    for (const id of assetsToDownload) {
      const asset = manifest.assets[id]
      if (!asset) continue

      // Refresh URL/path from pinned constants so stale manifests re-download correctly.
      if (id === 'litert-cpp-model') {
        asset.url = MODEL_URL
        asset.path = `models/${MODEL_FILE}`
      }
      if (id === 'piper-bin') {
        asset.url = piperBinUrl()
        asset.path = piperBinRelPath()
      }
      if (id === 'piper-voice') {
        asset.path = `models/piper/${PIPER_VOICE_ID}.onnx`
      }

      try {
        if (id === 'piper-bin') {
          await downloadAndExtractPiperBin(asset.url!, onProgress)
        } else if (id === 'piper-voice') {
          await downloadPiperVoice(onProgress)
        } else {
          if (!asset.url) continue
          const destPath = join(app.getPath('userData'), asset.path)
          console.log(`[assetManager] Downloading ${id} from ${asset.url} to ${destPath}`)
          await downloadFile(asset.url, destPath, (received, total) => {
            onProgress({ asset: id, receivedBytes: received, totalBytes: total, percent: total ? Math.round((received / total) * 100) : undefined })
          })
        }

        asset.downloaded = true
        const expected = expectedAssetVersion(id)
        if (expected !== undefined) asset.version = expected
        saveManifest(manifest)
        onComplete(id)
      } catch (e: any) {
        console.error(`[assetManager] Failed to download ${id}:`, e)
        onError(id, e.message || 'Download failed')
        throw e
      }
    }
  } finally {
    downloadInProgress = false
  }
}

async function downloadAndExtractPiperBin(
  url: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  const userData = app.getPath('userData')
  const isWin = process.platform === 'win32'
  const ext = isWin ? '.zip' : '.tar.gz'
  const archivePath = join(userData, `piper-archive${ext}`)
  const binDir = join(userData, 'bin')
  const piperDir = join(binDir, 'piper')

  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })

  console.log(`[assetManager] Downloading piper-bin from ${url} to ${archivePath}`)
  await downloadFile(url, archivePath, (received, total) => {
    onProgress({
      asset: 'piper-bin',
      receivedBytes: received,
      totalBytes: total,
      percent: total ? Math.round((received / total) * 100) : undefined
    })
  })

  // The Windows zip contains a piper/ subdirectory at its root, so extracting
  // to binDir produces userData/bin/piper/piper.exe — the expected path.
  console.log(`[assetManager] Extracting piper-bin to ${binDir}`)
  if (isWin) {
    const result = spawnSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${binDir}' -Force`
    ], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`Piper extraction failed: ${result.stderr || result.stdout}`)
    }
  } else {
    const result = spawnSync('tar', ['-xzf', archivePath, '-C', binDir], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`Piper extraction failed: ${result.stderr}`)
    }
    // Set executable bit on the extracted binary
    const binPath = join(piperDir, 'piper')
    if (existsSync(binPath)) chmodSync(binPath, 0o755)
  }

  // Clean up archive after extraction
  try { unlinkSync(archivePath) } catch { /* best-effort */ }
}

async function downloadPiperVoice(onProgress: (progress: DownloadProgress) => void): Promise<void> {
  const voiceDir = join(MODELS_DIR, 'piper')
  if (!existsSync(voiceDir)) mkdirSync(voiceDir, { recursive: true })

  const onnxUrl = `${PIPER_VOICE_BASE}/${PIPER_VOICE_ID}.onnx`
  const configUrl = `${PIPER_VOICE_BASE}/${PIPER_VOICE_ID}.onnx.json`
  const onnxDest = join(voiceDir, `${PIPER_VOICE_ID}.onnx`)
  const configDest = join(voiceDir, `${PIPER_VOICE_ID}.onnx.json`)

  console.log(`[assetManager] Downloading piper voice model from ${onnxUrl}`)
  await downloadFile(onnxUrl, onnxDest, (received, total) => {
    onProgress({
      asset: 'piper-voice',
      receivedBytes: received,
      totalBytes: total,
      percent: total ? Math.round((received / total) * 100) : undefined
    })
  })

  console.log(`[assetManager] Downloading piper voice config from ${configUrl}`)
  // Config is tiny; report 100% immediately after
  await downloadFile(configUrl, configDest, () => {})
}

function downloadFile(url: string, dest: string, onProgress: (received: number, total?: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true })
    const file = createWriteStream(dest)

    const client = url.startsWith('https:') ? https : http
    const request = client.get(url, (response: IncomingMessage) => {
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        file.close()
        const location = response.headers.location
        if (!location) {
          reject(new Error('Redirect with no Location header'))
          return
        }
        // Resolve relative redirects against the current URL
        const redirectUrl = new URL(location, url).href
        downloadFile(redirectUrl, dest, onProgress).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        file.close()
        reject(new Error(`Server returned status code ${response.statusCode}`))
        return
      }

      const total = response.headers['content-length'] ? parseInt(response.headers['content-length'], 10) : undefined
      let received = 0

      response.on('data', (chunk) => {
        received += chunk.length
        onProgress(received, total)
      })

      response.pipe(file)

      file.on('finish', () => {
        file.close()
        resolve()
      })
    })

    request.on('error', (err) => {
      file.close()
      reject(err)
    })
  })
}
