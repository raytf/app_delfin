import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Clock3, MessageSquare, Trash2 } from 'lucide-react';
function formatDuration(startedAt, endedAt) {
    const end = endedAt ?? Date.now();
    const durationMs = end - startedAt;
    const minutes = Math.floor(durationMs / 60000);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m`;
}
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}
function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1)
        return 'Just now';
    if (minutes < 60)
        return `${minutes}m ago`;
    if (hours < 24)
        return `${hours}h ago`;
    if (days === 1)
        return 'Yesterday';
    if (days < 7)
        return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}
function formatStatus(status) {
    if (status === 'completed')
        return 'Completed';
    if (status === 'failed')
        return 'Ended with issue';
    if (status === 'aborted')
        return 'Stopped early';
    return 'In progress';
}
export default function SessionHistoryCard({ onClick, onDelete, session, variant = 'compact', }) {
    const isDetailed = variant === 'detailed';
    return (_jsxs("article", { className: `group relative rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-sm transition hover:shadow-[0_18px_40px_rgba(20,129,186,0.08)] ${isDetailed ? 'p-6' : 'p-5'} ${onClick !== undefined ? 'cursor-pointer hover:border-[var(--primary)]' : ''}`, onClick: onClick, children: [onDelete !== undefined ? (_jsx("button", { "aria-label": `Delete ${session.sessionName || session.sourceLabel || 'session'}`, className: "absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-0 shadow-sm transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100", onClick: (event) => {
                    event.stopPropagation();
                    onDelete();
                }, type: "button", children: _jsx(Trash2, { size: 14 }) })) : null, _jsxs("div", { children: [_jsx("h3", { className: `font-display text-base font-semibold text-[var(--text-primary)] ${isDetailed ? '' : 'line-clamp-2'}`, children: session.sessionName || session.sourceLabel || 'Untitled Session' }), isDetailed ? (_jsx("p", { className: "mt-2 text-sm text-[var(--text-secondary)]", children: formatStatus(session.status) })) : null] }), isDetailed ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "mt-1", children: _jsx("div", { className: "inline-block rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-medium text-[var(--primary)]", children: formatRelativeTime(session.lastUpdatedAt) }) }), _jsxs("div", { className: "mt-5 grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-2 text-[var(--text-muted)]", children: [_jsx(MessageSquare, { size: 14 }), _jsx("span", { children: "Messages" })] }), _jsx("p", { className: "mt-2 text-lg font-semibold text-[var(--text-primary)]", children: session.messageCount })] }), _jsxs("div", { className: "rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-2 text-[var(--text-muted)]", children: [_jsx(Clock3, { size: 14 }), _jsx("span", { children: "Duration" })] }), _jsx("p", { className: "mt-2 text-lg font-semibold text-[var(--text-primary)]", children: formatDuration(session.startedAt, session.endedAt) })] }), _jsxs("div", { className: "rounded-2xl bg-[var(--bg-surface-2)] px-4 py-3", children: [_jsx("p", { className: "text-[var(--text-muted)]", children: "Started" }), _jsx("p", { className: "mt-2 text-sm font-semibold text-[var(--text-primary)]", children: formatDate(session.startedAt) })] })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mt-4 flex items-center gap-4 text-sm", children: [_jsxs("div", { className: "flex items-center gap-1.5 text-[var(--text-secondary)]", children: [_jsx(MessageSquare, { size: 14, className: "text-[var(--primary)]" }), _jsx("span", { className: "font-medium", children: session.messageCount })] }), _jsxs("div", { className: "flex items-center gap-1.5 text-[var(--text-secondary)]", children: [_jsx(Clock3, { size: 14, className: "text-[var(--primary)]" }), _jsx("span", { className: "font-medium", children: formatDuration(session.startedAt, session.endedAt) })] })] }), _jsx("p", { className: "mt-3 text-xs text-[var(--text-secondary)]", children: formatRelativeTime(session.lastUpdatedAt) })] }))] }));
}
