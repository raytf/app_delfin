// Usage: node scripts/mock-sidecar.js
// Starts a WebSocket server on port 8321 that returns canned responses.
// Use this while building the Electron UI — no model needed.

const { WebSocketServer } = require('ws')
const PORT = process.env.SIDECAR_PORT || 8321

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  console.log('[mock-sidecar] Client connected')
  let activeInterval = null
  let activeRequestId = null

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      console.error('[mock-sidecar] Invalid JSON:', raw.toString())
      return
    }

    if (msg.type === 'interrupt') {
      console.log(`[mock-sidecar] Interrupt received (${msg.requestId})`)
      if (activeRequestId === msg.requestId && activeInterval !== null) {
        clearInterval(activeInterval)
        activeInterval = null
        ws.send(JSON.stringify({
          type: 'done',
          requestId: msg.requestId,
          interrupted: true,
        }))
      }
      return
    }

    if (activeInterval !== null && activeRequestId !== null) {
      clearInterval(activeInterval)
      ws.send(JSON.stringify({
        type: 'done',
        requestId: activeRequestId,
        interrupted: true,
      }))
    }

    activeRequestId = msg.requestId
    const preset = msg.presetId || msg.preset_id
    console.log(`[mock-sidecar] Received: "${msg.text}" (preset: ${preset}, requestId: ${activeRequestId})`)

    // Simulate plain streaming response (no structured message)
    const responseText =
      'The key idea is that this concept builds on previous material and introduces new terminology that will be important for the exam.\n\nKey Points:\n- First key concept explained clearly\n- Second important term defined in context\n- Third relationship between ideas established'

    const words = responseText.split(' ')
    let i = 0
    activeInterval = setInterval(() => {
      if (i >= words.length) {
        if (activeInterval !== null) {
          clearInterval(activeInterval)
          activeInterval = null
        }
        ws.send(JSON.stringify({
          type: 'done',
          requestId: activeRequestId,
          interrupted: false,
        }))
        activeRequestId = null
        return
      }
      ws.send(JSON.stringify({
        type: 'token',
        requestId: activeRequestId,
        text: words[i] + ' ',
      }))
      i++
    }, 100)
  })

  ws.on('close', () => console.log('[mock-sidecar] Client disconnected'))
  ws.on('error', (err) => console.error('[mock-sidecar] Error:', err.message))
})

console.log(`[mock-sidecar] Running on ws://localhost:${PORT}/ws`)
console.log('[mock-sidecar] Press Ctrl-C to stop.')
