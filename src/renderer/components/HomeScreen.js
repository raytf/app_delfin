import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import delfinLogo from '../assets/logo.png';
import SessionHistoryCard from './SessionHistoryCard';
// Typing effect component
function TypewriterText({ text, className, delay = 0, onComplete, }) {
    const [displayedText, setDisplayedText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [started, setStarted] = useState(delay === 0);
    useEffect(() => {
        if (delay > 0) {
            const timeout = setTimeout(() => setStarted(true), delay);
            return () => clearTimeout(timeout);
        }
    }, [delay]);
    useEffect(() => {
        if (!started)
            return;
        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayedText((prev) => prev + text[currentIndex]);
                setCurrentIndex((prev) => prev + 1);
            }, 40);
            return () => clearTimeout(timeout);
        }
        else if (currentIndex === text.length && onComplete) {
            onComplete();
        }
    }, [currentIndex, text, started, onComplete]);
    if (!started)
        return null;
    return (_jsxs("span", { className: className, children: [displayedText, currentIndex < text.length && (_jsx("span", { className: "animate-pulse text-[var(--primary)]", children: "|" }))] }));
}
// Dolphin wave SVG for decorative element
function WaveDecoration() {
    return (_jsx("div", { className: "pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden opacity-60", children: _jsxs("svg", { className: "absolute -top-1/2 left-1/2 w-[200%] -translate-x-1/2", viewBox: "0 0 1200 200", fill: "none", xmlns: "http://www.w3.org/2000/svg", preserveAspectRatio: "none", children: [_jsx("path", { d: "M0 100 Q150 50 300 100 T600 100 T900 100 T1200 100 V0 H0 Z", fill: "url(#wave-gradient)" }), _jsx("defs", { children: _jsxs("linearGradient", { id: "wave-gradient", x1: "0%", y1: "0%", x2: "0%", y2: "100%", children: [_jsx("stop", { offset: "0%", stopColor: "var(--ocean-bright)", stopOpacity: "0.12" }), _jsx("stop", { offset: "100%", stopColor: "var(--ocean-bright)", stopOpacity: "0" })] }) })] }) }));
}
function StartSessionModal({ isOpen, onClose, onStart }) {
    const [sessionName, setSessionName] = useState('');
    if (!isOpen)
        return null;
    function handleSubmit(e) {
        e.preventDefault();
        onStart(sessionName.trim() || 'Study Session');
        setSessionName('');
    }
    function handleClose() {
        setSessionName('');
        onClose();
    }
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            handleClose();
        }
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm", onClick: handleClose, children: _jsxs("div", { className: "w-full max-w-md rounded-3xl bg-[var(--bg-surface)] p-8 shadow-2xl", onClick: (e) => e.stopPropagation(), children: [_jsx("h2", { className: "text-center font-display text-xl font-semibold text-[var(--text-primary)]", children: "Name your session" }), _jsx("p", { className: "mt-2 text-center text-sm text-[var(--text-muted)]", children: "Give it a name so you can find it later" }), _jsxs("form", { onSubmit: handleSubmit, className: "mt-5", children: [_jsx("input", { autoFocus: true, className: "h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]", onChange: (e) => setSessionName(e.target.value), onKeyDown: handleKeyDown, placeholder: "What are you studying today?", type: "text", value: sessionName }), _jsxs("div", { className: "mt-5 flex items-center justify-center gap-3", children: [_jsx("button", { className: "cursor-pointer rounded-xl px-4 py-2.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]", onClick: handleClose, type: "button", children: "Maybe later" }), _jsx("button", { className: "cursor-pointer rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]", type: "submit", children: "Lock In" })] })] })] }) }));
}
export default function HomeScreen({ onDeleteSession, onStartSession, onSelectSession, onViewAllSessions, sessions, userName, }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const recentSessions = sessions.slice(0, 6);
    function handleStartSession(sessionName) {
        setIsModalOpen(false);
        onStartSession(sessionName);
    }
    return (_jsxs("div", { className: "ocean-gradient relative min-h-screen text-[var(--text-primary)]", children: [_jsx(WaveDecoration, {}), _jsxs("div", { className: "relative mx-auto flex min-h-screen max-w-4xl flex-col px-8 py-12", children: [_jsxs("main", { className: "flex flex-1 flex-col items-center justify-center pb-8 pt-4 text-center", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("img", { alt: "Delfin logo", className: "h-16 w-16 object-contain sm:h-20 sm:w-20", src: delfinLogo }), _jsx("h1", { className: "font-display text-5xl font-bold tracking-tight text-[var(--primary)] sm:text-6xl", children: "Delfin" })] }), _jsxs("div", { className: "mt-3 max-w-xl text-xl leading-relaxed", children: [_jsx("p", { className: "text-[var(--text-secondary)]", children: _jsx(TypewriterText, { text: "Your intelligent study companion that sees what you see." }) }), _jsx("p", { className: "mt-0 text-[var(--text-muted)]", children: _jsx(TypewriterText, { text: "Ask questions, get explanations, and learn faster together.", delay: 2400 }) })] }), userName !== null && (_jsxs("p", { className: "mt-6 text-2xl text-[var(--text-secondary)]", children: ["Welcome back, ", _jsx("span", { className: "font-semibold text-[var(--primary)]", children: userName })] })), _jsx("button", { className: "btn-ocean mt-8 cursor-pointer rounded-2xl px-8 py-4 text-base font-semibold text-white shadow-lg", onClick: () => setIsModalOpen(true), type: "button", children: "Start Studying" })] }), _jsxs("section", { className: "pb-8", children: [_jsxs("div", { className: "mb-6 flex items-center justify-between", children: [_jsx("h2", { className: "font-display text-lg font-semibold text-[var(--text-primary)]", children: "Recent Sessions" }), sessions.length > 0 && (_jsx("button", { className: "cursor-pointer text-sm font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]", onClick: onViewAllSessions, type: "button", children: "View All Sessions" }))] }), recentSessions.length > 0 ? (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: recentSessions.map((session) => (_jsx(SessionHistoryCard, { onDelete: () => {
                                        onDeleteSession(session.id);
                                    }, onClick: () => {
                                        onSelectSession(session.id);
                                    }, session: session }, session.id))) })) : (_jsxs("div", { className: "rounded-2xl border border-dashed border-[var(--border-soft)] bg-[var(--bg-surface)]/50 p-10 text-center", children: [_jsx("div", { className: "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]", children: _jsx("svg", { className: "h-7 w-7 text-[var(--primary)]", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" }) }) }), _jsx("p", { className: "font-display text-base font-medium text-[var(--text-secondary)]", children: "Ready to dive in?" }), _jsx("p", { className: "mt-2 text-sm text-[var(--text-muted)]", children: "Your study sessions will appear here" })] }))] })] }), _jsx(StartSessionModal, { isOpen: isModalOpen, onClose: () => setIsModalOpen(false), onStart: handleStartSession })] }));
}
