/**
 * useVAD — wraps the locally hosted vad-web MicVAD runtime for always-on
 * voice detection.
 *
 * When `enabled` is true the hook initialises a MicVAD instance on mount and
 * destroys it on unmount.  When the user finishes speaking, `onSpeechEnd` is
 * called with a base64-encoded WAV string ready to be sent to the sidecar.
 *
 * Barge-in protection (two layers):
 *   1. `raiseThreshold()` lifts positiveSpeechThreshold 0.50 → 0.92 while the
 *      AI is speaking, making accidental triggers much harder.
 *   2. A BARGE_IN_GRACE_MS window starts when `raiseThreshold()` is called;
 *      any `onSpeechStart` events fired during that window are silently dropped,
 *      preventing the mic from picking up the AI's own TTS voice.
 */
import { type WaveformBars } from '../utils/waveformState';
export interface UseVADOptions {
    /** Set to false to skip initialisation entirely (VOICE_ENABLED=false). */
    enabled: boolean;
    /** Called on every speech segment with a base64 WAV (16 kHz, 16-bit mono). */
    onSpeechEnd: (wavBase64: string) => void;
    /** Optional: called when the VAD detects speech has started. */
    onSpeechStart?: () => void;
}
export interface UseVADReturn {
    /** True once the MicVAD instance is running and listening. */
    isListening: boolean;
    /** True while the VAD is inside an active detected speech segment. */
    isUserSpeaking: boolean;
    /** True if the user has manually muted the mic via toggleMute(). */
    isMuted: boolean;
    /** Smoothed microphone activity level, normalized to 0..1 during speech. */
    userAudioLevel: number;
    /** Smoothed per-bar microphone waveform data for renderer-local visualisation. */
    userWaveformBars: WaveformBars;
    /** Toggle mic on/off without destroying the VAD instance. */
    toggleMute: () => void;
    /**
     * Raise the speech threshold to 0.92 and start the barge-in grace window.
     * Call this when audio playback begins (onSidecarAudioStart).
     */
    raiseThreshold: () => void;
    /**
     * Lower the speech threshold back to 0.50.
     * Call this when audio playback ends (onSidecarAudioEnd).
     */
    lowerThreshold: () => void;
}
export declare function useVAD({ enabled, onSpeechEnd, onSpeechStart }: UseVADOptions): UseVADReturn;
