import { app } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

let backendProcess: ChildProcess | null = null

export function spawnBackend(): void {
  const isPackaged = app.isPackaged
  const inferenceBackend = process.env.INFERENCE_BACKEND || (isPackaged ? 'litert-cpp' : 'litert')

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
    
    if (isPackaged) {
      const binName = process.platform === 'win32' ? 'delfin_litert_bridge.exe' : 'delfin_litert_bridge'
      process.env.LITERT_CPP_BIN = join(process.resourcesPath, binName)
      process.env.LITERT_CPP_TTS_BACKEND = process.env.LITERT_CPP_TTS_BACKEND || 'piper'
    }

    if (existsSync(proxyPath)) {
      console.log(`[backendProcess] Launching proxy: ${proxyPath}`)
      backendProcess = spawn(process.execPath, [proxyPath], {
        stdio: 'inherit',
        env: { ...process.env }
      })
      
      backendProcess.on('exit', (code) => {
        console.log(`[backendProcess] Backend proxy exited with code ${code}`)
        backendProcess = null
      })

      backendProcess.on('error', (err) => {
        console.error('[backendProcess] Failed to start backend proxy:', err)
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
    backendProcess.kill()
    backendProcess = null
  }
}
