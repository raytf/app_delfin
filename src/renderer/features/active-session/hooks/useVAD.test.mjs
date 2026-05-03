import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'useVAD.ts'), 'utf8')
const types = readFileSync(join(here, '../../../types/vad-runtime.d.ts'), 'utf8')

describe('useVAD source contract', () => {
  it('rewires the analyser stream when MicVAD resumes after pause', () => {
    expect(source).toContain('const resumeMicStream = async (): Promise<MediaStream> =>')
    expect(source).toContain('resumeStream: resumeMicStream')
    expect(source).toContain('attachMicStream(replacementStream)')
    expect(source).toContain('micStreamRef.current = replacementStream')
  })

  it('logs MicVAD pause and resume failures', () => {
    expect(source).toContain('Failed to pause MicVAD')
    expect(source).toContain('Failed to resume MicVAD')
  })

  it('types the vad-web pauseStream and resumeStream hooks', () => {
    expect(types).toContain('pauseStream?: (stream: MediaStream) => Promise<void>')
    expect(types).toContain('resumeStream?: (stream?: MediaStream) => Promise<MediaStream>')
  })
})