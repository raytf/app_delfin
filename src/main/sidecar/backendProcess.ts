import { app } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  unlinkSync,
  WriteStream,
} from 'node:fs'
import { ConfigService } from '../config/config-service'

const configService = new ConfigService()

let backendProcess: ChildProcess | null = null
let proxyLogStream: WriteStream | null = null
let gracefulShutdown = false

// Marker file written before each bridge launch and deleted on graceful exit.
// If it survives across launches, the previous run crashed and any
// XNNPACK weight-cache files left next to the model are likely partial —
// LiteRT will then fail with "Cannot get the address of a buffer in a cache
// before the build step that introduces it has finished." Wipe them so the
// bridge rebuilds them from scratch on the next run.
function bridgeMarkerPath(): string {
  return join(app.getPath('userData'), 'models', '.bridge-running')
}

function clearStaleXnnpackCaches(modelPath: string, log?: (line: string) => void): void {
  const dir = dirname(modelPath)
  if (!existsSync(dir)) return
  let removed = 0
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.endsWith('.xnnpack_cache')) {
        try {
          rmSync(join(dir, entry), { force: true })
          removed += 1
        } catch (err) {
          log?.(`[backendProcess] failed to remove stale cache ${entry}: ${(err as Error).message}\n`)
        }
      }
    }
  } catch (err) {
    log?.(`[backendProcess] readdir failed for ${dir}: ${(err as Error).message}\n`)
    return
  }
  if (removed > 0) {
    const line = `[backendProcess] cleared ${removed} stale *.xnnpack_cache file(s) in ${dir} (previous run did not exit cleanly)`
    console.log(line)
    log?.(`${line}\n`)
  }
}

function writeBridgeMarker(): void {
  const path = bridgeMarkerPath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    closeSync(openSync(path, 'w'))
  } catch (err) {
    console.warn(`[backendProcess] could not write bridge marker: ${(err as Error).message}`)
  }
}

function clearBridgeMarker(): void {
  const path = bridgeMarkerPath()
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {
    // best-effort; a leftover marker only triggers a one-time cache rebuild
  }
}

// Packaged Electron GUI apps on Windows have no console attached, so any
// stdout/stderr from spawned children is silently discarded. We tee both
// streams into a per-launch log file under userData/logs so the bridge's
// crash output is recoverable. Path is logged to the main process console
// at spawn time so users running with ELECTRON_ENABLE_LOGGING=1 can find it.
function openProxyLogStream(): { stream: WriteStream; path: string } {
  const logsDir = join(app.getPath('userData'), 'logs')
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true })
  const path = join(logsDir, 'proxy.log')
  const stream = createWriteStream(path, { flags: 'a' })
  return { stream, path }
}

function writeLogHeader(stream: WriteStream, childEnv: NodeJS.ProcessEnv): void {
  const header = [
    '',
    '='.repeat(72),
    `Delfin proxy launch — ${new Date().toISOString()}`,
    `app version       : ${app.getVersion()}`,
    `electron version  : ${process.versions.electron}`,
    `node version      : ${process.versions.node}`,
    `platform / arch   : ${process.platform} / ${process.arch}`,
    `LITERT_CPP_BIN    : ${childEnv.LITERT_CPP_BIN ?? '(default)'}`,
    `LITERT_CPP_MODEL  : ${childEnv.LITERT_CPP_MODEL ?? '(default)'}`,
    `LITERT_CPP_TTS    : ${childEnv.LITERT_CPP_TTS_BACKEND ?? '(default)'}`,
    `PIPER_BIN         : ${childEnv.PIPER_BIN ?? '(unset)'}`,
    `PIPER_MODEL       : ${childEnv.PIPER_MODEL ?? '(unset)'}`,
    `PIPER_CONFIG      : ${childEnv.PIPER_CONFIG ?? '(unset)'}`,
    `SIDECAR_PORT      : ${childEnv.SIDECAR_PORT ?? '8321 (default)'}`,
    '='.repeat(72),
    '',
  ].join('\n')
  stream.write(header)
}

export function spawnBackend(): void {
  const isPackaged = app.isPackaged
  const inferenceBackend =
    configService.backend.inferenceBackend ?? (isPackaged ? 'litert-cpp' : 'litert')

  console.log(`[backendProcess] Spawning backend: ${inferenceBackend} (packaged: ${isPackaged})`)

  if (!isPackaged && inferenceBackend === 'litert') {
    // In dev mode with litert (Python sidecar), we assume it's started separately
    // via concurrently in npm run dev:full.
    return
  }

  // Packaged mode or explicit litert-cpp dev mode
  if (inferenceBackend === 'litert-cpp') {
    const rootDir = isPackaged ? process.resourcesPath : app.getAppPath()
    const proxyPath = isPackaged
      ? join(rootDir, 'litert-cpp-proxy.mjs')
      : join(rootDir, 'scripts', 'litert-cpp-proxy.mjs')

    // Build a child env that points the proxy at the bundled bridge binary
    // and the user-data-managed model. Mutating the main-process env object directly would
    // leak these values into the Electron main process for the rest of its
    // lifetime; we keep them scoped to the spawned child.
    const childEnv: NodeJS.ProcessEnv = { ...configService.backend.rawEnv }

    // CRITICAL: process.execPath is always the Electron binary (in dev *and*
    // packaged builds). Without this flag, spawning execPath with a script
    // argument launches another full Electron window, which on startup
    // spawns another backend, which launches another window, etc. In
    // ELECTRON_RUN_AS_NODE mode the binary behaves as a plain Node process.
    childEnv.ELECTRON_RUN_AS_NODE = '1'

    if (isPackaged) {
      const binName = process.platform === 'win32' ? 'delfin_litert_bridge.exe' : 'delfin_litert_bridge'
      childEnv.LITERT_CPP_BIN = childEnv.LITERT_CPP_BIN ?? join(process.resourcesPath, binName)

      const modelFile = childEnv.MODEL_FILE ?? 'gemma-4-E2B-it.litertlm'
      childEnv.LITERT_CPP_MODEL =
        childEnv.LITERT_CPP_MODEL ?? join(app.getPath('userData'), 'models', modelFile)

      // Piper TTS — binary and voice model are downloaded to userData at first
      // run by assetManager. The standalone Piper executable (not a Python venv)
      // lives at userData/bin/piper/piper[.exe]; the voice model at
      // userData/models/piper/<voice>.onnx[.json].
      const piperBinName = process.platform === 'win32' ? 'piper.exe' : 'piper'
      const piperBinPath = join(app.getPath('userData'), 'bin', 'piper', piperBinName)
      const piperVoice = childEnv.PIPER_VOICE ?? 'en_US-hfc_female-medium'
      const piperModel = join(app.getPath('userData'), 'models', 'piper', `${piperVoice}.onnx`)
      const piperConfig = `${piperModel}.json`

      const piperReady = existsSync(piperBinPath) && existsSync(piperModel) && existsSync(piperConfig)

      if (piperReady) {
        childEnv.LITERT_CPP_TTS_BACKEND = childEnv.LITERT_CPP_TTS_BACKEND ?? 'piper'
        childEnv.PIPER_BIN = childEnv.PIPER_BIN ?? piperBinPath
        childEnv.PIPER_MODEL = childEnv.PIPER_MODEL ?? piperModel
        childEnv.PIPER_CONFIG = childEnv.PIPER_CONFIG ?? piperConfig
      } else {
        // Assets not yet downloaded — fall back to no TTS; renderer uses the
        // browser Web Speech API when no audio_* events arrive.
        childEnv.LITERT_CPP_TTS_BACKEND = childEnv.LITERT_CPP_TTS_BACKEND ?? 'none'
        console.warn(
          `[backendProcess] Piper assets missing (bin=${existsSync(piperBinPath)}, model=${existsSync(piperModel)}, config=${existsSync(piperConfig)}); TTS disabled.`,
        )
      }
    }

    if (existsSync(proxyPath)) {
      const { stream, path: logPath } = openProxyLogStream()
      proxyLogStream = stream
      writeLogHeader(stream, childEnv)
      console.log(`[backendProcess] Launching proxy: ${proxyPath}`)
      console.log(`[backendProcess] Proxy logs: ${logPath}`)

      // Crash recovery: a marker that survives across launches means the
      // previous bridge run did not exit cleanly. XNNPACK weight-cache files
      // written during that run may be partial. Wipe them before spawning
      // the new bridge so it rebuilds them from scratch.
      const modelPath = childEnv.LITERT_CPP_MODEL
      if (existsSync(bridgeMarkerPath()) && modelPath) {
        clearStaleXnnpackCaches(modelPath, (line) => stream.write(line))
      }
      writeBridgeMarker()

      gracefulShutdown = false
      backendProcess = spawn(process.execPath, [proxyPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: childEnv,
      })

      backendProcess.stdout?.on('data', (chunk) => stream.write(chunk))
      backendProcess.stderr?.on('data', (chunk) => stream.write(chunk))

      backendProcess.on('exit', (code, signal) => {
        const line = `\n[backendProcess] Backend proxy exited (code=${code} signal=${signal ?? 'none'}) at ${new Date().toISOString()}\n`
        console.log(line.trim())
        stream.write(line)
        // Only consider this a clean exit if killBackend() initiated it or
        // the proxy returned 0 on its own. Any other code/signal leaves the
        // marker in place so the next launch wipes the XNNPACK caches.
        if (gracefulShutdown || code === 0) {
          clearBridgeMarker()
        }
        stream.end()
        if (proxyLogStream === stream) proxyLogStream = null
        backendProcess = null
      })

      backendProcess.on('error', (err) => {
        console.error('[backendProcess] Failed to start backend proxy:', err)
        stream.write(`\n[backendProcess] spawn error: ${err.message}\n`)
      })
    } else {
      console.error(`[backendProcess] Backend proxy not found at ${proxyPath}`)
    }
  } else if (!isPackaged) {
    console.log('[backendProcess] Skipping backend spawn in dev mode for backend:', inferenceBackend)
  }
}

export function killBackend(): void {
  if (backendProcess) {
    console.log('[backendProcess] Killing backend process')
    gracefulShutdown = true
    backendProcess.kill()
    backendProcess = null
  }
  if (proxyLogStream) {
    proxyLogStream.end()
    proxyLogStream = null
  }
}

export function getProxyLogPath(): string {
  return join(app.getPath('userData'), 'logs', 'proxy.log')
}
