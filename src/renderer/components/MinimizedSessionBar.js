import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDown, Loader2, Maximize2, MessageCircle, Mic, MicOff, Square, Volume2 } from 'lucide-react';
import MinimizedPromptPanel from './MinimizedPromptPanel';
import VoiceWaveform from './VoiceWaveform';
export default function MinimizedSessionBar({ errorMessage, isAudioPlaying, isSubmitting, isMicListening, isMicMuted, latestResponseText, minimizedVariant, onAskAnother, onOpen, onSetPromptOpen, onSubmitPrompt, onStop, onToggleVadListening, showVoiceWaveform, vadListeningEnabled, waveformBars, waveformState, }) {
    const isPromptOpen = minimizedVariant !== 'compact';
    const isResponseMode = minimizedVariant === 'prompt-response';
    const statusLabel = getMinimizedStatusLabel({
        isAudioPlaying,
        isMicListening,
        isMicMuted,
        isPromptOpen,
        isResponseMode,
        isSubmitting,
    });
    return (_jsx("div", { className: "drag-region flex h-screen overflow-hidden items-center justify-center text-[var(--text-primary)]", children: _jsxs("div", { className: `flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)]/95 shadow-xl ${isPromptOpen ? 'p-3' : 'px-3 py-3'}`, children: [isPromptOpen ? (_jsxs(_Fragment, { children: [_jsx(VoiceStatusHeader, { compact: false, showVoiceWaveform: showVoiceWaveform, statusLabel: statusLabel, vadListeningEnabled: vadListeningEnabled, waveformBars: waveformBars, waveformState: waveformState, onToggleVadListening: onToggleVadListening }), _jsx("div", { className: "mt-3 flex min-h-0 flex-1 flex-col overflow-hidden", children: _jsx(MinimizedPromptPanel, { errorMessage: errorMessage, isSubmitting: isSubmitting, isShowingResponse: isResponseMode, latestResponseText: latestResponseText, onSubmitPrompt: onSubmitPrompt }) })] })) : (_jsx(_Fragment, { children: _jsx(VoiceStatusHeader, { compact: true, showVoiceWaveform: showVoiceWaveform, statusLabel: statusLabel, vadListeningEnabled: vadListeningEnabled, waveformBars: waveformBars, waveformState: waveformState, onToggleVadListening: onToggleVadListening }) })), _jsx(ActionRow, { isPromptOpen: isPromptOpen, isResponseMode: isResponseMode, minimizedVariant: minimizedVariant, onAskAnother: onAskAnother, onOpen: onOpen, onSetPromptOpen: onSetPromptOpen, onStop: onStop })] }) }));
}
function VoiceStatusHeader({ compact = false, onToggleVadListening, showVoiceWaveform, statusLabel, vadListeningEnabled, waveformBars, waveformState, }) {
    return (_jsxs("div", { className: `no-drag shrink-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface-2)]/80 shadow-sm ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`, children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-2 text-[10px] text-[var(--text-muted)]", children: [_jsxs("span", { className: `inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${getCompactStatusClasses(waveformState)}`, children: [waveformState === 'processing' ? _jsx(Loader2, { className: "animate-spin", size: 12 }) : waveformState === 'assistant' ? _jsx(Volume2, { size: 12 }) : vadListeningEnabled ? _jsx(Mic, { size: 12 }) : _jsx(MicOff, { size: 12 }), _jsx("span", { className: "truncate", children: statusLabel })] }), _jsx("span", { className: "truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]", children: compact ? 'voice' : 'live voice' })] }), _jsx("button", { "aria-label": vadListeningEnabled ? 'Pause speech listening' : 'Resume speech listening', className: "no-drag flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", onClick: onToggleVadListening, type: "button", children: vadListeningEnabled ? _jsx(Mic, { size: 16 }) : _jsx(MicOff, { size: 16 }) })] }), showVoiceWaveform ? (_jsx("div", { className: compact ? 'mt-2' : 'mt-2.5', children: _jsx(VoiceWaveform, { bars: waveformBars, compact: compact, label: `${compact ? 'Compact' : 'Expanded'} speech waveform in ${waveformState} mode`, state: waveformState }) })) : null] }));
}
function ActionRow({ isPromptOpen, isResponseMode, minimizedVariant, onAskAnother, onOpen, onSetPromptOpen, onStop, }) {
    return (_jsxs("div", { className: "mt-3 flex w-full shrink-0 items-center gap-2", children: [isResponseMode ? (_jsx("button", { "aria-label": "Ask another question", className: "no-drag min-w-0 flex-1 cursor-pointer rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", onClick: onAskAnother, type: "button", children: "Ask another" })) : !isPromptOpen ? (_jsxs("button", { "aria-label": "Ask Delfin", className: "no-drag flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--primary-hover)]", onClick: () => onSetPromptOpen(true), type: "button", children: [_jsx(MessageCircle, { size: 16 }), _jsx("span", { children: "Ask" })] })) : null, isPromptOpen ? (_jsx("button", { "aria-label": "Collapse", className: "no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", onClick: () => onSetPromptOpen(false), type: "button", children: _jsx(ChevronDown, { size: 18 }) })) : null, minimizedVariant !== 'prompt-response' || isPromptOpen ? (_jsx("button", { "aria-label": "Expand session", className: "no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", onClick: onOpen, type: "button", children: _jsx(Maximize2, { size: 18 }) })) : null, _jsx("button", { "aria-label": "End session", className: "no-drag flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:bg-[var(--danger)]/80", onClick: onStop, type: "button", children: _jsx(Square, { size: 14, fill: "currentColor" }) })] }));
}
function getMinimizedStatusLabel(input) {
    if (!input.isMicListening) {
        return 'Starting';
    }
    if (input.isMicMuted) {
        return 'Speech paused';
    }
    if (input.isSubmitting) {
        return 'Thinking';
    }
    if (input.isAudioPlaying) {
        return 'AI speaking';
    }
    if (input.isPromptOpen && input.isResponseMode) {
        return 'Ready';
    }
    return 'Listening';
}
function getCompactStatusClasses(state) {
    switch (state) {
        case 'user':
            return 'bg-[var(--success-soft)] text-[var(--success)]';
        case 'assistant':
            return 'bg-[var(--primary-soft)] text-[var(--primary)]';
        case 'processing':
            return 'bg-[var(--warning-soft)] text-[var(--warning)]';
        case 'idle':
            return 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)]';
    }
}
