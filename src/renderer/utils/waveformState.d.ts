export type WaveformVisualState = 'idle' | 'processing' | 'user' | 'assistant';
export type WaveformBars = readonly number[];
export declare const WAVEFORM_BAR_COUNT = 28;
interface SmoothWaveformBarsOptions {
    attack?: number;
    noiseFloor?: number;
    release?: number;
}
export interface WaveformPresentationInput {
    assistantAudioLevel: number;
    assistantWaveformBars: WaveformBars;
    isAssistantSpeaking: boolean;
    isProcessing: boolean;
    isUserSpeaking: boolean;
    userAudioLevel: number;
    userWaveformBars: WaveformBars;
}
export interface WaveformPresentation {
    bars: WaveformBars;
    state: WaveformVisualState;
}
export declare function resolveWaveformPresentation(input: WaveformPresentationInput): WaveformPresentation;
export declare function createWaveformBars(barCount?: number): number[];
export declare function reduceFrequencyDataToWaveformBars(frequencyData: Uint8Array<ArrayBufferLike>, barCount?: number): number[];
export declare function smoothWaveformBars(previousBars: WaveformBars, nextBars: WaveformBars, options?: SmoothWaveformBarsOptions): number[];
export declare function getWaveformActivityLevel(bars: WaveformBars): number;
export declare function resampleWaveformBars(bars: WaveformBars, targetCount: number): number[];
export {};
