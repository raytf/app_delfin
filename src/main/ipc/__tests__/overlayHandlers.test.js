import { beforeEach, describe, expect, it, vi } from 'vitest';
const { handleMock } = vi.hoisted(() => ({
    handleMock: vi.fn(),
}));
vi.mock('electron', () => ({
    ipcMain: {
        handle: handleMock,
    },
}));
import { MAIN_TO_RENDERER_CHANNELS, RENDERER_TO_MAIN_CHANNELS } from '../../../shared/types';
import { registerOverlayIpcHandlers } from '../overlayHandlers';
function getRegisteredHandler(channel) {
    const registeredHandler = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1];
    expect(registeredHandler).toBeTypeOf('function');
    return registeredHandler;
}
describe('registerOverlayIpcHandlers', () => {
    beforeEach(() => {
        handleMock.mockReset();
    });
    it('forwards overlay errors, reverts the previous variant, and rethrows', async () => {
        let currentVariant = 'compact';
        const switchError = new Error('window switch failed');
        const send = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const options = {
            getMainWindow: () => ({
                isDestroyed: () => false,
                webContents: { send },
            }),
            getOverlayState: () => ({
                minimizedVariant: currentVariant,
                overlayMode: 'expanded',
                sessionMode: 'active',
            }),
            sessionPersistence: {},
            setMinimizedVariant: (variant) => {
                currentVariant = variant;
            },
            setSessionMode: () => undefined,
            sidecarWsUrl: 'ws://localhost:8321/ws',
            switchOverlayMode: vi.fn().mockRejectedValue(switchError),
        };
        registerOverlayIpcHandlers(options);
        const overlayHandler = getRegisteredHandler(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT);
        await expect(overlayHandler({}, 'prompt-input')).rejects.toThrow('window switch failed');
        expect(currentVariant).toBe('compact');
        expect(send).toHaveBeenCalledWith(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR, {
            message: 'window switch failed',
        });
        expect(consoleErrorSpy).toHaveBeenCalledWith('[overlayHandlers] Failed to set minimized overlay variant:', switchError);
    });
});
