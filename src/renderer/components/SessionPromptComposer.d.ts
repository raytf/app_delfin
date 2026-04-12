interface SessionPromptComposerProps {
    autoFocus?: boolean;
    className?: string;
    isSubmitting: boolean;
    onSubmitPrompt: (text: string) => void;
    placeholder: string;
    submitLabel: string;
}
export default function SessionPromptComposer({ autoFocus, className, isSubmitting, onSubmitPrompt, placeholder, submitLabel, }: SessionPromptComposerProps): import("react/jsx-runtime").JSX.Element;
export {};
