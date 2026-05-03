import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { startLitertCppProxy } from './litert-cpp-proxy.mjs'

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
    proxy = await startLitertCppProxy({ host: '127.0.0.1', port: 0, createBridge: createMockBridge })

    const response = await fetch(`http://127.0.0.1:${proxy.port}/health`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ status: 'ok', backend: 'litert-cpp', model: 'mock-gemma-4' })
  })

  it('reuses a bridge session per connection and sends only the new user turn', async () => {
    const bridge = createMockBridge()
    proxy = await startLitertCppProxy({ host: '127.0.0.1', port: 0, createBridge: () => bridge })
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
    proxy = await startLitertCppProxy({ host: '127.0.0.1', port: 0, createBridge: createMockBridge })
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

  it('surfaces bridge startup failures through health and websocket errors', async () => {
    const startupError =
      'LiteRT C++ model not found at D:/missing/gemma-4-E2B-it.litertlm. Set LITERT_CPP_MODEL.'

    proxy = await startLitertCppProxy({
      host: '127.0.0.1',
      port: 0,
      createBridge: () => {
        throw new Error(startupError)
      },
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