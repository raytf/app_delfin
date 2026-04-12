import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import SessionPromptComposer from './SessionPromptComposer';
export default function MinimizedPromptPanel({ errorMessage, isSubmitting, isShowingResponse, latestResponseText, onSubmitPrompt, }) {
    const [isComposing, setIsComposing] = useState(!isShowingResponse);
    const hasResponseText = latestResponseText !== null && latestResponseText.length > 0;
    const isLoadingOnly = isSubmitting && !hasResponseText && errorMessage === null;
    useEffect(() => {
        if (isSubmitting) {
            setIsComposing(false);
        }
    }, [isSubmitting]);
    useEffect(() => {
        setIsComposing(!isShowingResponse);
    }, [isShowingResponse]);
    if (isComposing) {
        return (_jsx(SessionPromptComposer, {
            autoFocus: true, className: "flex items-center gap-2", isSubmitting: isSubmitting, onSubmitPrompt: (text) => {
                onSubmitPrompt(text);
            }, placeholder: "Ask Delfin", submitLabel: "Send"
        }));
    }
    if (isLoadingOnly) {
        return (_jsx("div", { className: "flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-sm", children: _jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:0ms]" }), _jsx("span", { className: "h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" }), _jsx("span", { className: "h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:300ms]" })] }), _jsx("p", { className: "text-sm font-medium text-[var(--text-secondary)]", children: "Thinking about what you asked\u2026" })] }) }));
    }
    return (_jsx("div", { className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: _jsx(StreamingResponseBody, { errorMessage: errorMessage, hasResponseText: hasResponseText, isSubmitting: isSubmitting, latestResponseText: latestResponseText }) }));
}
function StreamingResponseBody({ errorMessage, hasResponseText, isSubmitting, latestResponseText, }) {
    const [scrollContainer, setScrollContainer] = useState(null);
    useEffect(() => {
        if (scrollContainer === null) {
            return;
        }
        const animationFrameId = window.requestAnimationFrame(() => {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        });
        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [latestResponseText, scrollContainer]);
    return (_jsx("div", { className: "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-4 shadow-sm", children: errorMessage !== null ? (_jsx("p", { className: "text-sm leading-6 text-[var(--danger)]", children: errorMessage })) : latestResponseText !== null && latestResponseText.length > 0 ? (_jsx("div", { className: "no-drag min-h-0 flex-1 overflow-y-auto text-sm leading-6 text-[var(--text-primary)]", ref: setScrollContainer, children: _jsx("p", { className: "whitespace-pre-wrap break-words", children: latestResponseText }) })) : (_jsx("p", { className: "text-sm leading-6 text-[var(--text-muted)]", children: "Ask about what's on screen to get a response here." })) }));
}
