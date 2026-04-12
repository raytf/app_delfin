import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Send } from 'lucide-react';
export default function SessionPromptComposer({ autoFocus = false, className, isSubmitting, onSubmitPrompt, placeholder, submitLabel, }) {
    const [promptValue, setPromptValue] = useState('');
    function handleSubmit(event) {
        event.preventDefault();
        const trimmedPrompt = promptValue.trim();
        if (trimmedPrompt.length === 0) {
            return;
        }
        onSubmitPrompt(trimmedPrompt);
        setPromptValue('');
    }
    return (_jsx("div", { className: "no-drag", children: _jsxs("form", { className: className, onSubmit: handleSubmit, children: [_jsx("input", { autoFocus: autoFocus, className: "h-11 flex-1 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]", onChange: (event) => {
                        setPromptValue(event.target.value);
                    }, placeholder: placeholder, type: "text", value: promptValue }), _jsx("button", { className: "no-drag flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--primary)] text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60", disabled: isSubmitting, type: "submit", "aria-label": submitLabel, children: isSubmitting ? (_jsx("span", { className: "h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" })) : (_jsx(Send, { size: 18 })) })] }) }));
}
