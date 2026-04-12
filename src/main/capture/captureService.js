import { getActiveWindowSource } from './focusDetector';
/**
 * Sample a 4×4 grid of pixels across the image and return true if every
 * sampled pixel is near-black (all channels ≤ 10).
 *
 * In WSL2, desktopCapturer often returns a valid-sized but all-black
 * thumbnail because WSLg's compositor does not support the XComposite
 * pixel-readback path that Electron uses.  Sending a black image to the
 * model produces a useless "I see nothing" response, so we detect and
 * reject it here with a descriptive error.
 *
 * toBitmap() returns raw BGRA data (4 bytes per pixel).
 */
function isThumbnailBlank(image) {
    const { width, height } = image.getSize();
    if (width === 0 || height === 0)
        return true;
    const bitmap = image.toBitmap(); // BGRA, 4 bytes per pixel
    for (const yFrac of [0.2, 0.4, 0.6, 0.8]) {
        for (const xFrac of [0.2, 0.4, 0.6, 0.8]) {
            const x = Math.floor(width * xFrac);
            const y = Math.floor(height * yFrac);
            const offset = (y * width + x) * 4;
            const b = bitmap[offset] ?? 0;
            const g = bitmap[offset + 1] ?? 0;
            const r = bitmap[offset + 2] ?? 0;
            // Any pixel brighter than near-black means the image has real content
            if (r > 10 || g > 10 || b > 10)
                return false;
        }
    }
    return true; // all 16 samples were near-black
}
export async function captureForegroundWindow() {
    const source = await getActiveWindowSource();
    const { width, height } = source.thumbnail.getSize();
    if (width === 0 || height === 0) {
        throw new Error(`Capture source "${source.name}" did not provide a usable thumbnail.`);
    }
    if (isThumbnailBlank(source.thumbnail)) {
        throw new Error(`Screenshot from "${source.name}" is blank (all black). ` +
            'This is a known WSL2 limitation: the display compositor does not support ' +
            'pixel readback via desktopCapturer. ' +
            'Try running the app on native Linux or Windows, or open a Linux GUI app ' +
            '(e.g. a browser) in the same WSLg session so it appears as a capturable window.');
    }
    return {
        imageBase64: source.thumbnail.toJPEG(80).toString('base64'),
        width,
        height,
        capturedAt: Date.now(),
        sourceLabel: source.name,
    };
}
