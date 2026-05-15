import { describe, expect, it } from 'vitest'

import {
  BRIDGE_COMMIT_FILE,
  BRIDGE_VERSION_FILE,
  LITERT_LM_REF,
  MODEL_REVISION,
  bridgePlatformLabel,
  defaultBridgeArtifactName,
  isBridgeSourceCurrent,
  parseArgs,
  resolveBridgePlan,
  usage,
} from './setup-litert-cpp.mjs'

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
      '--bridge-source', 'artifact',
      '--source-build',
      '--repo', 'owner/repo',
      '--ci-run-id', '12345',
      '--artifact-name', 'custom-artifact',
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
      bridgeSource: 'artifact',
      sourceBuild: true,
      repo: 'owner/repo',
      ciRunId: '12345',
      artifactName: 'custom-artifact',
      noModel: true,
      dryRun: true,
    })
  })

  it('rejects unknown arguments', () => {
    expect(() => parseArgs(['--no-such-flag'])).toThrow(/Unknown argument/)
  })

  it('rejects invalid bridge source values', () => {
    expect(() => parseArgs(['--bridge-source', 'zip'])).toThrow(/Invalid --bridge-source/)
  })
})

describe('setup-litert-cpp version pins', () => {
  it('exports a non-empty MODEL_REVISION string', () => {
    expect(typeof MODEL_REVISION).toBe('string')
    expect(MODEL_REVISION.length).toBeGreaterThan(0)
  })

  it('exports BRIDGE_VERSION_FILE under bin/', () => {
    expect(BRIDGE_VERSION_FILE).toMatch(/[/\\]bin[/\\]bridge\.version$/)
  })

  it('exports BRIDGE_COMMIT_FILE under bin/', () => {
    expect(BRIDGE_COMMIT_FILE).toMatch(/[/\\]bin[/\\]bridge\.commit$/)
  })
})

describe('setup-litert-cpp bridge planning', () => {
  it('uses CI artifacts by default on Windows when bridge files are missing', () => {
    expect(resolveBridgePlan(parseArgs([]), 'win32', false, 'x64')).toMatchObject({ source: 'artifact' })
  })

  it('reuses existing bridge files when the ref matches and the source is unchanged', () => {
    expect(resolveBridgePlan(parseArgs([]), 'win32', true, 'x64', LITERT_LM_REF, true)).toMatchObject({ source: 'existing' })
  })

  it('reuses existing bridge files when source-currency is unknown (falls back to the ref check)', () => {
    expect(resolveBridgePlan(parseArgs([]), 'win32', true, 'x64', LITERT_LM_REF, null)).toMatchObject({ source: 'existing' })
  })

  it('re-downloads when the bridge source moved even though the ref matches', () => {
    expect(resolveBridgePlan(parseArgs([]), 'win32', true, 'x64', LITERT_LM_REF, false)).toMatchObject({
      source: 'artifact',
      stale: true,
      staleReason: 'source',
    })
  })

  it('re-downloads when the installed bridge version is stale', () => {
    expect(resolveBridgePlan(parseArgs([]), 'win32', true, 'x64', 'v0.10.0')).toMatchObject({
      source: 'artifact',
      stale: true,
      staleReason: 'ref',
    })
  })

  it('re-downloads when no version file is present alongside the bridge binary', () => {
    expect(resolveBridgePlan(parseArgs([]), 'win32', true, 'x64', null)).toMatchObject({
      source: 'artifact',
      stale: true,
      staleReason: 'ref',
    })
  })

  it('uses CI artifacts by default on Linux and macOS when bridge files are missing', () => {
    expect(resolveBridgePlan(parseArgs([]), 'linux', false, 'x64')).toMatchObject({ source: 'artifact' })
    expect(resolveBridgePlan(parseArgs([]), 'darwin', false, 'arm64')).toMatchObject({ source: 'artifact' })
  })

  it('uses source builds only when explicitly requested', () => {
    expect(resolveBridgePlan(parseArgs(['--source-build']), 'linux', false, 'x64')).toMatchObject({
      source: 'build',
      needsLiteRtLm: true,
    })
    expect(resolveBridgePlan(parseArgs(['--bridge-source', 'build']), 'darwin', false, 'arm64')).toMatchObject({
      source: 'build',
      needsLiteRtLm: true,
    })
  })

  it('reports unsupported platforms without falling back to source builds', () => {
    expect(resolveBridgePlan(parseArgs([]), 'darwin', false, 'x64')).toMatchObject({ source: 'unsupported' })
  })

  it('honors --skip-build without requiring LiteRT-LM checkout', () => {
    expect(resolveBridgePlan(parseArgs(['--skip-build']), 'win32', false)).toMatchObject({
      source: 'skip',
      needsLiteRtLm: false,
    })
  })
})

describe('setup-litert-cpp isBridgeSourceCurrent', () => {
  it('returns null when no build commit is recorded', () => {
    expect(isBridgeSourceCurrent(null)).toBeNull()
    expect(isBridgeSourceCurrent('')).toBeNull()
  })

  it('returns null for a non-commit-looking value without shelling out to git', () => {
    expect(isBridgeSourceCurrent('not-a-sha')).toBeNull()
  })
})

describe('setup-litert-cpp artifact naming', () => {
  it('maps supported platforms to CI artifact labels', () => {
    expect(bridgePlatformLabel('win32', 'x64')).toBe('windows-x64')
    expect(bridgePlatformLabel('darwin', 'arm64')).toBe('macos-arm64')
    expect(bridgePlatformLabel('linux', 'x64')).toBe('linux-x64')
  })

  it('uses platform-labeled workflow artifact names', () => {
    expect(defaultBridgeArtifactName('win32', 'x64')).toBe('delfin-litert-bridge-windows-x64')
    expect(defaultBridgeArtifactName('darwin', 'arm64')).toBe('delfin-litert-bridge-macos-arm64')
    expect(defaultBridgeArtifactName('linux', 'x64')).toBe('delfin-litert-bridge-linux-x64')
  })
})

describe('setup-litert-cpp usage', () => {
  it('documents the one-shot bridge and Piper setup flags', () => {
    const text = usage()
    expect(text).toMatch(/--native-windows/)
    expect(text).toMatch(/--bridge-source/)
    expect(text).toMatch(/--source-build/)
    expect(text).toMatch(/WSL2/)
    expect(text).toMatch(/runtime \+ voice setup/)
  })
})
