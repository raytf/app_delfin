export type WaveformVisualState = 'idle' | 'processing' | 'user' | 'assistant'

export type WaveformBars = readonly number[]

export const WAVEFORM_BAR_COUNT = 28

const ANALYSER_SPECTRUM_RATIO = 0.72

interface SmoothWaveformBarsOptions {
  attack?: number
  noiseFloor?: number
  release?: number
}

export interface WaveformPresentationInput {
  assistantAudioLevel: number
  assistantWaveformBars: WaveformBars
  isAssistantSpeaking: boolean
  isProcessing: boolean
  isUserSpeaking: boolean
  userAudioLevel: number
  userWaveformBars: WaveformBars
}

export interface WaveformPresentation {
  bars: WaveformBars
  state: WaveformVisualState
}

export function resolveWaveformPresentation(input: WaveformPresentationInput): WaveformPresentation {
  if (input.isUserSpeaking) {
    return {
      bars: input.userWaveformBars,
      state: 'user',
    }
  }

  if (input.isAssistantSpeaking) {
    return {
      bars: input.assistantWaveformBars,
      state: 'assistant',
    }
  }

  if (input.isProcessing) {
    return {
      bars: createWaveformBars(),
      state: 'processing',
    }
  }

  return {
    bars: createWaveformBars(),
    state: 'idle',
  }
}

export function createWaveformBars(barCount = WAVEFORM_BAR_COUNT): number[] {
  return Array.from({ length: barCount }, () => 0)
}

export function reduceFrequencyDataToWaveformBars(
  frequencyData: Uint8Array<ArrayBufferLike>,
  barCount = WAVEFORM_BAR_COUNT,
): number[] {
  const bars = createWaveformBars(barCount)

  if (frequencyData.length === 0) {
    return bars
  }

  const usableBins = Math.max(barCount, Math.floor(frequencyData.length * ANALYSER_SPECTRUM_RATIO))

  for (let index = 0; index < barCount; index += 1) {
    const start = Math.floor((index / barCount) * usableBins)
    const end = Math.max(start + 1, Math.floor(((index + 1) / barCount) * usableBins))
    let maxValue = 0
    let sum = 0

    for (let cursor = start; cursor < end; cursor += 1) {
      const value = frequencyData[cursor] ?? 0
      maxValue = Math.max(maxValue, value)
      sum += value
    }

    const average = sum / Math.max(1, end - start)
    const composite = maxValue * 0.65 + average * 0.35
    bars[index] = clampLevel(Math.pow(composite / 255, 0.88))
  }

  return bars
}

export function smoothWaveformBars(
  previousBars: WaveformBars,
  nextBars: WaveformBars,
  options: SmoothWaveformBarsOptions = {},
): number[] {
  const attack = options.attack ?? 0.34
  const noiseFloor = options.noiseFloor ?? 0.012
  const release = options.release ?? 0.14
  const barCount = Math.max(previousBars.length, nextBars.length)
  const smoothedBars = createWaveformBars(barCount)

  for (let index = 0; index < barCount; index += 1) {
    const previous = clampLevel(previousBars[index] ?? 0)
    const incoming = clampLevel(nextBars[index] ?? 0)
    const target = incoming < noiseFloor ? 0 : incoming
    const smoothingFactor = target > previous ? attack : release
    smoothedBars[index] = clampLevel(previous + (target - previous) * smoothingFactor)
  }

  return smoothedBars
}

export function getWaveformActivityLevel(bars: WaveformBars): number {
  if (bars.length === 0) {
    return 0
  }

  let peak = 0
  let sum = 0

  for (const bar of bars) {
    const normalizedBar = clampLevel(bar)
    peak = Math.max(peak, normalizedBar)
    sum += normalizedBar
  }

  const average = sum / bars.length
  return clampLevel(Math.max(average * 1.8, peak * 0.72))
}

export function resampleWaveformBars(bars: WaveformBars, targetCount: number): number[] {
  const resampledBars = createWaveformBars(targetCount)

  if (bars.length === 0) {
    return resampledBars
  }

  for (let index = 0; index < targetCount; index += 1) {
    const start = Math.floor((index / targetCount) * bars.length)
    const end = Math.max(start + 1, Math.floor(((index + 1) / targetCount) * bars.length))
    let maxValue = 0

    for (let cursor = start; cursor < end; cursor += 1) {
      maxValue = Math.max(maxValue, bars[cursor] ?? 0)
    }

    resampledBars[index] = clampLevel(maxValue)
  }

  return resampledBars
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(1, level))
}
