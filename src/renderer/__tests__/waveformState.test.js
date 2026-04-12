import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VoiceWaveform from '../components/VoiceWaveform';
import { createWaveformBars, reduceFrequencyDataToWaveformBars, resolveWaveformPresentation, smoothWaveformBars, } from '../utils/waveformState';
describe('resolveWaveformPresentation', () => {
    it('prioritises user speech over assistant playback and processing', () => {
        expect(resolveWaveformPresentation({
            assistantAudioLevel: 0.5,
            assistantWaveformBars: [0.12, 0.08, 0.05],
            isAssistantSpeaking: true,
            isProcessing: true,
            isUserSpeaking: true,
            userAudioLevel: 0.32,
            userWaveformBars: [0.2, 0.32, 0.18],
        })).toEqual({
            bars: [0.2, 0.32, 0.18],
            state: 'user',
        });
    });
    it('uses assistant state while AI audio is playing', () => {
        expect(resolveWaveformPresentation({
            assistantAudioLevel: 0.04,
            assistantWaveformBars: [0.04, 0.09, 0.16],
            isAssistantSpeaking: true,
            isProcessing: false,
            isUserSpeaking: false,
            userAudioLevel: 0,
            userWaveformBars: [0, 0, 0],
        })).toEqual({
            bars: [0.04, 0.09, 0.16],
            state: 'assistant',
        });
    });
    it('uses the most active non-speaking bars for processing and idle states', () => {
        expect(resolveWaveformPresentation({
            assistantAudioLevel: 0,
            assistantWaveformBars: [0.05, 0.03, 0.01],
            isAssistantSpeaking: false,
            isProcessing: true,
            isUserSpeaking: false,
            userAudioLevel: 0.22,
            userWaveformBars: [0.08, 0.22, 0.11],
        })).toEqual({
            bars: [0.08, 0.22, 0.11],
            state: 'processing',
        });
        expect(resolveWaveformPresentation({
            assistantAudioLevel: 0.18,
            assistantWaveformBars: [0.05, 0.18, 0.12],
            isAssistantSpeaking: false,
            isProcessing: false,
            isUserSpeaking: false,
            userAudioLevel: 0,
            userWaveformBars: [0, 0, 0],
        })).toEqual({
            bars: [0.05, 0.18, 0.12],
            state: 'idle',
        });
    });
});
describe('waveform helpers', () => {
    it('reduces analyser bins into non-zero waveform bars', () => {
        const bars = reduceFrequencyDataToWaveformBars(new Uint8Array([0, 12, 36, 72, 108, 144, 180, 216, 255]), 4);
        expect(bars).toHaveLength(4);
        expect(Math.max(...bars)).toBeGreaterThan(0.55);
        expect(bars[3]).toBeGreaterThanOrEqual(bars[0]);
    });
    it('smooths waveform decay instead of dropping bars immediately', () => {
        expect(smoothWaveformBars([0.4, 0.3, 0.2], createWaveformBars(3), {
            attack: 0.4,
            release: 0.15,
        })).toEqual([0.34, 0.255, 0.17]);
    });
});
describe('VoiceWaveform', () => {
    it('renders a compact accessible canvas with the current state', () => {
        const markup = renderToStaticMarkup(createElement(VoiceWaveform, {
            bars: [0.1, 0.22, 0.16, 0.08],
            compact: true,
            label: 'Compact speech waveform in assistant mode',
            state: 'assistant',
        }));
        expect(markup).toContain('data-state="assistant"');
        expect(markup).toContain('aria-label="Compact speech waveform in assistant mode"');
        expect(markup).toContain('h-8');
    });
});
