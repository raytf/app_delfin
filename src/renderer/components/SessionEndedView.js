import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowLeft, CheckCircle, Clock3, MessageSquare } from 'lucide-react';
import delfinLogo from '../assets/logo.png';
function formatDuration(durationMs) {
    const minutes = Math.floor(durationMs / 60000);
    if (minutes < 60) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m`;
}
export default function SessionEndedView({ duration, messageCount, onGoHome, sessionName, }) {
    return (_jsxs("div", { className: "ocean-gradient flex min-h-screen flex-col items-center justify-center px-8 py-12 text-center", children: [_jsxs("div", { className: "relative mb-6", children: [_jsx("div", { className: "flex h-24 w-24 items-center justify-center rounded-full bg-[var(--success-soft)]", children: _jsx(CheckCircle, { size: 48, className: "text-[var(--success)]" }) }), _jsx("img", { alt: "Delfin", className: "absolute -bottom-2 -right-2 h-12 w-12 rounded-full border-4 border-[var(--bg-app)] bg-white object-contain p-1", src: delfinLogo })] }), _jsx("h1", { className: "font-display text-3xl font-bold text-[var(--text-primary)]", children: "Session Complete" }), _jsx("p", { className: "mt-2 text-lg text-[var(--text-secondary)]", children: sessionName }), _jsxs("div", { className: "mt-8 flex items-center gap-6", children: [_jsxs("div", { className: "flex flex-col items-center rounded-2xl bg-[var(--bg-surface)] px-6 py-4 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-2 text-[var(--text-muted)]", children: [_jsx(MessageSquare, { size: 18, className: "text-[var(--primary)]" }), _jsx("span", { className: "text-sm", children: "Questions" })] }), _jsx("p", { className: "mt-1 text-2xl font-bold text-[var(--text-primary)]", children: messageCount })] }), _jsxs("div", { className: "flex flex-col items-center rounded-2xl bg-[var(--bg-surface)] px-6 py-4 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-2 text-[var(--text-muted)]", children: [_jsx(Clock3, { size: 18, className: "text-[var(--primary)]" }), _jsx("span", { className: "text-sm", children: "Duration" })] }), _jsx("p", { className: "mt-1 text-2xl font-bold text-[var(--text-primary)]", children: formatDuration(duration) })] })] }), _jsx("p", { className: "mt-8 max-w-md text-[var(--text-muted)]", children: "Great study session! Your progress has been saved. Keep up the momentum!" }), _jsxs("button", { className: "btn-ocean mt-8 flex cursor-pointer items-center gap-2 rounded-2xl px-6 py-3 text-base font-semibold text-white shadow-lg", onClick: onGoHome, type: "button", children: [_jsx(ArrowLeft, { size: 18 }), "Back to Home"] })] }));
}
