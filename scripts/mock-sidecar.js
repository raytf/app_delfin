// Usage: node scripts/mock-sidecar.js
// Starts a WebSocket server on port 8321 that returns canned responses.
// Use this while building the Electron UI — no model needed.

const { WebSocketServer } = require('ws')
const PORT = process.env.SIDECAR_PORT || 8321

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  console.log('[mock-sidecar] Client connected')

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      console.error('[mock-sidecar] Invalid JSON:', raw.toString())
      return
    }

    if (msg.type === 'interrupt') {
      console.log('[mock-sidecar] Interrupt received')
      return
    }

    console.log(`[mock-sidecar] Received: "${msg.text}" (preset: ${msg.preset_id})`)

    // Simulate structured response
    const structured = {
      summary: 'This slide covers the fundamentals of the topic.',
      answer:
        'The key idea is that this concept builds on previous material and introduces new terminology that will be important for the exam.',
      key_points: [
        'First key concept explained',
        'Second important term defined',
        'Third relationship between ideas',
      ],
    }

    ws.send(JSON.stringify({ type: 'structured', data: structured }))

    // Simulate streaming tokens
    const words = structured.answer.split(' ')
    let i = 0
    const interval = setInterval(() => {
      if (i >= words.length) {
        clearInterval(interval)
        ws.send(JSON.stringify({ type: 'done' }))
        return
      }
      ws.send(JSON.stringify({ type: 'token', text: words[i] + ' ' }))
      i++
    }, 100)
  })

  ws.on('close', () => console.log('[mock-sidecar] Client disconnected'))
  ws.on('error', (err) => console.error('[mock-sidecar] Error:', err.message))
})

console.log(`[mock-sidecar] Running on ws://localhost:${PORT}/ws`)
console.log('[mock-sidecar] Press Ctrl-C to stop.')
