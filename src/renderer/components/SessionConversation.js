import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Layers3, Mic, User } from 'lucide-react';
import delfinLogo from '../assets/logo-alt.png';
function DelfinAvatar() {
    return (_jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]", children: _jsx("img", { alt: "Delfin", className: "h-6 w-6 object-contain", src: delfinLogo }) }));
}
function UserAvatar() {
    return (_jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-muted)]", children: _jsx(User, { size: 16 }) }));
}
export default function SessionConversation({ className, emptyMessage, isAudioPlaying, isSubmitting, messages, }) {
    const scrollContainerRef = useRef(null);
    const latestAssistantIndex = (() => {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            if (messages[index]?.role === 'assistant') {
                return index;
            }
        }
        return -1;
    })();
    const [selectedImage, setSelectedImage] = useState(null);
    const [loadingImageMessageId, setLoadingImageMessageId] = useState(null);
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container === null) {
            return;
        }
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages, isSubmitting]);
    if (messages.length === 0) {
        return (_jsx("div", { className: `flex items-center justify-center p-8 ${className ?? ''}`, children: _jsxs("div", { className: "max-w-sm text-center", children: [_jsx("div", { className: "mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)]", children: _jsx("img", { alt: "Delfin", className: "h-14 w-14 object-contain", src: delfinLogo }) }), _jsx("p", { className: "text-sm leading-relaxed text-[var(--text-muted)]", children: emptyMessage })] }) }));
    }
    return (_jsxs("div", { className: `flex flex-col ${className ?? ''}`, children: [_jsx("div", { className: "flex-1 space-y-4 overflow-y-auto p-4", ref: scrollContainerRef, children: messages.map((message) => {
                    const isUser = message.role === 'user';
                    const isThinking = message.content.length === 0;
                    const showSpeakingBadge = !isUser &&
                        isAudioPlaying &&
                        latestAssistantIndex >= 0 &&
                        messages[latestAssistantIndex]?.id === message.id;
                    return (_jsxs("article", { className: `flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`, children: [isUser ? _jsx(UserAvatar, {}) : _jsx(DelfinAvatar, {}), _jsxs("div", { className: `flex max-w-[75%] flex-col ${isUser ? 'items-end' : 'items-start'}`, children: [_jsx("span", { className: "mb-1 text-xs text-[var(--text-muted)]", children: isUser ? 'You' : 'Delfin' }), _jsxs("div", { className: `rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser
                                            ? 'bg-[var(--primary)] text-white'
                                            : 'border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-primary)]'}`, children: [showSpeakingBadge ? (_jsx("p", { className: "mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--primary)]", children: "Speaking" })) : null, isThinking ? (_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "h-2 w-2 animate-pulse rounded-full bg-current opacity-60" }), _jsx("span", { className: "h-2 w-2 animate-pulse rounded-full bg-current opacity-60 [animation-delay:150ms]" }), _jsx("span", { className: "h-2 w-2 animate-pulse rounded-full bg-current opacity-60 [animation-delay:300ms]" })] })) : message.isVoiceTurn ? (_jsxs("div", { className: "inline-flex items-center gap-2 rounded-full bg-black/10 px-3 py-1 text-xs font-medium", children: [_jsx(Mic, { size: 14 }), "Voice input"] })) : (_jsx("p", { className: "whitespace-pre-wrap", children: message.content }))] }), isUser && message.imagePath !== undefined && (_jsxs("button", { className: "mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", disabled: loadingImageMessageId === message.id, onClick: () => {
                                            void handleViewCapture(message);
                                        }, type: "button", children: [_jsx(Layers3, { size: 12 }), loadingImageMessageId === message.id ? 'Loading...' : 'Context'] }))] })] }, message.id));
                }) }), selectedImage !== null && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm", onClick: () => setSelectedImage(null), children: _jsxs("div", { className: "relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-2xl", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3", children: [_jsx("p", { className: "text-sm font-medium text-[var(--text-primary)]", children: "Question Context" }), _jsx("button", { className: "cursor-pointer rounded-lg px-3 py-1 text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)]", onClick: () => setSelectedImage(null), type: "button", children: "Close" })] }), _jsx("div", { className: "max-h-[80vh] overflow-auto bg-[var(--bg-surface-2)] p-4", children: _jsx("img", { alt: "Visual context for the selected question", className: "mx-auto h-auto max-w-full rounded-lg", src: selectedImage }) })] }) }))] }));
    async function handleViewCapture(message) {
        if (message.imagePath === undefined) {
            return;
        }
        setLoadingImageMessageId(message.id);
        try {
            const imageSrc = await window.api.getSessionMessageImage({
                imagePath: message.imagePath,
            });
            setSelectedImage(imageSrc);
        }
        finally {
            setLoadingImageMessageId(null);
        }
    }
}
