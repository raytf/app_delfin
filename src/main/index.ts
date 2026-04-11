import { app, BrowserWindow } from 'electron'
import { config } from 'dotenv'
import { registerIpcHandlers } from './ipc/handlers'
import { createOverlayWindow, setOverlayMode } from './overlay/overlayWindow'
import { disconnectFromSidecar } from './sidecar/wsClient'
import type { MinimizedOverlayVariant, OverlayMode, OverlayState, SessionMode } from '../shared/types'

config() // load .env from repo root

let mainWindow: BrowserWindow | null = null
let overlayMode: OverlayMode = 'expanded'
let minimizedVariant: MinimizedOverlayVariant = 'compact'
let sessionMode: SessionMode = 'home'

function createWindow(mode: OverlayMode): BrowserWindow {
  const window = createOverlayWindow(mode, minimizedVariant)
  overlayMode = mode
  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })
  return window
}

function getOverlayState(): OverlayState {
  return {
    overlayMode,
    minimizedVariant,
    sessionMode,
  }
}

function setSessionMode(mode: SessionMode): void {
  sessionMode = mode
}

function setMinimizedVariant(variant: MinimizedOverlayVariant): void {
  minimizedVariant = variant
}

async function switchOverlayMode(mode: OverlayMode): Promise<void> {
  if (overlayMode === mode && mainWindow !== null && !mainWindow.isDestroyed()) {
    setOverlayMode(mainWindow, mode, minimizedVariant)
    mainWindow.focus()
    return
  }

  const previousWindow = mainWindow
  const nextWindow = createWindow(mode)

  if (previousWindow !== null && !previousWindow.isDestroyed()) {
    previousWindow.destroy()
  }

  nextWindow.focus()
}

app.whenReady().then(() => {
  console.log('Screen Copilot started')
  registerIpcHandlers({
    getOverlayState,
    getMainWindow: () => mainWindow,
    setMinimizedVariant,
    switchOverlayMode,
    setSessionMode,
  })

  mainWindow = createWindow('expanded')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(overlayMode)
    }
  })
})

app.on('window-all-closed', () => {
  mainWindow = null
  disconnectFromSidecar()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
