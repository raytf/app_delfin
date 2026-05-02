import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { startLitertCppProxy } from './litert-cpp-proxy.mjs'

function createMockBridge() {
  const inFlight = new Map()

  return {
    async ready() {},
    getInfo() {
      return { ready: true, backend: 'litert-cpp', model: 'mock-gemma-4' }
    },
    async generate(request, handlers) {
      const turnCount = request.messages.filter((message) => message.role === 'user').length
      const lastUserMessage = request.messages.at(-1)
      const prompt = (lastUserMessage?.content ?? [])
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join(' ')

      if (prompt.includes('interrupt')) {
        handlers.onToken('partial ')
        inFlight.set(request.requestId, handlers)
        return
      }

      const response = `turn ${turnCount}: ${prompt}`
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
    async close() {
      inFlight.clear()
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

  it('streams tokens and keeps per-connection conversation history', async () => {
    proxy = await startLitertCppProxy({ host: '127.0.0.1', port: 0, createBridge: createMockBridge })
    const socket = await openSocket(`ws://127.0.0.1:${proxy.port}/ws`)

    socket.send(JSON.stringify({ text: 'explain this slide', preset_id: 'lecture-slide' }))
    const firstTurn = await collectUntil(socket, 'done')
    expect(firstTurn.filter((message) => message.type === 'token').map((message) => message.text).join('')).toBe(
      'turn 1: explain this slide',
    )

    socket.send(JSON.stringify({ text: 'simplify it', preset_id: 'lecture-slide' }))
    const secondTurn = await collectUntil(socket, 'done')
    expect(secondTurn.filter((message) => message.type === 'token').map((message) => message.text).join('')).toBe(
      'turn 2: simplify it',
    )

    socket.close()
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
})