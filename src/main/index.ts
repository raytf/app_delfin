import { app, BrowserWindow } from 'electron'
import { config } from 'dotenv'
import { registerIpcHandlers } from './ipc/handlers'
import { createOverlayWindow } from './overlay/overlayWindow'
import type { OverlayMode, OverlayState, SessionMode } from '../shared/types'

config() // load .env from repo root

let mainWindow: BrowserWindow | null = null
let overlayMode: OverlayMode = 'expanded'
let sessionMode: SessionMode = 'home'

function createWindow(mode: OverlayMode): BrowserWindow {
  const window = createOverlayWindow(mode)
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
    sessionMode,
  }
}

function setSessionMode(mode: SessionMode): void {
  sessionMode = mode
}

async function switchOverlayMode(mode: OverlayMode): Promise<void> {
  if (overlayMode === mode && mainWindow !== null && !mainWindow.isDestroyed()) {
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

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
