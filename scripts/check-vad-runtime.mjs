import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'

const rendererOutDir = resolve('out/renderer')
const runtimeDir = resolve(rendererOutDir, 'vad-runtime')

const requiredRuntimeFiles = [
  'ort.wasm.min.js',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'silero_vad_v5.onnx',
  'bundle.min.js',
]

function fail(message) {
  console.error(`check:vad-runtime failed: ${message}`)
  process.exit(1)
}

async function assertFileExists(filePath) {
  try {
    await access(filePath, constants.F_OK)
  } catch {
    fail(`missing required file: ${filePath}`)
  }
}

async function main() {
  for (const fileName of requiredRuntimeFiles) {
    await assertFileExists(resolve(runtimeDir, fileName))
  }

  const wasmPath = resolve(runtimeDir, 'ort-wasm-simd-threaded.wasm')
  const wasmHeader = await readFile(wasmPath)
  const expectedMagic = [0x00, 0x61, 0x73, 0x6d]

  for (let index = 0; index < expectedMagic.length; index += 1) {
    if (wasmHeader[index] !== expectedMagic[index]) {
      fail(
        `${wasmPath} does not have valid wasm magic bytes ` +
          `(expected 00 61 73 6d, got ${Array.from(wasmHeader.slice(0, 4))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ')})`,
      )
    }
  }

  const indexHtmlPath = resolve(rendererOutDir, 'index.html')
  await assertFileExists(indexHtmlPath)
  const indexHtml = await readFile(indexHtmlPath, 'utf8')

  if (!indexHtml.includes('./vad-runtime/ort.wasm.min.js')) {
    fail(`${indexHtmlPath} does not reference ./vad-runtime/ort.wasm.min.js`)
  }

  console.log('check:vad-runtime passed')
  console.log(`validated ${requiredRuntimeFiles.length} runtime assets in ${runtimeDir}`)
}

await main()