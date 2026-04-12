import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Clock, Minimize2, Square } from 'lucide-react';
import delfinLogo from '../assets/logo.png';
import { useSessionStore } from '../stores/sessionStore';
import SessionConversation from './SessionConversation';
import SessionPromptComposer from './SessionPromptComposer';
import VoiceWaveform from './VoiceWaveform';
function formatElapsedTime(startTime) {
    if (startTime === null)
        return '0:00';
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
function SessionTimer({ startTime }) {
    const [elapsed, setElapsed] = useState(formatElapsedTime(startTime));
    useEffect(() => {
        setElapsed(formatElapsedTime(startTime));
        if (startTime === null)
            return;
        const interval = setInterval(() => {
            setElapsed(formatElapsedTime(startTime));
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);
    return (_jsxs("div", { className: "flex items-center gap-2 text-sm text-[var(--text-muted)]", children: [_jsx(Clock, { size: 16 }), _jsx("span", { className: "font-medium tabular-nums", children: elapsed })] }));
}
export default function ExpandedSessionView({ captureSourceLabel, errorMessage, isAudioPlaying, isSubmitting, isMicListening, isMicMuted, messages, sessionName, onMinimize, onStop, onSubmitPrompt, onToggleVadListening, showVoiceWaveform, sidecarStatus, vadListeningEnabled, waveformBars, waveformState, }) {
    const sessionStartTime = useSessionStore((state) => state.sessionStartTime);
    return (_jsxs("div", { className: "flex h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]", children: [_jsx("header", { className: "border-b border-[var(--border-soft)] bg-[var(--bg-surface)] px-6 py-3", children: _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("img", { alt: "Delfin logo", className: "h-14 w-14 object-contain", src: delfinLogo }), _jsxs("div", { children: [_jsx("h1", { className: "font-display text-3xl font-bold tracking-tight text-[var(--primary)]", children: "Delfin" }), _jsx("p", { className: "text-sm text-[var(--text-secondary)]", children: "Your intelligent study companion." })] })] }), _jsx("div", { className: "rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface-2)] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]", children: sidecarStatus.connected ? 'Sidecar Connected' : 'Sidecar Disconnected' })] }) }), _jsxs("div", { className: "flex min-h-0 flex-1", children: [_jsxs("main", { className: "flex min-w-0 flex-1 flex-col border-r border-[var(--border-soft)]", children: [_jsx("div", { className: "min-h-0 flex-1 overflow-hidden", children: _jsx(SessionConversation, { className: "h-full", emptyMessage: "Ask about the current screen to start a conversation with Delfin.", isAudioPlaying: isAudioPlaying, isSubmitting: isSubmitting, messages: messages }) }), _jsx("div", { className: "border-t border-[var(--border-soft)] bg-[var(--bg-surface)] p-4", children: _jsx(SessionPromptComposer, { className: "flex items-center gap-3", isSubmitting: isSubmitting, onSubmitPrompt: onSubmitPrompt, placeholder: "Ask about what's on screen", submitLabel: "Ask" }) })] }), _jsxs("aside", { className: "flex w-[22rem] shrink-0 flex-col gap-4 bg-[var(--bg-app-soft)] p-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-display text-2xl font-semibold leading-tight text-[var(--text-primary)]", children: sessionName }), _jsx("div", { className: "mt-4 inline-flex rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3", children: _jsx(SessionTimer, { startTime: sessionStartTime }) })] }), _jsxs("section", { className: "rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-sm", children: [_jsx("p", { className: "text-xs font-medium uppercase tracking-[0.22em] text-[var(--text-muted)]", children: "Speech" }), _jsx("p", { className: "mt-3 text-sm leading-relaxed text-[var(--text-secondary)]", children: isMicListening
                                            ? isMicMuted
                                                ? 'Microphone is ready, but listening is currently paused.'
                                                : 'Microphone is active and listening for your voice.'
                                            : 'Microphone is initialising.' }), _jsxs("div", { className: "mt-4 flex flex-wrap gap-2 text-xs", children: [_jsx("span", { className: "rounded-full bg-[var(--bg-surface-2)] px-3 py-1 text-[var(--text-secondary)]", children: vadListeningEnabled ? 'Speech On' : 'Speech Off' }), isAudioPlaying ? (_jsx("span", { className: "rounded-full bg-[var(--primary-soft)] px-3 py-1 text-[var(--primary)]", children: "Speaking" })) : null] }), showVoiceWaveform ? (_jsx("div", { className: "mt-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface-2)] px-3 py-2", children: _jsx(VoiceWaveform, { bars: waveformBars, label: `Speech waveform in ${waveformState} mode`, state: waveformState }) })) : null] }), _jsxs("section", { className: "rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-sm", children: [_jsx("p", { className: "text-xs font-medium uppercase tracking-[0.22em] text-[var(--text-muted)]", children: "Current Capture" }), _jsx("p", { className: "mt-3 text-sm leading-relaxed text-[var(--text-secondary)]", children: captureSourceLabel ?? 'No frame captured yet. Your next prompt will capture the foreground window.' })] }), errorMessage !== null ? (_jsxs("section", { className: "rounded-[1.75rem] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5", children: [_jsx("p", { className: "text-xs font-medium uppercase tracking-[0.22em] text-[var(--danger)]", children: "Latest Error" }), _jsx("p", { className: "mt-3 text-sm leading-relaxed text-[var(--danger)]", children: errorMessage })] })) : null, _jsxs("div", { className: "mt-auto flex flex-col gap-3", children: [_jsx("button", { className: "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", onClick: onToggleVadListening, type: "button", children: vadListeningEnabled ? 'Toggle Speech Off' : 'Toggle Speech On' }), _jsxs("button", { "aria-label": "Minimize to overlay", className: "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", onClick: onMinimize, type: "button", children: [_jsx(Minimize2, { size: 16 }), "Minimize"] }), _jsxs("button", { "aria-label": "End session", className: "flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--danger)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--danger)]/80", onClick: onStop, type: "button", children: [_jsx(Square, { size: 14, fill: "currentColor" }), "End Session"] })] })] })] })] }));
}
