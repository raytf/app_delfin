import type { ChatMessage } from '../../shared/types';
interface SessionConversationProps {
    className?: string;
    emptyMessage: string;
    isAudioPlaying: boolean;
    isSubmitting: boolean;
    messages: ChatMessage[];
}
export default function SessionConversation({ className, emptyMessage, isAudioPlaying, isSubmitting, messages, }: SessionConversationProps): import("react/jsx-runtime").JSX.Element;
export {};
