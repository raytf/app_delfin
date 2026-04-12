import { type WaveformBars, type WaveformVisualState } from '../utils/waveformState';
interface VoiceWaveformProps {
    bars: WaveformBars;
    className?: string;
    compact?: boolean;
    label?: string;
    state: WaveformVisualState;
}
export default function VoiceWaveform({ bars, className, compact, label, state }: VoiceWaveformProps): import("react/jsx-runtime").JSX.Element;
export {};
