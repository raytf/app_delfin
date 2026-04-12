import type { SessionListItem } from '../../shared/types';
interface AllSessionsPageProps {
    onBack: () => void;
    onDeleteSession: (sessionId: string) => void;
    onSelectSession: (sessionId: string) => void;
    sessions: SessionListItem[];
}
export default function AllSessionsPage({ onBack, onDeleteSession, onSelectSession, sessions, }: AllSessionsPageProps): import("react/jsx-runtime").JSX.Element;
export {};
