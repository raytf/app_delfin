import { describe, expect, it } from 'vitest';
import { getAutoAdvanceMinimizedVariant, getVoiceTurnCompleteVariant, getVoiceTurnRevealVariant, } from '../utils/minimizedOverlay';
describe('getVoiceTurnRevealVariant', () => {
    it('reveals prompt-response for a voice turn from minimized compact mode', () => {
        expect(getVoiceTurnRevealVariant({
            minimizedVariant: 'compact',
            overlayMode: 'minimized',
            sessionMode: 'active',
        })).toBe('prompt-response');
    });
    it('does not auto-open outside active minimized compact mode', () => {
        expect(getVoiceTurnRevealVariant({
            minimizedVariant: 'compact',
            overlayMode: 'expanded',
            sessionMode: 'active',
        })).toBeNull();
    });
});
describe('getAutoAdvanceMinimizedVariant', () => {
    it('switches to prompt-response when streamed text arrives', () => {
        expect(getAutoAdvanceMinimizedVariant({
            errorMessage: null,
            isMinimizedPromptComposing: false,
            latestResponseText: 'Streaming answer',
            minimizedVariant: 'prompt-input',
            overlayMode: 'minimized',
            sessionMode: 'active',
        })).toBe('prompt-response');
    });
    it('switches back to prompt-input when there is no visible response content', () => {
        expect(getAutoAdvanceMinimizedVariant({
            errorMessage: null,
            isMinimizedPromptComposing: false,
            latestResponseText: null,
            minimizedVariant: 'prompt-response',
            overlayMode: 'minimized',
            sessionMode: 'active',
        })).toBe('prompt-input');
    });
    it('leaves compact mode unchanged for non-voice auto-advance logic', () => {
        expect(getAutoAdvanceMinimizedVariant({
            errorMessage: null,
            isMinimizedPromptComposing: false,
            latestResponseText: 'Answer should not auto-open compact mode here',
            minimizedVariant: 'compact',
            overlayMode: 'minimized',
            sessionMode: 'active',
        })).toBeNull();
    });
});
describe('getVoiceTurnCompleteVariant', () => {
    it('collapses prompt-response back to compact once processing and playback are complete', () => {
        expect(getVoiceTurnCompleteVariant({
            errorMessage: null,
            hasResponseText: true,
            isAudioPlaying: false,
            isSubmitting: false,
            minimizedVariant: 'prompt-response',
            overlayMode: 'minimized',
            sessionMode: 'active',
        })).toBe('compact');
    });
    it('does not collapse while the assistant is still thinking or speaking', () => {
        expect(getVoiceTurnCompleteVariant({
            errorMessage: null,
            hasResponseText: true,
            isAudioPlaying: true,
            isSubmitting: false,
            minimizedVariant: 'prompt-response',
            overlayMode: 'minimized',
            sessionMode: 'active',
        })).toBeNull();
        expect(getVoiceTurnCompleteVariant({
            errorMessage: null,
            hasResponseText: true,
            isAudioPlaying: false,
            isSubmitting: true,
            minimizedVariant: 'prompt-response',
            overlayMode: 'minimized',
            sessionMode: 'active',
        })).toBeNull();
    });
});
