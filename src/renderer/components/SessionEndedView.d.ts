interface SessionEndedViewProps {
    duration: number;
    messageCount: number;
    onGoHome: () => void;
    sessionName: string;
}
export default function SessionEndedView({ duration, messageCount, onGoHome, sessionName, }: SessionEndedViewProps): import("react/jsx-runtime").JSX.Element;
export {};
