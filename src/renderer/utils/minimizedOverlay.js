export function getVoiceTurnRevealVariant({ minimizedVariant, overlayMode, sessionMode, }) {
    if (sessionMode !== 'active' || overlayMode !== 'minimized' || minimizedVariant !== 'compact') {
        return null;
    }
    return 'prompt-response';
}
export function getAutoAdvanceMinimizedVariant({ errorMessage, isMinimizedPromptComposing, latestResponseText, minimizedVariant, overlayMode, sessionMode, }) {
    if (sessionMode !== 'active' || overlayMode !== 'minimized' || minimizedVariant === 'compact') {
        return null;
    }
    const hasResponseText = latestResponseText !== null && latestResponseText.length > 0;
    const shouldShowResponse = !isMinimizedPromptComposing && (errorMessage !== null || hasResponseText);
    const nextVariant = shouldShowResponse ? 'prompt-response' : 'prompt-input';
    return nextVariant === minimizedVariant ? null : nextVariant;
}
export function getVoiceTurnCompleteVariant({ errorMessage, hasResponseText, isAudioPlaying, isSubmitting, minimizedVariant, overlayMode, sessionMode, }) {
    if (sessionMode !== 'active' ||
        overlayMode !== 'minimized' ||
        minimizedVariant !== 'prompt-response' ||
        isSubmitting ||
        isAudioPlaying ||
        errorMessage !== null ||
        !hasResponseText) {
        return null;
    }
    return 'compact';
}
