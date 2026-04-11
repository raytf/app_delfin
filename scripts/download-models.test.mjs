import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadFile } from './download-models.mjs'

function createMockResponse(chunks, overrides = {}) {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0)

  return {
    body: (async function* body() {
      for (const chunk of chunks) {
        yield chunk
      }
    })(),
    headers: new Headers({ 'content-length': String(totalBytes) }),
    ok: true,
    status: 200,
    statusText: 'OK',
    ...overrides,
  }
}

describe('downloadFile', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('writes to a temp file and renames it into place on success', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'download-models-'))
    const destPath = join(tempDir, 'model.bin')

    global.fetch = vi.fn().mockResolvedValue(
      createMockResponse([Buffer.from('hello '), Buffer.from('world')]),
    )

    await downloadFile('https://example.test/model.bin', destPath, 'test model')

    await expect(readFile(destPath, 'utf8')).resolves.toBe('hello world')
    expect(existsSync(destPath)).toBe(true)
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })

  it('removes the temp file and leaves the final path absent when the stream fails', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'download-models-'))
    const destPath = join(tempDir, 'model.bin')

    global.fetch = vi.fn().mockResolvedValue({
      body: (async function* body() {
        yield Buffer.from('partial data')
        throw new Error('stream failure')
      })(),
      headers: new Headers({ 'content-length': '24' }),
      ok: true,
      status: 200,
      statusText: 'OK',
    })

    await expect(downloadFile('https://example.test/model.bin', destPath, 'test model')).rejects.toThrow(
      'stream failure',
    )

    expect(existsSync(destPath)).toBe(false)
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })
})