import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
}))

import { MAIN_TO_RENDERER_CHANNELS, RENDERER_TO_MAIN_CHANNELS, type OverlayMode } from '../../../shared/types'
import { registerOverlayIpcHandlers } from '../overlayHandlers'
import type { RegisterIpcHandlersOptions } from '../types'

type OverlayHandler = (_event: unknown, mode: OverlayMode) => Promise<void>

function getRegisteredHandler(channel: string): OverlayHandler {
  const registeredHandler = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]

  expect(registeredHandler).toBeTypeOf('function')

  return registeredHandler as OverlayHandler
}

describe('registerOverlayIpcHandlers', () => {
  beforeEach(() => {
    handleMock.mockReset()
  })

  it('forwards overlay errors, reverts the previous mode, and rethrows', async () => {
    const currentMode: OverlayMode = 'expanded'
    const switchError = new Error('window switch failed')
    const send = vi.fn()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const options: RegisterIpcHandlersOptions = {
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send },
      }) as never,
      getOverlayState: () => ({
        mode: currentMode,
      }),
      sessionPersistence: {} as never,
      sidecarWsUrl: 'ws://localhost:8321/ws',
      switchOverlayMode: vi.fn().mockImplementation(async (mode) => {
        if (mode !== currentMode) {
          throw switchError
        }
      }),
    }

    registerOverlayIpcHandlers(options)

    const overlayHandler = getRegisteredHandler(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MODE)

    await expect(overlayHandler({}, 'minimized-prompt-input')).rejects.toThrow('window switch failed')

    expect(send).toHaveBeenCalledWith(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR, {
      message: 'window switch failed',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[overlayHandlers] Failed to set overlay mode:',
      switchError,
    )
  })
})
