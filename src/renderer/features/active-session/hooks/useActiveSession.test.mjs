import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'useActiveSession.ts'), 'utf8')

describe('useActiveSession source contract', () => {
  it('clears fallback speech state when browser TTS ends', () => {
    expect(source).toContain('const finishFallbackSpeechPlayback = useCallback(() => {')
    expect(source).toContain('aiStreamingStartedRef.current = false')
    expect(source).toContain('utterance.onend = () => {')
    expect(source).toContain('finishFallbackSpeechPlayback()')
  })

  it('clears fallback speech state when browser TTS errors', () => {
    expect(source).toContain('utterance.onerror = () => {')
    expect(source).toContain('finishFallbackSpeechPlayback()')
  })
})