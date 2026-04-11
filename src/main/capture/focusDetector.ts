import { desktopCapturer, type DesktopCapturerSource } from 'electron'

const CAPTURE_THUMBNAIL_SIZE = {
  width: 1920,
  height: 1080,
} as const

function isCapturableSource(source: DesktopCapturerSource): boolean {
  return source.name.trim().length > 0 && !source.name.includes('Screen Copilot')
}

export async function getActiveWindowSource(): Promise<DesktopCapturerSource> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: CAPTURE_THUMBNAIL_SIZE,
  })

  const source = sources.find(isCapturableSource)

  if (source === undefined) {
    throw new Error('No capturable foreground window found.')
  }

  return source
}
