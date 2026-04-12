import type { ChatMessage, SidecarStatus } from '../../shared/types';
import type { WaveformBars, WaveformVisualState } from '../utils/waveformState';
interface ExpandedSessionViewProps {
    captureSourceLabel: string | null;
    errorMessage: string | null;
    isAudioPlaying: boolean;
    isSubmitting: boolean;
    isMicListening: boolean;
    isMicMuted: boolean;
    messages: ChatMessage[];
    sessionName: string;
    onMinimize: () => void;
    onStop: () => void;
    onSubmitPrompt: (text: string) => void;
    onToggleVadListening: () => void;
    showVoiceWaveform: boolean;
    sidecarStatus: SidecarStatus;
    vadListeningEnabled: boolean;
    waveformBars: WaveformBars;
    waveformState: WaveformVisualState;
}
export default function ExpandedSessionView({ captureSourceLabel, errorMessage, isAudioPlaying, isSubmitting, isMicListening, isMicMuted, messages, sessionName, onMinimize, onStop, onSubmitPrompt, onToggleVadListening, showVoiceWaveform, sidecarStatus, vadListeningEnabled, waveformBars, waveformState, }: ExpandedSessionViewProps): import("react/jsx-runtime").JSX.Element;
export {};
