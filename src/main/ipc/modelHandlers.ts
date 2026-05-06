import { ipcMain } from 'electron'
import { 
  RENDERER_TO_MAIN_CHANNELS, 
  MAIN_TO_RENDERER_CHANNELS,
  ModelAssetId
} from '../../shared/types'
import { getModelStatus, downloadAssets } from '../sidecar/assetManager'
import { spawnBackend } from '../sidecar/backendProcess'
import { startHealthPolling } from '../sidecar/healthCheck'
import { RegisterIpcHandlersOptions } from './types'

export function registerModelIpcHandlers(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.MODELS_GET_STATUS, () => {
    return getModelStatus()
  })

  ipcMain.on(RENDERER_TO_MAIN_CHANNELS.MODELS_DOWNLOAD, async (_event, request: { assets?: ModelAssetId[] }) => {
    const mainWindow = options.getMainWindow()
    if (!mainWindow) return

    const assets = request.assets || getModelStatus().missing

    try {
      await downloadAssets(
        assets,
        (progress) => {
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.MODELS_DOWNLOAD_PROGRESS, progress)
        },
        (asset) => {
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.MODELS_DOWNLOAD_COMPLETE, { asset })
        },
        (asset, message) => {
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.MODELS_DOWNLOAD_ERROR, { asset, message })
        }
      )
      
      // Notify final status
      const status = getModelStatus()
      mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.MODELS_STATUS, status)

      if (status.ready) {
        spawnBackend()
        startHealthPolling(() => options.getMainWindow())
      }
    } catch (e) {
      // sequential download stopped on error; already reported via MODELS_DOWNLOAD_ERROR
    }
  })
}
