import type { CaptureFrame } from '../../shared/types'
import { getActiveWindowSource } from './focusDetector'

export async function captureForegroundWindow(): Promise<CaptureFrame> {
  const source = await getActiveWindowSource()
  const { width, height } = source.thumbnail.getSize()

  if (width === 0 || height === 0) {
    throw new Error(`Capture source "${source.name}" did not provide a usable thumbnail.`)
  }

  return {
    imageBase64: source.thumbnail.toJPEG(80).toString('base64'),
    width,
    height,
    capturedAt: Date.now(),
    sourceLabel: source.name,
  }
}
