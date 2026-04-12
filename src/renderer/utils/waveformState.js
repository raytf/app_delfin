export const WAVEFORM_BAR_COUNT = 28;
const ANALYSER_SPECTRUM_RATIO = 0.72;
export function resolveWaveformPresentation(input) {
    if (input.isUserSpeaking) {
        return {
            bars: input.userWaveformBars,
            state: 'user',
        };
    }
    if (input.isAssistantSpeaking) {
        return {
            bars: input.assistantWaveformBars,
            state: 'assistant',
        };
    }
    const fallbackBars = selectLeadingWaveformBars({
        assistantAudioLevel: input.assistantAudioLevel,
        assistantWaveformBars: input.assistantWaveformBars,
        userAudioLevel: input.userAudioLevel,
        userWaveformBars: input.userWaveformBars,
    });
    if (input.isProcessing) {
        return {
            bars: fallbackBars,
            state: 'processing',
        };
    }
    return {
        bars: fallbackBars,
        state: 'idle',
    };
}
export function createWaveformBars(barCount = WAVEFORM_BAR_COUNT) {
    return Array.from({ length: barCount }, () => 0);
}
export function reduceFrequencyDataToWaveformBars(frequencyData, barCount = WAVEFORM_BAR_COUNT) {
    const bars = createWaveformBars(barCount);
    if (frequencyData.length === 0) {
        return bars;
    }
    const usableBins = Math.max(barCount, Math.floor(frequencyData.length * ANALYSER_SPECTRUM_RATIO));
    for (let index = 0; index < barCount; index += 1) {
        const start = Math.floor((index / barCount) * usableBins);
        const end = Math.max(start + 1, Math.floor(((index + 1) / barCount) * usableBins));
        let maxValue = 0;
        let sum = 0;
        for (let cursor = start; cursor < end; cursor += 1) {
            const value = frequencyData[cursor] ?? 0;
            maxValue = Math.max(maxValue, value);
            sum += value;
        }
        const average = sum / Math.max(1, end - start);
        const composite = maxValue * 0.65 + average * 0.35;
        bars[index] = clampLevel(Math.pow(composite / 255, 0.88));
    }
    return bars;
}
export function smoothWaveformBars(previousBars, nextBars, options = {}) {
    const attack = options.attack ?? 0.34;
    const noiseFloor = options.noiseFloor ?? 0.012;
    const release = options.release ?? 0.14;
    const barCount = Math.max(previousBars.length, nextBars.length);
    const smoothedBars = createWaveformBars(barCount);
    for (let index = 0; index < barCount; index += 1) {
        const previous = clampLevel(previousBars[index] ?? 0);
        const incoming = clampLevel(nextBars[index] ?? 0);
        const target = incoming < noiseFloor ? 0 : incoming;
        const smoothingFactor = target > previous ? attack : release;
        smoothedBars[index] = clampLevel(previous + (target - previous) * smoothingFactor);
    }
    return smoothedBars;
}
export function getWaveformActivityLevel(bars) {
    if (bars.length === 0) {
        return 0;
    }
    let peak = 0;
    let sum = 0;
    for (const bar of bars) {
        const normalizedBar = clampLevel(bar);
        peak = Math.max(peak, normalizedBar);
        sum += normalizedBar;
    }
    const average = sum / bars.length;
    return clampLevel(Math.max(average * 1.8, peak * 0.72));
}
export function resampleWaveformBars(bars, targetCount) {
    const resampledBars = createWaveformBars(targetCount);
    if (bars.length === 0) {
        return resampledBars;
    }
    for (let index = 0; index < targetCount; index += 1) {
        const start = Math.floor((index / targetCount) * bars.length);
        const end = Math.max(start + 1, Math.floor(((index + 1) / targetCount) * bars.length));
        let maxValue = 0;
        for (let cursor = start; cursor < end; cursor += 1) {
            maxValue = Math.max(maxValue, bars[cursor] ?? 0);
        }
        resampledBars[index] = clampLevel(maxValue);
    }
    return resampledBars;
}
function selectLeadingWaveformBars(input) {
    if (input.userAudioLevel >= input.assistantAudioLevel) {
        return input.userWaveformBars;
    }
    return input.assistantWaveformBars;
}
function clampLevel(level) {
    return Math.max(0, Math.min(1, level));
}
