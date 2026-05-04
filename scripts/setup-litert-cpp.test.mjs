import { describe, expect, it } from 'vitest'

import { parseArgs, usage } from './setup-litert-cpp.mjs'

describe('setup-litert-cpp parseArgs', () => {
  it('defaults nativeWindows to false', () => {
    const opts = parseArgs([])
    expect(opts.nativeWindows).toBe(false)
  })

  it('parses --native-windows', () => {
    const opts = parseArgs(['--native-windows'])
    expect(opts.nativeWindows).toBe(true)
  })

  it('parses the documented CLI options together', () => {
    const opts = parseArgs([
      '--litert-lm-dir', '/tmp/LiteRT-LM',
      '--native-windows',
      '--install-prereqs',
      '--skip-clone',
      '--skip-build',
      '--no-piper',
      '--piper-voice', 'en/en_US/lessac/medium',
      '--no-model',
      '--dry-run',
    ])
    expect(opts).toMatchObject({
      litertLmDir: '/tmp/LiteRT-LM',
      nativeWindows: true,
      installPrereqs: true,
      skipClone: true,
      skipBuild: true,
      noPiper: true,
      piperVoice: 'en/en_US/lessac/medium',
      noModel: true,
      dryRun: true,
    })
  })

  it('rejects unknown arguments', () => {
    expect(() => parseArgs(['--no-such-flag'])).toThrow(/Unknown argument/)
  })
})

describe('setup-litert-cpp usage', () => {
  it('documents --native-windows and the WSL2 default policy', () => {
    const text = usage()
    expect(text).toMatch(/--native-windows/)
    expect(text).toMatch(/WSL2/)
  })
})
