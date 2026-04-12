import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MinimizedSessionBar from '../components/MinimizedSessionBar';
const baseProps = {
    errorMessage: null,
    isAudioPlaying: false,
    isMicListening: true,
    isMicMuted: false,
    isSubmitting: false,
    latestResponseText: null,
    onAskAnother: () => undefined,
    onOpen: () => undefined,
    onSetPromptOpen: () => undefined,
    onStop: () => undefined,
    onSubmitPrompt: () => undefined,
    onToggleVadListening: () => undefined,
    showVoiceWaveform: true,
    vadListeningEnabled: true,
    waveformBars: [0.12, 0.26, 0.18, 0.08],
    waveformState: 'idle',
};
describe('MinimizedSessionBar', () => {
    it('renders the compact waveform chrome in compact mode', () => {
        const markup = renderToStaticMarkup(createElement(MinimizedSessionBar, {
            ...baseProps,
            minimizedVariant: 'compact',
        }));
        expect(markup).toContain('Compact speech waveform in idle mode');
        expect(markup).toContain('Ask');
    });
    it('keeps the waveform visible in prompt-open input mode', () => {
        const markup = renderToStaticMarkup(createElement(MinimizedSessionBar, {
            ...baseProps,
            minimizedVariant: 'prompt-input',
        }));
        expect(markup).toContain('Expanded speech waveform in idle mode');
        expect(markup).toContain('Collapse');
    });
    it('keeps the waveform visible in prompt-response mode while showing voice actions', () => {
        const markup = renderToStaticMarkup(createElement(MinimizedSessionBar, {
            ...baseProps,
            latestResponseText: 'Here is the latest response',
            minimizedVariant: 'prompt-response',
        }));
        expect(markup).toContain('Expanded speech waveform in idle mode');
        expect(markup).toContain('Ask another');
    });
});
