import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
export default function UserNameModal({ isOpen, onSave, }) {
    const [name, setName] = useState('');
    useEffect(() => {
        if (!isOpen) {
            setName('');
        }
    }, [isOpen]);
    if (!isOpen) {
        return null;
    }
    function handleSubmit(event) {
        event.preventDefault();
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return;
        }
        onSave(trimmedName);
    }
    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
        }
    }
    return (_jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm", children: _jsxs("div", { className: "w-full max-w-md rounded-3xl bg-[var(--bg-surface)] p-8 shadow-2xl", children: [_jsx("h2", { className: "text-center font-display text-xl font-semibold text-[var(--text-primary)]", children: "What should I call you?" }), _jsx("form", { className: "mt-5", onSubmit: handleSubmit, children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { autoFocus: true, className: "h-11 flex-1 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]", onChange: (event) => {
                                    setName(event.target.value);
                                }, onKeyDown: handleKeyDown, placeholder: "Your name", type: "text", value: name }), _jsx("button", { "aria-label": "Save name", className: "flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60", disabled: name.trim().length === 0, type: "submit", children: _jsx(ArrowRight, { size: 18 }) })] }) })] }) }));
}
