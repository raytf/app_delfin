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

const MANIFEST_PATH = join(app.getPath('userData'), 'manifest.json')
const MODELS_DIR = join(app.getPath('userData'), 'models')

let downloadInProgress = false

export function getModelStatus(): ModelStatus {
  const manifest = loadManifest()
  const missing: ModelAssetId[] = []
  
  for (const [id, asset] of Object.entries(manifest.assets) as [ModelAssetId, any][]) {
    const fullPath = join(app.getPath('userData'), asset.path)
    if (!asset.downloaded || !existsSync(fullPath)) {
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

  const defaultManifest: AssetManifest = {
    schema: 1,
    assets: {
      'litert-cpp-model': {
        path: 'models/gemma-4-E2B-it.litertlm',
        downloaded: false,
        url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm'
      },
      'piper-voice': {
        path: 'models/tts/en_US-hfc_female-medium.onnx',
        downloaded: false,
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx'
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
      if (!asset || !asset.url) continue

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
