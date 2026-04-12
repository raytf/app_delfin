import { registerOverlayIpcHandlers } from './overlayHandlers';
import { registerSessionIpcHandlers } from './sessionHandlers';
import { registerSidecarBridge } from './sidecarBridge';
export function registerIpcHandlers(options) {
    registerSidecarBridge(options);
    registerOverlayIpcHandlers(options);
    registerSessionIpcHandlers(options);
}
