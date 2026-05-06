import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import https from 'node:https'
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

const MANIFEST_PATH = join(app.getPath('userData'), 'manifest.json')
const MODELS_DIR = join(app.getPath('userData'), 'models')

let downloadInProgress = false

function expectedAssetVersion(id: ModelAssetId): string | undefined {
  return id === 'litert-cpp-model' ? MODEL_REVISION : undefined
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
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    } catch (e) {
      console.error('[assetManager] Failed to parse manifest, recreating')
    }
  }

  // The Piper voice + config are bundled via electron-builder extraResources
  // (see package.json build.<platform>.extraResources). Only the LiteRT-LM
  // model is downloaded at first run, because it is too large to ship in the
  // installer.
  const defaultManifest: AssetManifest = {
    schema: 1,
    assets: {
      'litert-cpp-model': {
        path: `models/${MODEL_FILE}`,
        downloaded: false,
        url: MODEL_URL
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
  if (!existsSync(join(MODELS_DIR, 'tts'))) mkdirSync(join(MODELS_DIR, 'tts'), { recursive: true })

  try {
    for (const id of assetsToDownload) {
      const asset = manifest.assets[id]
      if (!asset) continue

      // Refresh the URL/path from the current pinned constants so a manifest
      // that was created against an older revision still re-downloads from
      // the right place when the version mismatch invalidates it.
      if (id === 'litert-cpp-model') {
        asset.url = MODEL_URL
        asset.path = `models/${MODEL_FILE}`
      }
      if (!asset.url) continue

      const destPath = join(app.getPath('userData'), asset.path)
      console.log(`[assetManager] Downloading ${id} from ${asset.url} to ${destPath}`)

      try {
        await downloadFile(asset.url, destPath, (received, total) => {
          onProgress({
            asset: id,
            receivedBytes: received,
            totalBytes: total,
            percent: total ? Math.round((received / total) * 100) : undefined
          })
        })

        asset.downloaded = true
        const expected = expectedAssetVersion(id)
        if (expected !== undefined) asset.version = expected
        saveManifest(manifest)
        onComplete(id)
      } catch (e: any) {
        console.error(`[assetManager] Failed to download ${id}:`, e)
        onError(id, e.message || 'Download failed')
        throw e // stop sequential downloads on first error
      }
    }
  } finally {
    downloadInProgress = false
  }
}

function downloadFile(url: string, dest: string, onProgress: (received: number, total?: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    
    const request = https.get(url, (response: IncomingMessage) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect (HuggingFace uses redirects for LFS)
        downloadFile(response.headers.location!, dest, onProgress).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
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
