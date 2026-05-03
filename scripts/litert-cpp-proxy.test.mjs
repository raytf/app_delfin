import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { startLitertCppProxy } from './litert-cpp-proxy.mjs'

function createMockTtsBackend(options = {}) {
  const state = {
    cancelled: 0,
    texts: [],
    ...options.state,
  }

  return {
    state,
    getInfo() {
      return {
        backend: options.backend ?? 'piper',
        ready: options.ready ?? true,
        model: options.model ?? 'mock-piper.onnx',
        error: options.error ?? null,
      }
    },
    start(text, handlers) {
      state.texts.push(text)
      if (options.ready === false) return null

      if (options.mode === 'interruptible') {
        let resolveRun
        const promise = new Promise((resolve) => {
          resolveRun = resolve
        })
        return {
          promise,
          cancel() {
            state.cancelled += 1
            resolveRun(false)
          },
        }
      }

      return {
        promise: (async () => {
          if (options.fail) {
            throw new Error('Piper failed')
          }
          handlers.onStart({ sampleRate: 22050, sentenceCount: 1 })
          handlers.onChunk({ audio: Buffer.from('pcm-1').toString('base64'), index: 0 })
          handlers.onChunk({ audio: Buffer.from('pcm-2').toString('base64'), index: 1 })
          handlers.onEnd({ ttsTime: 0.12 })
          return true
        })(),
        cancel() {
          state.cancelled += 1
        },
      }
    },
    async close() {},
  }
}

function createMockStreamingTtsBackend(options = {}) {
  const state = {
    cancelled: 0,
    finished: 0,
    segments: [],
    ...options.state,
  }

  return {
    state,
    getInfo() {
      return {
        backend: 'piper',
        ready: true,
        model: 'mock-piper.onnx',
        error: null,
      }
    },
    start(text, handlers) {
      const run = this.startStream(handlers)
      run.enqueue(text)
      run.finish()
      return run
    },
    startStream(handlers) {
      let resolved = false
      let started = false
      let chunkIndex = 0
      let resolveRun
      const promise = new Promise((resolve) => {
        resolveRun = resolve
      })

      return {
        promise,
        enqueue(text) {
          state.segments.push(text)
          if (!started) {
            started = true
            handlers.onStart({ sampleRate: 22050, sentenceCount: 0 })
          }
          handlers.onChunk({
            audio: Buffer.from(`pcm:${text}`).toString('base64'),
            index: chunkIndex++,
          })
        },
        finish() {
          if (resolved) return
          resolved = true
          state.finished += 1
          if (started) handlers.onEnd({ ttsTime: 0.12 })
          resolveRun(started)
        },
        cancel() {
          if (resolved) return
          resolved = true
          state.cancelled += 1
          resolveRun(false)
        },
      }
    },
    async close() {},
  }
}

function createDelayedDoneBridge() {
  let activeHandlers = null

  return {
    async ready() {},
    getInfo() {
      return { ready: true, backend: 'litert-cpp', model: 'mock-gemma-4' }
    },
    async generate(request, handlers) {
      activeHandlers = handlers
      handlers.onToken('First sentence. ')
    },
    releaseDone() {
      activeHandlers.onToken('Second sentence')
      activeHandlers.onDone({
        requestId: 'delayed-request',
        text: 'First sentence. Second sentence',
        message: {
          role: 'model',
          content: [{ type: 'text', text: 'First sentence. Second sentence' }],
        },
      })
    },
    interrupt() {},
    resetSession() {},
    async close() {},
  }
}

function createMockBridge() {
  const inFlight = new Map()
  const sessionTurns = new Map()
  const resetSessions = []
  const requests = []

  return {
    requests,
    resetSessions,
    async ready() {},
    getInfo() {
      return { ready: true, backend: 'litert-cpp', model: 'mock-gemma-4' }
    },
    async generate(request, handlers) {
      requests.push(request)
      const turnCount = (sessionTurns.get(request.sessionId) ?? 0) + 1
      sessionTurns.set(request.sessionId, turnCount)

      const prompt = (request.message?.content ?? [])
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join(' ')
      const includesImage = (request.message?.content ?? []).some((item) => item.type === 'image')

      if (prompt.includes('interrupt')) {
        handlers.onToken('partial ')
        inFlight.set(request.requestId, handlers)
        return
      }

      const response = `turn ${turnCount}: ${prompt}${includesImage ? ' [image]' : ''}`
      handlers.onToken(response.slice(0, 6))
      handlers.onToken(response.slice(6))
      handlers.onDone({
        requestId: request.requestId,
        text: response,
        message: { role: 'model', content: [{ type: 'text', text: response }] },
      })
    },
    interrupt(requestId) {
      const handlers = inFlight.get(requestId)
      if (!handlers) return
      inFlight.delete(requestId)
      handlers.onError('Generation interrupted.')
    },
    resetSession(sessionId) {
      resetSessions.push(sessionId)
      sessionTurns.delete(sessionId)
    },
    async close() {
      inFlight.clear()
      sessionTurns.clear()
    },
  }
}

async function openSocket(url) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(url)
    socket.once('open', () => resolvePromise(socket))
    socket.once('error', rejectPromise)
  })
}

async function collectUntil(socket, terminalType) {
  const messages = []
  return await new Promise((resolvePromise, rejectPromise) => {
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString())
      messages.push(message)
      if (message.type === terminalType) {
        socket.off('message', onMessage)
        resolvePromise(messages)
      }
    }
    socket.on('message', onMessage)
    socket.once('error', rejectPromise)
  })
}

async function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now()

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for test condition.')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('startLitertCppProxy', () => {
  let proxy

  afterEach(async () => {
    await proxy?.close()
    proxy = undefined
  })

  it('serves a Delfin-compatible health endpoint', async () => {
    const tts = createMockTtsBackend()
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: createMockBridge,
      createTtsBackend: () => tts,
    })

    const response = await fetch(`http://127.0.0.1:${proxy.port}/health`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      status: 'ok',
      backend: 'litert-cpp',
      model: 'mock-gemma-4',
      tts_backend: 'piper',
      tts_ready: true,
      tts_model: 'mock-piper.onnx',
    })
  })

  it('emits audio events before done when proxy TTS is enabled', async () => {
    const tts = createMockTtsBackend()
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: createMockBridge,
      createTtsBackend: () => tts,
    })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'explain this slide', preset_id: 'lecture-slide' }))
    const messages = await collectUntil(socket, 'done')
    const types = messages.map((message) => message.type)

    expect(types).toEqual(['token', 'token', 'audio_start', 'audio_chunk', 'audio_chunk', 'audio_end', 'done'])
    expect(tts.state.texts).toEqual(['turn 1: explain this slide'])
    socket.close()
  })

  it('starts streaming Piper audio from completed sentences before bridge done', async () => {
    const bridge = createDelayedDoneBridge()
    const tts = createMockStreamingTtsBackend()
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: () => bridge,
      createTtsBackend: () => tts,
    })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'explain this slide', preset_id: 'lecture-slide' }))
    const earlyMessages = await collectUntil(socket, 'audio_chunk')

    expect(earlyMessages.map((message) => message.type)).toEqual(['token', 'audio_start', 'audio_chunk'])
    expect(tts.state.segments).toEqual(['First sentence.'])
    expect(tts.state.finished).toBe(0)

    bridge.releaseDone()
    const remainingMessages = await collectUntil(socket, 'done')

    expect(remainingMessages.map((message) => message.type)).toEqual([
      'token',
      'audio_chunk',
      'audio_end',
      'done',
    ])
    expect(tts.state.segments).toEqual(['First sentence.', 'Second sentence'])
    expect(tts.state.finished).toBe(1)
    socket.close()
  })

  it('preserves done-only fallback behavior when proxy TTS is disabled', async () => {
    const tts = createMockTtsBackend({ backend: 'none', ready: false })
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: createMockBridge,
      createTtsBackend: () => tts,
    })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'simplify it', preset_id: 'generic-screen' }))
    const messages = await collectUntil(socket, 'done')

    expect(messages.map((message) => message.type)).toEqual(['token', 'token', 'done'])
    socket.close()
  })

  it('falls back cleanly when proxy TTS synthesis fails', async () => {
    const tts = createMockTtsBackend({ fail: true })
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: createMockBridge,
      createTtsBackend: () => tts,
    })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'hello?', preset_id: 'generic-screen' }))
    const messages = await collectUntil(socket, 'done')

    expect(messages.map((message) => message.type)).toEqual(['token', 'token', 'done'])
    socket.close()
  })

  it('reuses a bridge session per connection and sends only the new user turn', async () => {
    const bridge = createMockBridge()
    const tts = createMockTtsBackend({ backend: 'none', ready: false })
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: () => bridge,
      createTtsBackend: () => tts,
    })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'explain this slide', image: 'abc123', preset_id: 'lecture-slide' }))
    const firstTurn = await collectUntil(socket, 'done')
    expect(firstTurn.filter((message) => message.type === 'token').map((message) => message.text).join('')).toBe(
      'turn 1: explain this slide [image]',
    )

    socket.send(JSON.stringify({ text: 'simplify it', preset_id: 'lecture-slide' }))
    const secondTurn = await collectUntil(socket, 'done')
    expect(secondTurn.filter((message) => message.type === 'token').map((message) => message.text).join('')).toBe(
      'turn 2: simplify it',
    )

    expect(bridge.requests).toHaveLength(2)
    expect(bridge.requests[0]).toMatchObject({
      systemPrompt: expect.stringContaining('You are Delfin'),
      sessionId: expect.any(String),
      message: {
        role: 'user',
        content: [
          { type: 'image', blob: 'abc123' },
          { type: 'text', text: 'explain this slide' },
        ],
      },
    })
    expect(bridge.requests[0]).not.toHaveProperty('messages')
    expect(bridge.requests[1].sessionId).toBe(bridge.requests[0].sessionId)
    const closed = new Promise((resolve) => socket.once('close', resolve))
    socket.close()
    await closed
    await waitFor(() => bridge.resetSessions.length === 1)
    expect(bridge.resetSessions).toEqual([bridge.requests[0].sessionId])
  })

  it('forwards interrupt messages to the bridge', async () => {
    const tts = createMockTtsBackend({ backend: 'none', ready: false })
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: createMockBridge,
      createTtsBackend: () => tts,
    })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'please interrupt this response', preset_id: 'generic-screen' }))
    const firstChunk = await new Promise((resolvePromise) => {
      socket.once('message', (raw) => resolvePromise(JSON.parse(raw.toString())))
    })
    expect(firstChunk).toMatchObject({ type: 'token', text: 'partial ' })

    socket.send(JSON.stringify({ type: 'interrupt' }))
    const interrupted = await collectUntil(socket, 'error')

    expect(interrupted.at(-1)).toMatchObject({ type: 'error', message: 'Generation interrupted.' })
    socket.close()
  })

  it('cancels active proxy TTS on interrupt', async () => {
    const tts = createMockTtsBackend({ mode: 'interruptible' })
    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: createMockBridge,
      createTtsBackend: () => tts,
    })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'explain this slide', preset_id: 'generic-screen' }))
    await new Promise((resolvePromise) => {
      const seen = []
      socket.on('message', function onMessage(raw) {
        const message = JSON.parse(raw.toString())
        seen.push(message.type)
        if (seen.join(',') === 'token,token') {
          socket.off('message', onMessage)
          resolvePromise()
        }
      })
    })

    socket.send(JSON.stringify({ type: 'interrupt' }))
    const finished = await collectUntil(socket, 'done')

    expect(tts.state.cancelled).toBe(1)
    expect(finished.map((message) => message.type)).toEqual(['done'])
    socket.close()
  })

  it('surfaces bridge startup failures through health and websocket errors', async () => {
    const startupError =
      'LiteRT C++ model not found at D:/missing/gemma-4-E2B-it.litertlm. Set LITERT_CPP_MODEL.'

    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: () => {
        throw new Error(startupError)
      },
      createTtsBackend: () => createMockTtsBackend({ backend: 'none', ready: false }),
    })

    const healthResponse = await fetch(`http://127.0.0.1:${proxy.port}/health`)
    const healthPayload = await healthResponse.json()
    expect(healthResponse.status).toBe(503)
    expect(healthPayload).toMatchObject({
      status: 'error',
      backend: 'litert-cpp',
      message: startupError,
    })

    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)
    socket.send(JSON.stringify({ text: 'hello?', preset_id: 'generic-screen' }))
    const response = await collectUntil(socket, 'error')

    expect(response.at(-1)).toMatchObject({ type: 'error', message: startupError })
    socket.close()
  })
})