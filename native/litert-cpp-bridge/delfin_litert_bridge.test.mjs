import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'delfin_litert_bridge.cc'), 'utf8')
const buildFile = readFileSync(join(here, 'BUILD.bazel'), 'utf8')

describe('delfin_litert_bridge source contract', () => {
  it('speaks the JSONL event types expected by litert-cpp-proxy', () => {
    for (const token of ['"ready"', '"generate"', '"interrupt"', '"reset_session"', '"token"', '"done"', '"error"']) {
      expect(source).toContain(token)
    }
  })

  it('uses the LiteRT Conversation API, session reuse, and cancellation group hook', () => {
    expect(source).toContain('Conversation::Create')
    expect(source).toContain('SendMessageAsync')
    expect(source).toContain('CancelGroup')
    expect(source).toContain('FLAGS_vision_backend')
    expect(source).toContain('JsonPreface')
    expect(source).toContain('g_sessions')
    expect(source).toContain('request["message"]')
  })

  it('declares the audio backend flag and wires it into engine settings', () => {
    expect(source).toContain('FLAGS_audio_backend')
    expect(source).toContain('GetAudioExecutorSettings')
  })

  it('enables vision and audio modality on the session config when executors are present', () => {
    expect(source).toContain('SetVisionModalityEnabled')
    expect(source).toContain('SetAudioModalityEnabled')
  })

  it('has an audio-disabled validation guard before generation', () => {
    expect(source).toContain('MessageHasContentType')
    expect(source).toContain('Audio input is disabled for this LiteRT C++ bridge.')
  })

  it('declares the Bazel bridge binary target', () => {
    expect(buildFile).toContain('cc_binary')
    expect(buildFile).toContain('delfin_litert_bridge')
  })
})
