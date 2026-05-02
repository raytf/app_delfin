/**
 * Downloads the llamafile binary and GGUF model into llamafile/bin/ and llamafile/models/.
 * Version and model file are read from LLAMAFILE_VERSION / LLAMAFILE_MODEL_FILE in .env
 * (falls back to .env.example, then to built-in defaults).
 *
 * Usage:
 *   node scripts/setup-llamafile.mjs
 *   npm run setup:llamafile
 */

import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { downloadFile, loadEnv } from './download-models.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const llamafileDir = join(rootDir, 'llamafile')
const binDir = join(llamafileDir, 'bin')
const modelsDir = join(llamafileDir, 'models')

// llamafile ships a single universal binary for all platforms (no .exe variant).
// On Windows, rename to .exe so the OS will execute it directly.
function getBinaryName(version) {
  return process.platform === 'win32' ? `llamafile-${version}.exe` : `llamafile-${version}`
}

function getBinaryUrl(version) {
  // The release asset is always the un-suffixed name regardless of platform.
  return `https://github.com/mozilla-ai/llamafile/releases/download/${version}/llamafile-${version}`
}

function getModelUrl(modelFile) {
  // bartowski's repo has the full set of quantisations including IQ4_NL.
  // ggml-org only publishes Q8_0 and bf16.
  return `https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/${modelFile}`
}

async function main() {
  const env = loadEnv()
  const version = process.env.LLAMAFILE_VERSION ?? env['LLAMAFILE_VERSION'] ?? '0.10.1'
  const modelFile =
    process.env.LLAMAFILE_MODEL_FILE ?? env['LLAMAFILE_MODEL_FILE'] ?? 'google_gemma-4-E2B-it-IQ4_NL.gguf'
  const mmprojFile =
    process.env.LLAMAFILE_MMPROJ_FILE ?? env['LLAMAFILE_MMPROJ_FILE'] ?? 'mmproj-google_gemma-4-E2B-it-f16.gguf'

  console.log('═'.repeat(60))
  console.log('  Delfin — llamafile setup')
  console.log('═'.repeat(60))
  console.log()
  console.log(`  llamafile version : ${version}`)
  console.log(`  GGUF model        : ${modelFile}`)
  console.log(`  Vision projector  : ${mmprojFile}`)
  console.log(`  Platform          : ${process.platform}`)
  console.log()

  mkdirSync(binDir, { recursive: true })
  mkdirSync(modelsDir, { recursive: true })

  // --- Binary ---
  const binName = getBinaryName(version)
  const binPath = join(binDir, binName)

  if (existsSync(binPath)) {
    console.log(`[setup-llamafile] ✅ Binary already present — skipping:`)
    console.log(`   ${binPath}`)
  } else {
    await downloadFile(getBinaryUrl(version), binPath, `llamafile ${version} binary`)
    if (process.platform !== 'win32') {
      chmodSync(binPath, 0o755)
      console.log('[setup-llamafile] Made binary executable (chmod 755).')
    }
  }

  // --- Model ---
  const modelPath = join(modelsDir, modelFile)

  if (existsSync(modelPath)) {
    console.log(`[setup-llamafile] ✅ Model already present — skipping:`)
    console.log(`   ${modelPath}`)
  } else {
    console.log('[setup-llamafile] Downloading GGUF model (~3.4 GB). This may take a while…')
    await downloadFile(getModelUrl(modelFile), modelPath, modelFile)
  }

  // --- Vision projector (mmproj) ---
  const mmprojPath = join(modelsDir, mmprojFile)

  if (existsSync(mmprojPath)) {
    console.log(`[setup-llamafile] ✅ Vision projector already present — skipping:`)
    console.log(`   ${mmprojPath}`)
  } else {
    console.log('[setup-llamafile] Downloading vision projector (~986 MB). Required for image input…')
    await downloadFile(getModelUrl(mmprojFile), mmprojPath, mmprojFile)
  }

  console.log()
  console.log('[setup-llamafile] ✅ Setup complete!')
  console.log()
  console.log(`  Binary           : ${binPath}`)
  console.log(`  Model            : ${modelPath}`)
  console.log(`  Vision projector : ${mmprojPath}`)
  console.log()
  console.log('  Start the server with:  npm run dev:llamafile')
  console.log()
}

main().catch((err) => {
  console.error('\n[setup-llamafile] ❌ Setup failed:', err.message)
  process.exit(1)
})
