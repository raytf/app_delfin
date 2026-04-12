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
/**
 * Encode Float32 PCM samples (range −1 … +1) into a 16-bit mono RIFF WAV
 * and return the result as a base64 string.
 *
 * @param samples   Float32Array produced by @ricky0123/vad-web onSpeechEnd
 * @param sampleRate  Sample rate of the audio (default: 16 000 Hz)
 */
export declare function float32ToWavBase64(samples: Float32Array, sampleRate?: number): string;
/**
 * Decode a base64-encoded int16 PCM payload from the sidecar TTS pipeline
 * into a Web Audio API AudioBuffer suitable for gap-free scheduling.
 *
 * @param base64Pcm   base64 string — raw int16 little-endian PCM bytes
 * @param audioCtx    The AudioContext to create the buffer in
 * @param sampleRate  Sample rate of the PCM data (default: 24 000 Hz for kokoro)
 */
export declare function decodeAudioChunk(base64Pcm: string, audioCtx: AudioContext, sampleRate?: number): AudioBuffer;
