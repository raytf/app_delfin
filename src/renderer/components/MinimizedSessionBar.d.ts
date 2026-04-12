import type { MinimizedOverlayVariant } from '../../shared/types';
import type { WaveformBars, WaveformVisualState } from '../utils/waveformState';
interface MinimizedSessionBarProps {
    errorMessage: string | null;
    isAudioPlaying: boolean;
    isSubmitting: boolean;
    isMicListening: boolean;
    isMicMuted: boolean;
    latestResponseText: string | null;
    minimizedVariant: MinimizedOverlayVariant;
    onAskAnother: () => void;
    onOpen: () => void;
    onSetPromptOpen: (isOpen: boolean) => void;
    onSubmitPrompt: (text: string) => void;
    onStop: () => void;
    onToggleVadListening: () => void;
    showVoiceWaveform: boolean;
    vadListeningEnabled: boolean;
    waveformBars: WaveformBars;
    waveformState: WaveformVisualState;
}
export default function MinimizedSessionBar({ errorMessage, isAudioPlaying, isSubmitting, isMicListening, isMicMuted, latestResponseText, minimizedVariant, onAskAnother, onOpen, onSetPromptOpen, onSubmitPrompt, onStop, onToggleVadListening, showVoiceWaveform, vadListeningEnabled, waveformBars, waveformState, }: MinimizedSessionBarProps): import("react/jsx-runtime").JSX.Element;
export {};
