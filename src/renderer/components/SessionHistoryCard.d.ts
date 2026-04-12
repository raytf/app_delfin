import type { SessionListItem } from '../../shared/types';
interface SessionHistoryCardProps {
    onClick?: () => void;
    onDelete?: () => void;
    session: SessionListItem;
    variant?: 'compact' | 'detailed';
}
export default function SessionHistoryCard({ onClick, onDelete, session, variant, }: SessionHistoryCardProps): import("react/jsx-runtime").JSX.Element;
export {};
