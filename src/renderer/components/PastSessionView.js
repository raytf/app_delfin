import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowLeft, Clock, Trash2 } from 'lucide-react';
import delfinLogo from '../assets/logo.png';
import SessionConversation from './SessionConversation';
function formatDuration(startedAt, endedAt) {
    const end = endedAt ?? Date.now();
    const durationMs = end - startedAt;
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours > 0) {
        return `${hours}h ${remainingMins}m`;
    }
    return `${minutes}m`;
}
function formatSessionDate(timestamp) {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(new Date(timestamp));
}
export default function PastSessionView({ messages, onBack, onDelete, session, }) {
    const sessionName = session.sessionName || session.sourceLabel || 'Untitled Session';
    return (_jsxs("div", { className: "flex h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)]", children: [_jsx("header", { className: "border-b border-[var(--border-soft)] bg-[var(--bg-surface)] px-6 py-5", children: _jsxs("div", { className: "relative flex items-center justify-center", children: [_jsxs("div", { className: "absolute left-0 flex items-center gap-3", children: [_jsxs("button", { className: "inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]", onClick: onBack, type: "button", children: [_jsx(ArrowLeft, { size: 16 }), "Back"] }), _jsxs("button", { className: "inline-flex cursor-pointer items-center gap-2 rounded-full border border-red-200 bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50", onClick: onDelete, type: "button", children: [_jsx(Trash2, { size: 16 }), "Delete"] })] }), _jsxs("div", { className: "flex items-center justify-center gap-3", children: [_jsx("img", { alt: "Delfin logo", className: "h-14 w-14 object-contain", src: delfinLogo }), _jsx("h1", { className: "font-display text-3xl font-bold tracking-tight text-[var(--primary)]", children: "Delfin" })] })] }) }), _jsxs("div", { className: "flex min-h-0 flex-1", children: [_jsx("main", { className: "flex min-w-0 flex-1 flex-col border-r border-[var(--border-soft)]", children: _jsx("div", { className: "min-h-0 flex-1 overflow-hidden", children: _jsx(SessionConversation, { className: "h-full", emptyMessage: "No conversation was saved for this session.", isSubmitting: false, messages: messages }) }) }), _jsxs("aside", { className: "flex w-[21rem] shrink-0 flex-col bg-[var(--bg-app-soft)] p-6", children: [_jsx("h2", { className: "mt-3 font-display text-2xl font-semibold leading-tight text-[var(--text-primary)]", children: sessionName }), _jsxs("div", { className: "mt-4 inline-flex w-fit items-center gap-2 rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]", children: [_jsx(Clock, { size: 16 }), _jsx("span", { className: "font-medium", children: formatDuration(session.startedAt, session.endedAt) })] }), _jsxs("div", { className: "mt-5 rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-sm", children: [_jsx("p", { className: "text-xs font-medium uppercase tracking-[0.24em] text-[var(--text-muted)]", children: "Session Details" }), _jsxs("dl", { className: "mt-4 space-y-4 text-sm", children: [_jsxs("div", { children: [_jsx("dt", { className: "text-[var(--text-muted)]", children: "Messages" }), _jsx("dd", { className: "mt-1 font-medium text-[var(--text-primary)]", children: session.messageCount })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-[var(--text-muted)]", children: "Started" }), _jsx("dd", { className: "mt-1 font-medium text-[var(--text-primary)]", children: formatSessionDate(session.startedAt) })] }), session.endedAt !== null ? (_jsxs("div", { children: [_jsx("dt", { className: "text-[var(--text-muted)]", children: "Ended" }), _jsx("dd", { className: "mt-1 font-medium text-[var(--text-primary)]", children: formatSessionDate(session.endedAt) })] })) : null] })] })] })] })] }));
}
