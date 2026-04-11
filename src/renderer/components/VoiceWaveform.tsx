import { useEffect, useRef } from 'react'
import { resampleWaveformBars, type WaveformBars, type WaveformVisualState } from '../utils/waveformState'

interface VoiceWaveformProps {
  bars: WaveformBars
  className?: string
  compact?: boolean
  label?: string
  state: WaveformVisualState
}

interface WaveformMotionConfig {
  baseEnergy: number
  colorVariable: '--success' | '--primary' | '--warning'
  minAlpha: number
  signalScale: number
  speed: number
}

const EXPANDED_BAR_COUNT = 28
const COMPACT_BAR_COUNT = 18
const BAR_GAP = 4

export default function VoiceWaveform({ bars, className, compact = false, label, state }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const barsRef = useRef<WaveformBars>(bars)
  const stateRef = useRef<WaveformVisualState>(state)
  const accessibleLabel = label ?? `Voice waveform showing ${state} activity`

  useEffect(() => {
    barsRef.current = bars
  }, [bars])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }

    const context = canvas.getContext('2d')
    if (context === null) {
      return
    }

    const rootStyles = getComputedStyle(document.documentElement)
    const barCount = compact ? COMPACT_BAR_COUNT : EXPANDED_BAR_COUNT

    let animationFrameId = 0
    let phase = 0

    const resizeCanvas = (): { height: number; width: number } => {
      const bounds = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.floor(bounds.width))
      const height = Math.max(1, Math.floor(bounds.height))
      const devicePixelRatio = window.devicePixelRatio || 1

      canvas.width = Math.floor(width * devicePixelRatio)
      canvas.height = Math.floor(height * devicePixelRatio)
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

      return { width, height }
    }

    let dimensions = resizeCanvas()

    const resizeObserver = new ResizeObserver(() => {
      dimensions = resizeCanvas()
    })
    resizeObserver.observe(canvas)

    const draw = () => {
      const { width, height } = dimensions
      const currentState = stateRef.current
      const motionConfig = getWaveformMotionConfig(currentState)
      const color = rootStyles.getPropertyValue(motionConfig.colorVariable).trim() || '#000000'
      const sampledBars = resampleWaveformBars(barsRef.current, barCount)

      context.clearRect(0, 0, width, height)

      const barWidth = Math.max(3, (width - BAR_GAP * (barCount - 1)) / barCount)
      const centerY = height / 2

      phase += motionConfig.speed

      for (let index = 0; index < barCount; index += 1) {
        const primaryWave = (Math.sin(phase + index * 0.42) + 1) / 2
        const secondaryWave = (Math.sin(phase * 0.67 + index * 0.23) + 1) / 2
        const ambient = 0.25 + primaryWave * 0.45 + secondaryWave * 0.3
        const signal = sampledBars[index] ?? 0
        const ambientFloor = motionConfig.baseEnergy * ambient
        const signalEnergy = signal * motionConfig.signalScale
        const energy = currentState === 'idle' || currentState === 'processing'
          ? Math.max(ambientFloor, signalEnergy * 0.9)
          : Math.max(motionConfig.baseEnergy + signalEnergy, ambientFloor)
        const barHeight = Math.max(4, energy * (height - 4))
        const x = index * (barWidth + BAR_GAP)
        const y = centerY - barHeight / 2
        const alpha = Math.min(1, motionConfig.minAlpha + Math.max(signal, energy) * 1.15)
        const radius = Math.min(4, barWidth / 2, barHeight / 2)

        context.fillStyle = withAlpha(color, alpha)
        context.beginPath()
        context.roundRect(x, y, barWidth, barHeight, radius)
        context.fill()
      }

      animationFrameId = window.requestAnimationFrame(draw)
    }

    animationFrameId = window.requestAnimationFrame(draw)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
    }
  }, [compact])

  return (
    <div className={className} data-state={state}>
      <canvas
        aria-label={accessibleLabel}
        className={`block w-full ${compact ? 'h-8' : 'h-14'}`}
        ref={canvasRef}
        role="img"
      />
    </div>
  )
}

function getWaveformMotionConfig(state: WaveformVisualState): WaveformMotionConfig {
  switch (state) {
    case 'user':
      return {
        colorVariable: '--success',
        baseEnergy: 0.08,
        minAlpha: 0.28,
        signalScale: 0.95,
        speed: 0.16,
      }
    case 'assistant':
      return {
        colorVariable: '--primary',
        baseEnergy: 0.1,
        minAlpha: 0.3,
        signalScale: 0.92,
        speed: 0.14,
      }
    case 'processing':
      return {
        colorVariable: '--warning',
        baseEnergy: 0.22,
        minAlpha: 0.32,
        signalScale: 0.72,
        speed: 0.2,
      }
    case 'idle':
      return {
        colorVariable: '--warning',
        baseEnergy: 0.1,
        minAlpha: 0.2,
        signalScale: 0.58,
        speed: 0.08,
      }
  }
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const normalized = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color
    const red = Number.parseInt(normalized.slice(1, 3), 16)
    const green = Number.parseInt(normalized.slice(3, 5), 16)
    const blue = Number.parseInt(normalized.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }

  return color
}