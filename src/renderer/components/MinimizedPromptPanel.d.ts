interface MinimizedPromptPanelProps {
    errorMessage: string | null;
    isSubmitting: boolean;
    isShowingResponse: boolean;
    latestResponseText: string | null;
    onSubmitPrompt: (text: string) => void;
}
export default function MinimizedPromptPanel({ errorMessage, isSubmitting, isShowingResponse, latestResponseText, onSubmitPrompt, }: MinimizedPromptPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
