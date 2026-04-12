import type { MinimizedOverlayVariant, OverlayMode, SessionMode } from '../../shared/types';
interface MinimizedOverlayContext {
    minimizedVariant: MinimizedOverlayVariant;
    overlayMode: OverlayMode;
    sessionMode: SessionMode;
}
interface AutoAdvanceMinimizedVariantContext extends MinimizedOverlayContext {
    errorMessage: string | null;
    isMinimizedPromptComposing: boolean;
    latestResponseText: string | null;
}
interface VoiceTurnCollapseContext extends MinimizedOverlayContext {
    errorMessage: string | null;
    hasResponseText: boolean;
    isAudioPlaying: boolean;
    isSubmitting: boolean;
}
export declare function getVoiceTurnRevealVariant({ minimizedVariant, overlayMode, sessionMode, }: MinimizedOverlayContext): MinimizedOverlayVariant | null;
export declare function getAutoAdvanceMinimizedVariant({ errorMessage, isMinimizedPromptComposing, latestResponseText, minimizedVariant, overlayMode, sessionMode, }: AutoAdvanceMinimizedVariantContext): MinimizedOverlayVariant | null;
export declare function getVoiceTurnCompleteVariant({ errorMessage, hasResponseText, isAudioPlaying, isSubmitting, minimizedVariant, overlayMode, sessionMode, }: VoiceTurnCollapseContext): MinimizedOverlayVariant | null;
export {};
