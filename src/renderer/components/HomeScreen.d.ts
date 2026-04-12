import type { SessionListItem } from '../../shared/types';
interface HomeScreenProps {
    onDeleteSession: (sessionId: string) => void;
    onStartSession: (sessionName: string) => void;
    onSelectSession: (sessionId: string) => void;
    onViewAllSessions: () => void;
    sessions: SessionListItem[];
    userName: string | null;
}
export default function HomeScreen({ onDeleteSession, onStartSession, onSelectSession, onViewAllSessions, sessions, userName, }: HomeScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
