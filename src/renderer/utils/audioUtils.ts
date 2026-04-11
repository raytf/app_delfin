/**
 * Audio utilities for the voice pipeline.
 *
 * float32ToWavBase64 — encodes a Float32 PCM array (from @ricky0123/vad-web)
 *   into a standard RIFF WAV and returns it as a base64 string ready to be
 *   sent over the WebSocket to the sidecar.
 *
 * decodeAudioChunk — converts a base64-encoded int16 PCM payload (returned by
 *   the sidecar TTS pipeline) into a Web Audio API AudioBuffer for playback.
 */

const WAV_SAMPLE_RATE = 16_000 // Silero VAD outputs 16 kHz
const WAV_BIT_DEPTH = 16
const WAV_CHANNELS = 1

/**
 * Encode Float32 PCM samples (range −1 … +1) into a 16-bit mono RIFF WAV
 * and return the result as a base64 string.
 *
 * @param samples   Float32Array produced by @ricky0123/vad-web onSpeechEnd
 * @param sampleRate  Sample rate of the audio (default: 16 000 Hz)
 */
export function float32ToWavBase64(
  samples: Float32Array,
  sampleRate: number = WAV_SAMPLE_RATE,
): string {
  const numSamples = samples.length
  const byteRate = (sampleRate * WAV_CHANNELS * WAV_BIT_DEPTH) / 8
  const blockAlign = (WAV_CHANNELS * WAV_BIT_DEPTH) / 8
  const dataBytes = numSamples * blockAlign

  // RIFF header = 44 bytes + PCM data
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeString(view, 8, 'WAVE')

  // fmt sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)           // sub-chunk size (PCM = 16)
  view.setUint16(20, 1, true)            // audio format: PCM
  view.setUint16(22, WAV_CHANNELS, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, WAV_BIT_DEPTH, true)

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  // Convert Float32 → Int16 PCM
  const int16Offset = 44
  for (let i = 0; i < numSamples; i++) {
    // Clamp to [-1, 1] then scale to int16 range
    const clamped = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(int16Offset + i * 2, clamped * 0x7fff, true)
  }

  return arrayBufferToBase64(buffer)
}

/**
 * Decode a base64-encoded int16 PCM payload from the sidecar TTS pipeline
 * into a Web Audio API AudioBuffer suitable for gap-free scheduling.
 *
 * @param base64Pcm   base64 string — raw int16 little-endian PCM bytes
 * @param audioCtx    The AudioContext to create the buffer in
 * @param sampleRate  Sample rate of the PCM data (default: 24 000 Hz for kokoro)
 */
export function decodeAudioChunk(
  base64Pcm: string,
  audioCtx: AudioContext,
  sampleRate: number = 24_000,
): AudioBuffer {
  const binaryStr = atob(base64Pcm)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i]! / 0x8000
  }

  const audioBuffer = audioCtx.createBuffer(1, float32.length, sampleRate)
  audioBuffer.getChannelData(0).set(float32)
  return audioBuffer
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}
