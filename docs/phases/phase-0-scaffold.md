# Phase 0 — Project Scaffold

> **Goal**: Create the repo structure, install all dependencies, write configuration files, and produce setup/verification scripts. At the end of this phase, `npm run dev:full` opens an empty Electron window and starts the sidecar together with a single command (the sidecar starts without a model loaded at this stage).

## 0.1 Scaffold the Electron project

Use `electron-vite` to create a new project:

```bash
npm create @electron-vite/create@latest delfin -- --template react-ts
```

If the scaffolding tool asks for options: select React, TypeScript, Tailwind CSS.

After scaffolding, the directory structure should roughly match the layout below. Reorganise files as needed to match this target structure — the scaffolding tool's defaults won't be exact.

### Target directory structure

```
delfin/
├── .env.example
├── .gitignore
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
│
├── scripts/
│   ├── setup-check.sh
│   ├── setup-check.ps1
│   └── mock-sidecar.js
│
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── capture/
│   │   │   ├── captureService.ts
│   │   │   ├── focusDetector.ts
│   │   │   └── autoRefresh.ts
│   │   ├── ipc/
│   │   │   └── handlers.ts
│   │   ├── overlay/
│   │   │   └── overlayWindow.ts
│   │   └── sidecar/
│   │       ├── wsClient.ts
│   │       └── healthCheck.ts
│   │
│   ├── renderer/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── CapturePreview.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── QuickActions.tsx
│   │   │   ├── PresetPicker.tsx
│   │   │   ├── StatusIndicator.tsx
│   │   │   ├── StopButton.tsx
│   │   │   └── MinimizeToggle.tsx
│   │   ├── stores/
│   │   │   ├── sessionStore.ts
│   │   │   ├── captureStore.ts
│   │   │   └── settingsStore.ts
│   │   └── styles/
│   │       └── globals.css
│   │
│   ├── preload/
│   │   └── index.ts
│   │
│   └── shared/
│       ├── types.ts
│       ├── schemas.ts
│       └── constants.ts
│
├── sidecar/
│   ├── requirements.txt
│   ├── server.py
│   ├── inference/
│   │   ├── engine.py
│   │   └── preprocess.py
│   ├── prompts/
│   │   ├── presets.py
│   │   ├── lecture_slide.py
│   │   └── generic_screen.py
│   └── tts.py
│
└── demo-content/
    └── README.md
```

**Important**: Create placeholder files for everything under `src/main/capture/`, `src/main/sidecar/`, `src/renderer/components/`, `src/renderer/stores/`, and `sidecar/`. Placeholders should export empty functions, empty components, or TODO comments — just enough so imports don't break. They'll be implemented in later phases.

## 0.2 Configure dependencies

### package.json — ensure these are present

```
devDependencies:
  electron: ^34.x
  electron-builder: ^25.x
  typescript: ^5.x
  vite: ^6.x
  @vitejs/plugin-react: ^4.x
  electron-vite: ^3.x
  @types/node: latest
  @types/ws: latest
  tailwindcss: ^4.x
  concurrently: ^9.x

dependencies:
  react: ^19.x
  react-dom: ^19.x
  zustand: ^5.x
  zod: ^3.x
  ws: ^8.x
  dotenv: ^16.x
```

### package.json — npm scripts

Add the following scripts. `dev:full` is the primary development entry point — it starts the Python sidecar and the Electron + Vite dev server together with a single command:

```json
"scripts": {
  "dev": "electron-vite dev",
  "dev:full": "concurrently --names \"sidecar,electron\" --prefix-colors \"cyan,magenta\" \"cd sidecar && uvicorn server:app --host 0.0.0.0 --port 8321\" \"npm run dev\"",
  "build": "electron-vite build",
  "preview": "electron-vite preview"
}
```

- **`npm run dev:full`** — starts both processes simultaneously. `concurrently` labels and colour-codes their output in the same terminal. Ctrl-C kills both.
- **`npm run dev`** — starts Electron + Vite only. Use this when the sidecar is already running (or when using the mock sidecar via `node scripts/mock-sidecar.js`).

### sidecar/requirements.txt

```
fastapi[standard]
uvicorn[standard]
litert-lm>=0.10.1
pillow
numpy
websockets
huggingface-hub
python-dotenv
kokoro-onnx
```

## 0.3 Shared types and schemas

### src/shared/types.ts

Define all TypeScript interfaces for the WebSocket protocol, IPC channels, and data models. This file is the contract between all layers. Include:

```typescript
// CaptureFrame
export interface CaptureFrame {
  imageBase64: string;   // JPEG base64
  width: number;
  height: number;
  capturedAt: number;    // unix ms
  sourceLabel: string;
}

// Chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  latencyMs?: number;
  structuredData?: StructuredResponse;
}

export interface StructuredResponse {
  summary: string;
  answer: string;
  key_points: string[];
}

// WebSocket outbound (Electron → Sidecar)
export interface WsOutboundMessage {
  image?: string;
  text: string;
  preset_id: string;
}

export interface WsInterruptMessage {
  type: 'interrupt';
}

// WebSocket inbound (Sidecar → Electron)
export type WsInboundType = 'token' | 'structured' | 'audio_start' | 'audio_chunk' | 'audio_end' | 'done' | 'error';

export interface WsInboundMessage {
  type: WsInboundType;
  text?: string;
  data?: StructuredResponse;
  audio?: string;
  message?: string;
}

// IPC channel names (as const for type safety)
export const IPC_CHANNELS = {
  CAPTURE_NOW: 'capture:now',
  CAPTURE_AUTO_REFRESH: 'capture:auto-refresh',
  SIDECAR_SEND: 'sidecar:send',
  SIDECAR_INTERRUPT: 'sidecar:interrupt',
  FRAME_CAPTURED: 'frame:captured',
  SIDECAR_TOKEN: 'sidecar:token',
  SIDECAR_STRUCTURED: 'sidecar:structured',
  SIDECAR_AUDIO_START: 'sidecar:audio_start',
  SIDECAR_AUDIO_CHUNK: 'sidecar:audio_chunk',
  SIDECAR_AUDIO_END: 'sidecar:audio_end',
  SIDECAR_DONE: 'sidecar:done',
  SIDECAR_ERROR: 'sidecar:error',
  SIDECAR_STATUS: 'sidecar:status',
} as const;

// Presets
export type PresetId = 'lecture-slide' | 'generic-screen';

export interface Preset {
  id: PresetId;
  label: string;
  starterQuestions: string[];
}

// Sidecar status
export interface SidecarStatus {
  connected: boolean;
  backend?: string;
  model?: string;
  visionTokens?: string;
}
```

### src/shared/schemas.ts

Create Zod schemas that mirror each interface above. These are used to validate incoming WebSocket messages at runtime.

### src/shared/constants.ts

```typescript
export const PRESETS: Preset[] = [
  {
    id: 'lecture-slide',
    label: 'Lecture Slides',
    starterQuestions: [
      'Summarize this slide',
      'Explain the key concepts simply',
      'Quiz me on this material',
      'What are the important terms here?',
    ],
  },
  {
    id: 'generic-screen',
    label: 'Generic Screen',
    starterQuestions: [
      'What am I looking at?',
      'Summarize the key information',
      'Explain this in detail',
      'What should I pay attention to?',
    ],
  },
];

export const DEFAULT_PRESET: PresetId = 'lecture-slide';
export const SIDEBAR_WIDTH = 420;
```

## 0.4 Environment configuration

### .env.example

Create this file with all variables documented:

```env
# ============================================================
# Delfin — Environment Configuration
# Copy this file to .env and adjust for your machine.
# ============================================================

# --- Model ---
# Switch to gemma-4-E4B-it-litert-lm for 32 GB machines
MODEL_REPO=litert-community/gemma-4-E2B-it-litert-lm
MODEL_FILE=gemma-4-E2B-it.litertlm

# --- Sidecar ---
# Bind to 0.0.0.0 so Windows (host) can reach WSL2
SIDECAR_HOST=0.0.0.0
SIDECAR_PORT=8321

# --- Electron ---
# On WSL2 if localhost fails, use WSL2 IP (run: hostname -I)
SIDECAR_WS_URL=ws://localhost:8321/ws

# --- Inference ---
# Options: CPU (default), GPU (Metal on Mac, OpenCL on Linux)
LITERT_BACKEND=CPU
LITERT_CACHE_DIR=/tmp/litert-cache
# Visual tokens per image. Lower = faster prefill. Range: 70-1120
VISION_TOKEN_BUDGET=280
# Max image width in pixels before resize. 512 is good for slides.
MAX_IMAGE_WIDTH=512

# --- TTS ---
TTS_ENABLED=false
# Options: web-speech (zero-dep), kokoro (Linux/WSL2), mlx (macOS)
TTS_BACKEND=web-speech
```

### .gitignore

Ensure these entries exist:

```
node_modules/
dist/
out/
.env
__pycache__/
*.pyc
.venv/
*.egg-info/
.DS_Store
```

## 0.5 Setup verification scripts

### scripts/setup-check.sh

A bash script (Linux/macOS) that checks the development environment:

```bash
#!/usr/bin/env bash
set -e

echo "=== Delfin Setup Check ==="
echo ""

# Node.js
if command -v node &> /dev/null; then
  NODE_V=$(node -v)
  echo "✅ Node.js: $NODE_V"
else
  echo "❌ Node.js: not found (need 20+)"
fi

# Python
if command -v python3 &> /dev/null; then
  PY_V=$(python3 --version)
  echo "✅ Python: $PY_V"
else
  echo "❌ Python 3: not found (need 3.12+)"
fi

# LiteRT-LM
if python3 -c "import litert_lm" 2>/dev/null; then
  echo "✅ litert-lm: installed"
else
  echo "❌ litert-lm: not installed (pip install litert-lm>=0.10.1)"
fi

# node_modules
if [ -d "node_modules" ]; then
  echo "✅ node_modules: present"
else
  echo "⚠️  node_modules: missing (run npm install)"
fi

# .env
if [ -f ".env" ]; then
  echo "✅ .env: present"
else
  echo "⚠️  .env: missing (copy from .env.example)"
fi

# Sidecar health check
SIDECAR_PORT=${SIDECAR_PORT:-8321}
if curl -s "http://localhost:$SIDECAR_PORT/health" > /dev/null 2>&1; then
  echo "✅ Sidecar: running on port $SIDECAR_PORT"
else
  echo "⚠️  Sidecar: not running on port $SIDECAR_PORT"
fi

echo ""
echo "=== Done ==="
```

Make it executable: `chmod +x scripts/setup-check.sh`

### scripts/setup-check.ps1

PowerShell equivalent for Windows users. Same checks, adapted syntax.

### scripts/mock-sidecar.js

A minimal Node.js WebSocket server that simulates the sidecar for UI development:

```javascript
// Usage: node scripts/mock-sidecar.js
// Starts a WebSocket server on port 8321 that returns canned responses.

const { WebSocketServer } = require('ws');
const PORT = process.env.SIDECAR_PORT || 8321;

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'interrupt') {
      console.log('Interrupt received');
      return;
    }

    console.log(`Received: ${msg.text} (preset: ${msg.preset_id})`);

    // Simulate structured response
    const structured = {
      summary: 'This slide covers the fundamentals of the topic.',
      answer: 'The key idea is that this concept builds on previous material and introduces new terminology that will be important for the exam.',
      key_points: [
        'First key concept explained',
        'Second important term defined',
        'Third relationship between ideas',
      ],
    };

    // Send structured response
    ws.send(JSON.stringify({ type: 'structured', data: structured }));

    // Simulate streaming tokens
    const words = structured.answer.split(' ');
    let i = 0;
    const interval = setInterval(() => {
      if (i >= words.length) {
        clearInterval(interval);
        ws.send(JSON.stringify({ type: 'done' }));
        return;
      }
      ws.send(JSON.stringify({ type: 'token', text: words[i] + ' ' }));
      i++;
    }, 100);
  });

  ws.on('close', () => console.log('Client disconnected'));
});

console.log(`Mock sidecar running on ws://localhost:${PORT}/ws`);
```

## 0.6 Sidecar placeholder

### sidecar/server.py

A minimal FastAPI app with just the `/health` endpoint (no model loading yet):

```python
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": False,
        "backend": os.environ.get("LITERT_BACKEND", "CPU"),
        "model": os.environ.get("MODEL_FILE", "none"),
        "vision_tokens": os.environ.get("VISION_TOKEN_BUDGET", "280"),
    }
```

## 0.7 Electron entry point (minimal)

### src/main/index.ts

A minimal Electron main process that:
1. Creates a BrowserWindow (default size, not the overlay yet — that's Phase 2)
2. Loads the Vite dev server URL (or production HTML)
3. Logs "Delfin started" to console

This is just to verify the scaffold works. Overlay window, IPC, and capture come in Phase 2.

### src/renderer/App.tsx

A minimal React component that renders:
```
Delfin
Status: Initialising...
```

Just enough to confirm React is rendering inside Electron.

## 0.8 Demo content

### demo-content/README.md

```markdown
# Demo Content

Place lecture slide screenshots here for testing.

Recommended: 3-4 slides covering:
- Text-heavy slide
- Diagram-heavy slide
- Code-heavy slide
- Jargon-heavy slide

Save as JPEG or PNG. The sidecar will accept base64-encoded images.
```

---

## ✅ Phase 0 — Verification Checklist

Run these checks after completing this phase. All must pass.

- [ ] `npm install` completes without errors
- [ ] `npm run dev:full` opens an Electron window showing "Delfin" and "Status: Initialising..." **and** starts the sidecar — both visible in the same terminal with labelled output
- [ ] `npm run dev` (Electron only) also works independently, for use alongside the mock sidecar
- [ ] `.env.example` exists with all 11 variables documented
- [ ] `.env` is in `.gitignore`
- [ ] `src/shared/types.ts` exports all interfaces listed above
- [ ] `src/shared/schemas.ts` exports Zod schemas for `WsInboundMessage` and `WsOutboundMessage`
- [ ] `src/shared/constants.ts` exports `PRESETS` and `DEFAULT_PRESET`
- [ ] All placeholder files exist in the directory structure (they can be empty/stub)
- [ ] `cd sidecar && pip install -r requirements.txt` completes (in venv or with --break-system-packages)
- [ ] `curl http://localhost:8321/health` (while `dev:full` is running) returns JSON with `status: "ok"`
- [ ] `node scripts/mock-sidecar.js` starts and accepts a WebSocket connection on port 8321
- [ ] `bash scripts/setup-check.sh` runs and prints check results
- [ ] `git status` shows no untracked files that should be ignored (node_modules, .env, __pycache__)
