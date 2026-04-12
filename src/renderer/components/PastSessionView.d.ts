import type { ChatMessage, SessionListItem } from '../../shared/types';
interface PastSessionViewProps {
    messages: ChatMessage[];
    onBack: () => void;
    onDelete: () => void;
    session: SessionListItem;
}
export default function PastSessionView({ messages, onBack, onDelete, session, }: PastSessionViewProps): import("react/jsx-runtime").JSX.Element;
export {};
