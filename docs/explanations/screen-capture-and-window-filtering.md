# Screen Capture and Window Filtering

## How desktopCapturer Works

Electron's `desktopCapturer` asks the OS for a list of open windows (or screens), each with a thumbnail image already rendered. Think of it as a snapshot of everything visible at that moment, handed back as an array of `DesktopCapturerSource` objects. Each source has:

- `name` — the window title (e.g. `"Google Slides — Lecture 5"`)
- `thumbnail` — a `NativeImage` containing the pixel data at the requested size
- `id` — a platform-specific identifier

```typescript
const sources = await desktopCapturer.getSources({
  types: ['window'],           // 'window' = individual windows; 'screen' = full displays
  thumbnailSize: { width: 1920, height: 1080 },
})
// sources[0] is the most recently focused window (roughly z-order)
```

---

## The Self-Capture Problem

The overlay is itself a window. In minimized mode it's `alwaysOnTop: true`, which means it appears at the front of the z-order — exactly where `desktopCapturer` would pick it first. Without filtering, every capture would be a screenshot of the sidebar itself, not the slide behind it.

The fix is a single predicate in `focusDetector.ts`:

```typescript
function isCapturableSource(source: DesktopCapturerSource): boolean {
  return source.name.trim().length > 0 && !source.name.includes('Delfin')
}
```

Any window whose title contains `'Delfin'` is excluded. The first source that passes this filter is taken as the foreground window.

> **This is why the window title matters.** The `title: 'Delfin'` property set in `overlayWindow.ts` is not just cosmetic — the capture filter depends on it.

---

## The WSL2 Fallback

On WSL2, `desktopCapturer` with `types: ['window']` returns an **empty array**. This is because Windows GUI windows are rendered by the Windows compositor, but Electron is running inside the Linux VM and cannot enumerate them. The function falls back to screen-level capture:

```typescript
// Try windows first
const windowSources = await desktopCapturer.getSources({ types: ['window'], ... })
const windowSource = windowSources.find(isCapturableSource)
if (windowSource) return windowSource

// WSL2 fallback: capture the whole screen
const screenSources = await desktopCapturer.getSources({ types: ['screen'], ... })
const screenSource = screenSources.find(isCapturableSource)
if (!screenSource) throw new Error('No capturable source found.')
return screenSource
```

Screen capture on WSL2 captures the full Windows desktop, which is better than nothing.

---

## The Blank Image Problem

Even when `desktopCapturer` returns a source with the right window title and a non-zero size, WSL2's compositor sometimes returns a valid-sized but completely **black thumbnail**. The pixel readback path (XComposite) isn't supported for Windows-side GUI apps in WSLg.

Sending a black image to Gemma 4 produces a useless *"I see nothing"* response. So `captureService.ts` samples a 4×4 grid of pixels across the image and rejects it if everything is near-black:

```typescript
function isThumbnailBlank(image: NativeImage): boolean {
  const bitmap = image.toBitmap() // raw BGRA, 4 bytes per pixel
  for (const yFrac of [0.2, 0.4, 0.6, 0.8]) {
    for (const xFrac of [0.2, 0.4, 0.6, 0.8]) {
      // sample pixel at (xFrac, yFrac) of image
      // if any RGB channel > 10 → image has real content → return false
    }
  }
  return true // all 16 samples near-black → blank
}
```

16 samples at a 4×4 grid (at 20/40/60/80% of each axis) is fast and catches blank images reliably without inspecting every pixel. If the check fails, a descriptive error is thrown explaining the WSL2 limitation.

---

## Packaging into a CaptureFrame

Once a valid, non-blank source is found:

```typescript
return {
  imageBase64: source.thumbnail.toJPEG(80).toString('base64'),
  //           └── NativeImage → Buffer (JPEG, quality 80) → base64 string
  width:  source.thumbnail.getSize().width,
  height: source.thumbnail.getSize().height,
  capturedAt: Date.now(),
  sourceLabel: source.name,   // shown in the UI ("Google Slides — Lecture 5")
}
```

**JPEG quality 80** is a deliberate trade-off: readable text and diagrams are preserved, but the file size is 3–5× smaller than PNG. The sidecar's `resize_image_blob()` further reduces the image to `MAX_IMAGE_WIDTH` (default: 512 pixels wide) before sending it to the model, capping the vision token budget.

---

## Full Pipeline

```
desktopCapturer.getSources({ types: ['window'] })
  → filter: exclude 'Delfin', exclude empty names
  → if empty → getSources({ types: ['screen'] })   [WSL2 fallback]
  → isThumbnailBlank()  →  throw if all-black       [WSL2 pixel readback guard]
  → thumbnail.toJPEG(80).toString('base64')
  → CaptureFrame { imageBase64, width, height, capturedAt, sourceLabel }
        ↓
  [sent to renderer via 'frame:captured' IPC → shows preview thumbnail]
  [sent to sidecar in WsOutboundMessage.image → resize_image_blob() → model]
```
