/**
 * Startup .env validation.
 *
 * Rules (from docs/phases/phase-4-integration.md §4.6):
 *  - Warn via console.warn for every problem found.
 *  - Never throw — the app must always start even without a .env file.
 *  - Call this once, immediately after dotenv's config() in src/main/index.ts.
 */

import { existsSync } from 'fs'
import { resolve } from 'path'

export interface EnvValidationResult {
  /** All warning messages emitted. Empty array means no issues. */
  warnings: string[]
}

const WARN_PREFIX = '[env]'

/**
 * Validates environment variables expected by the Electron main process.
 * Logs a console.warn for each issue and returns the full list of warnings.
 */
export function validateEnv(): EnvValidationResult {
  const warnings: string[] = []

  function warn(msg: string): void {
    warnings.push(msg)
    console.warn(`${WARN_PREFIX} ⚠️  ${msg}`)
  }

  // ── .env file presence ───────────────────────────────────────────────────
  // dotenv silently no-ops when the file is absent; surface that clearly.
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    warn(
      '.env file not found — running with defaults. ' +
        'Copy .env.example to .env and adjust for your machine.',
    )
  }

  // ── Required: sidecar connection ─────────────────────────────────────────
  if (!process.env.SIDECAR_WS_URL) {
    warn('SIDECAR_WS_URL is not set — defaulting to ws://localhost:8321/ws')
  } else if (!process.env.SIDECAR_WS_URL.startsWith('ws://') && !process.env.SIDECAR_WS_URL.startsWith('wss://')) {
    warn(
      `SIDECAR_WS_URL="${process.env.SIDECAR_WS_URL}" does not look like a WebSocket URL (expected ws:// or wss://)`,
    )
  }

  // ── Optional: voice input ─────────────────────────────────────────────────
  const voiceEnabled = process.env.VOICE_ENABLED
  if (voiceEnabled !== undefined && voiceEnabled !== 'true' && voiceEnabled !== 'false') {
    warn(`VOICE_ENABLED="${voiceEnabled}" is not a valid boolean — expected "true" or "false"`)
  }

  // ── Optional: TTS ─────────────────────────────────────────────────────────
  const ttsEnabled = process.env.TTS_ENABLED
  if (ttsEnabled !== undefined && ttsEnabled !== 'true' && ttsEnabled !== 'false') {
    warn(`TTS_ENABLED="${ttsEnabled}" is not a valid boolean — expected "true" or "false"`)
  }

  const validTtsBackends = ['web-speech', 'kokoro', 'mlx'] as const
  const ttsBackend = process.env.TTS_BACKEND
  if (ttsBackend !== undefined && !(validTtsBackends as readonly string[]).includes(ttsBackend)) {
    warn(
      `TTS_BACKEND="${ttsBackend}" is not recognised — valid values: ${validTtsBackends.join(', ')}`,
    )
  }

  // ── Optional: audio backend ───────────────────────────────────────────────
  const audioBackend = process.env.LITERT_AUDIO_BACKEND
  if (audioBackend !== undefined && audioBackend !== 'CPU' && audioBackend !== 'GPU') {
    warn(`LITERT_AUDIO_BACKEND="${audioBackend}" is not recognised — expected "CPU" or "GPU"`)
  }

  if (warnings.length === 0) {
    console.log(`${WARN_PREFIX} ✅  All checked environment variables look good.`)
  }

  return { warnings }
}
