import { desktopCapturer } from 'electron';
const CAPTURE_THUMBNAIL_SIZE = {
    width: 1920,
    height: 1080,
};
function isCapturableSource(source) {
    return source.name.trim().length > 0 && !source.name.includes('Delfin');
}
export async function getActiveWindowSource() {
    // Try window-level capture first (works on native Linux / macOS / Windows).
    const windowSources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: CAPTURE_THUMBNAIL_SIZE,
    });
    const windowSource = windowSources.find(isCapturableSource);
    if (windowSource !== undefined) {
        return windowSource;
    }
    // WSL 2 (and some Linux compositors) return an empty window list because
    // Electron's desktopCapturer cannot enumerate native Windows windows from
    // inside the WSL VM.  Fall back to the primary screen source instead.
    const screenSources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: CAPTURE_THUMBNAIL_SIZE,
    });
    const screenSource = screenSources.find(isCapturableSource);
    if (screenSource === undefined) {
        throw new Error('No capturable source found (tried window and screen types).');
    }
    return screenSource;
}
