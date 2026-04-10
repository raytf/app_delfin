# Screen Copilot — 1.5-Day Hackathon Implementation Plan (v2)

> **A local, privacy-first screen copilot that helps you understand what's on your screen.**
> Demo focus: Lecture Slide Explainer → extensible to any window.
> Runs offline on most laptops. No cloud. No data leaves your machine.

---

## Table of Contents

1. [Constraints & Decisions](#1-constraints--decisions)
2. [Architecture](#2-architecture)
3. [Stack & Dependencies](#3-stack--dependencies)
4. [Folder Structure](#4-folder-structure)
5. [Data Model](#5-data-model)
6. [Inference Sidecar (Python + LiteRT-LM)](#6-inference-sidecar)
7. [Capture Service (Electron Main)](#7-capture-service)
8. [Overlay Sidebar UX](#8-overlay-sidebar-ux)
9. [Preset System & Prompts](#9-preset-system--prompts)
10. [IPC & API Contract](#10-ipc--api-contract)
11. [Workstream Structure (5 people)](#11-workstream-structure)
12. [Hour-by-Hour Schedule](#12-hour-by-hour-schedule)
13. [Demo Script](#13-demo-script)
14. [Setup Checklist (Before Saturday)](#14-setup-checklist)
15. [Risk Mitigations](#15-risk-mitigations)
16. [Nice-to-Haves & Post-Hackathon](#16-nice-to-haves--post-hackathon)
17. [Pitch Outline (Technical)](#17-pitch-outline)

---

## 1. Constraints & Decisions

### Hardware target
- Lenovo ThinkPad X1 Carbon, 32 GB RAM, Intel CPU, no discrete GPU
- Must also work on teammates' laptops (assume 32 GB, Windows + WSL2)
- macOS support is a nice-to-have

### Inference
- **LiteRT-LM** as the inference engine (Google's optimized on-device runtime)
- **Gemma 4 E2B** as primary model (~1.4 GB, ~5–10 tok/s on CPU)
- Gemma 4 E4B as optional upgrade for beefier machines
- LiteRT-LM Python API runs on Linux/macOS — on Windows, runs inside **WSL2**
- Python FastAPI sidecar exposes HTTP API to the Electron app
- Bare `pip install` first; Docker as a nice-to-have

### Desktop framework
- **Electron** — `desktopCapturer` API provides zero-effort screen/window capture
- First Electron project for the team — plan accounts for learning curve

### UX
- **Floating sidebar overlay** pinned to right edge of screen, always-on-top
- Captures the **foreground window automatically** (excluding the sidebar itself)
- Manual window selection as a nice-to-have
- Keyboard shortcut (Ctrl+Shift+C) as a nice-to-have

### Team
- 5 people total, mostly full-stack TS/React, some Python
- Structured by workstream so roles are self-assignable

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│  Windows Desktop                                    │
│                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │                      │  │  Electron Overlay     │ │
│  │  User's App          │  │  (sidebar, right edge)│ │
│  │  (Slides, Browser,   │  │                       │ │
│  │   any window)        │  │  ┌─────────────────┐  │ │
│  │                      │  │  │ Capture Preview │  │ │
│  │                      │  │  ├─────────────────┤  │ │
│  │                      │  │  │ Chat Panel      │  │ │
│  │                      │  │  │ (streaming)     │  │ │
│  │                      │  │  ├─────────────────┤  │ │
│  │                      │  │  │ Quick Actions   │  │ │
│  │                      │  │  └─────────────────┘  │ │
│  └──────────────────────┘  └──────────┬───────────┘ │
│                                       │ IPC         │
│  ┌────────────────────────────────────┐│            │
│  │  Electron Main Process             ││            │
│  │  - desktopCapturer (screenshots)   ││            │
│  │  - Window enumeration              ││            │
│  │  - Auto-refresh timer              ││            │
│  └────────────────────┬───────────────┘│            │
│                       │ HTTP (localhost:8321)        │
│  ┌────────────────────▼───────────────────────────┐ │
│  │  WSL2 (or native Linux/macOS)                  │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │  Python FastAPI Sidecar                  │  │ │
│  │  │  - LiteRT-LM Engine (Gemma 4 E2B)       │  │ │
│  │  │  - Vision + text multimodal inference    │  │ │
│  │  │  - Streaming SSE responses               │  │ │
│  │  │  - Preset prompt management              │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Why this split?

- **Electron main process** handles all OS-level capture via `desktopCapturer` — this is Windows-native, no WSL needed.
- **Python sidecar in WSL2** runs LiteRT-LM, which only supports Linux/macOS. WSL2 is transparent to the user on Windows.
- **HTTP between them** — Electron (Windows) calls `http://localhost:8321` which WSL2 forwards automatically. No special networking needed.
- The sidecar is a standard FastAPI server — any teammate on macOS or Linux runs it natively without WSL.

---

## 3. Stack & Dependencies

### Electron App (TypeScript)

```json
{
  "devDependencies": {
    "electron": "^34.x",
    "electron-builder": "^25.x",
    "typescript": "^5.x",
    "vite": "^6.x",
    "@vitejs/plugin-react": "^4.x",
    "electron-vite": "^3.x"
  },
  "dependencies": {
    "react": "^19.x",
    "react-dom": "^19.x",
    "zustand": "^5.x",
    "zod": "^3.x",
    "tailwindcss": "^4.x"
  }
}
```

### Python Sidecar

```
# requirements.txt
litert-lm-api-nightly
fastapi[standard]
uvicorn[standard]
pillow
```

### Why each choice
- **electron-vite** — simplest Electron + Vite + React scaffolding, handles main/renderer split
- **zustand** — tiny state manager, no boilerplate, good for fast prototyping
- **zod** — runtime validation for messages between Electron ↔ sidecar
- **tailwindcss** — fastest path to decent UI without a component library
- **litert-lm-api-nightly** — LiteRT-LM Python bindings with multimodal support
- **fastapi** — quick HTTP server with streaming SSE support, team knows Python
- **pillow** — image resize/compress before sending to model

---

## 4. Folder Structure

```
screen-copilot/
├── README.md
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
│
├── src/
│   ├── main/                              # Electron main process
│   │   ├── index.ts                       # App entry, window creation
│   │   ├── capture/
│   │   │   ├── captureService.ts          # desktopCapturer wrapper
│   │   │   ├── focusDetector.ts           # Detect foreground window
│   │   │   └── autoRefresh.ts             # Timer + hash-based diff
│   │   ├── ipc/
│   │   │   └── handlers.ts               # IPC channel registration
│   │   ├── overlay/
│   │   │   └── overlayWindow.ts           # Sidebar window config
│   │   └── sidecar/
│   │       └── healthCheck.ts             # Ping Python sidecar
│   │
│   ├── renderer/                          # React sidebar UI
│   │   ├── index.html
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── CapturePreview.tsx         # Screenshot thumbnail
│   │   │   ├── ChatPanel.tsx              # Message list + streaming
│   │   │   ├── ChatInput.tsx              # Text input + send
│   │   │   ├── QuickActions.tsx           # Preset action buttons
│   │   │   ├── PresetPicker.tsx           # Mode selector dropdown
│   │   │   ├── StatusIndicator.tsx        # Connection + model status
│   │   │   └── MinimizeToggle.tsx         # Collapse/expand sidebar
│   │   ├── stores/
│   │   │   ├── sessionStore.ts            # Frame, messages, streaming
│   │   │   ├── captureStore.ts            # Source, auto-refresh
│   │   │   └── settingsStore.ts           # Sidecar URL, model, preset
│   │   └── styles/
│   │       └── globals.css
│   │
│   └── shared/                            # Shared types
│       ├── types.ts
│       ├── schemas.ts
│       └── constants.ts
│
├── sidecar/                               # Python inference server
│   ├── requirements.txt
│   ├── server.py                          # FastAPI app
│   ├── inference/
│   │   ├── engine.py                      # LiteRT-LM engine wrapper
│   │   └── preprocess.py                  # Image resize/format
│   ├── prompts/
│   │   ├── presets.py                     # Preset definitions
│   │   ├── lecture_slide.py               # Lecture system prompt
│   │   └── generic_screen.py             # Generic system prompt
│   ├── setup_model.py                     # Download model from HF
│   └── Dockerfile                         # Nice-to-have
│
└── demo-content/                          # Test slides for demo
    ├── sample-lecture-1.pdf
    ├── sample-lecture-2.pptx
    └── README.md                          # Where to find good slides
```

---

## 5. Data Model

```typescript
// shared/types.ts

// ── Capture ──────────────────────────────────────────

export interface CaptureFrame {
  imageBase64: string           // JPEG base64
  width: number
  height: number
  capturedAt: number            // unix ms
  sourceLabel: string           // window title, e.g. "Google Slides — Lecture 5"
}

// ── Presets ──────────────────────────────────────────

export interface PromptPreset {
  id: string
  label: string
  icon: string
  systemPrompt: string
  starterQuestions: string[]
}

// ── Chat ────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  latencyMs?: number
}

// ── Session ─────────────────────────────────────────

export interface Session {
  presetId: string
  currentFrame: CaptureFrame | null
  previousFrame: CaptureFrame | null   // for "what changed?"
  messages: ChatMessage[]
  isStreaming: boolean
  autoRefresh: {
    enabled: boolean
    intervalMs: number                  // default 5000
  }
}

// ── Sidecar API ─────────────────────────────────────

export interface AnalyzeRequest {
  image_base64: string
  question: string
  system_prompt: string
  history: Array<{ role: string; content: string }>
}

// SSE stream yields chunks: { text: string, done: boolean }
```

---

## 6. Inference Sidecar (Python + LiteRT-LM)

This is the critical path. The sidecar is a Python FastAPI server that wraps LiteRT-LM.

### server.py

```python
import asyncio
import base64
import io
import json
import os
import tempfile
from contextlib import asynccontextmanager

import litert_lm
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

# ── Config ──────────────────────────────────────────

MODEL_PATH = os.environ.get(
    "MODEL_PATH",
    os.path.expanduser("~/.cache/litert-lm/gemma-4-E2B-it.litertlm")
)

# ── App Lifecycle ───────────────────────────────────

engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    print(f"Loading model from {MODEL_PATH}...")
    engine = litert_lm.Engine(
        MODEL_PATH,
        vision_backend=litert_lm.Backend.CPU,
    )
    engine.__enter__()
    print("Model loaded.")
    yield
    engine.__exit__(None, None, None)

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request Schema ──────────────────────────────────

class AnalyzeRequest(BaseModel):
    image_base64: str
    question: str
    system_prompt: str
    history: list[dict] = []

# ── Endpoints ───────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": engine is not None}

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """Non-streaming analysis — simpler, good for testing."""
    # Save image to temp file for LiteRT-LM
    image_path = _save_temp_image(req.image_base64)

    with engine.create_conversation() as conv:
        # Send system prompt as first message if supported
        # Build user message with image
        user_message = {
            "role": "user",
            "content": [
                {"type": "image", "path": image_path},
                {"type": "text", "text": f"{req.system_prompt}\n\n{req.question}"},
            ],
        }
        response = conv.send_message(user_message)
        text = response["content"][0]["text"]

    _cleanup_temp(image_path)
    return {"text": text}

@app.post("/analyze/stream")
async def analyze_stream(req: AnalyzeRequest):
    """Streaming analysis via SSE — better UX during inference."""
    image_path = _save_temp_image(req.image_base64)

    async def event_generator():
        with engine.create_conversation() as conv:
            user_message = {
                "role": "user",
                "content": [
                    {"type": "image", "path": image_path},
                    {"type": "text", "text": f"{req.system_prompt}\n\n{req.question}"},
                ],
            }
            for chunk in conv.send_message_async(user_message):
                text_piece = chunk["content"][0]["text"]
                yield f"data: {json.dumps({'text': text_piece, 'done': False})}\n\n"
                await asyncio.sleep(0)  # yield control

        yield f"data: {json.dumps({'text': '', 'done': True})}\n\n"
        _cleanup_temp(image_path)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )

# ── Helpers ─────────────────────────────────────────

def _save_temp_image(base64_str: str) -> str:
    """Decode base64 JPEG, resize if needed, save to temp file."""
    img_bytes = base64.b64decode(base64_str)
    img = Image.open(io.BytesIO(img_bytes))

    # Resize to max 1024px wide to keep token budget low
    max_width = 1024
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)

    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    img.save(tmp, format="JPEG", quality=85)
    tmp.close()
    return tmp.name

def _cleanup_temp(path: str):
    try:
        os.unlink(path)
    except OSError:
        pass
```

### setup_model.py

```python
"""Download Gemma 4 E2B LiteRT-LM model from HuggingFace."""
import subprocess
import sys
import os

MODEL_DIR = os.path.expanduser("~/.cache/litert-lm")
REPO = "litert-community/gemma-4-E2B-it-litert-lm"
FILENAME = "gemma-4-E2B-it.litertlm"

def setup():
    os.makedirs(MODEL_DIR, exist_ok=True)
    dest = os.path.join(MODEL_DIR, FILENAME)
    if os.path.exists(dest):
        print(f"Model already exists at {dest}")
        return

    print(f"Downloading {FILENAME} from {REPO}...")
    # Use huggingface_hub CLI or litert-lm CLI
    subprocess.run([
        sys.executable, "-m", "litert_lm", "run",
        f"--from-huggingface-repo={REPO}",
        FILENAME,
        "--prompt", "test",  # minimal run to trigger download
    ], check=True)
    print("Model downloaded.")

if __name__ == "__main__":
    setup()
```

### Running the sidecar

```bash
# First time setup (in WSL2 on Windows, or natively on Linux/macOS)
cd sidecar
pip install -r requirements.txt
python setup_model.py

# Run
uvicorn server:app --host 0.0.0.0 --port 8321
```

On Windows, WSL2 automatically forwards localhost ports to the Windows host,
so Electron on Windows can reach `http://localhost:8321` directly.

---

## 7. Capture Service (Electron Main)

### Foreground window detection + capture

```typescript
// main/capture/captureService.ts

import { desktopCapturer, BrowserWindow } from 'electron'

export interface CapturedFrame {
  imageBase64: string
  width: number
  height: number
  sourceLabel: string
}

/**
 * Capture the current foreground window, excluding our overlay.
 *
 * Strategy: get all window sources, filter out our own Electron window,
 * then pick the first one (which is typically the foreground app).
 */
export async function captureForegroundWindow(
  overlayWindowId: number
): Promise<CapturedFrame> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1920, height: 1080 },
    fetchWindowIcons: false,
  })

  // Filter out our own overlay window
  const candidates = sources.filter(s => {
    // Electron window IDs don't directly match desktopCapturer source IDs,
    // but we can filter by title or use a known prefix
    return !s.name.includes('Screen Copilot')
  })

  if (candidates.length === 0) {
    throw new Error('No capturable windows found')
  }

  // First candidate is typically the most recently focused window
  const source = candidates[0]
  const thumbnail = source.thumbnail

  // Convert NativeImage to JPEG base64
  const jpegBuffer = thumbnail.toJPEG(80)
  const base64 = jpegBuffer.toString('base64')
  const size = thumbnail.getSize()

  return {
    imageBase64: base64,
    width: size.width,
    height: size.height,
    sourceLabel: source.name,
  }
}

/**
 * List all available windows (for manual selection — nice-to-have)
 */
export async function listWindows() {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
  })

  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }))
}
```

### Auto-refresh with hash diffing

```typescript
// main/capture/autoRefresh.ts

import crypto from 'crypto'
import { captureForegroundWindow } from './captureService'
import type { CapturedFrame } from './captureService'

export class AutoRefreshManager {
  private timer: NodeJS.Timeout | null = null
  private lastHash = ''
  private overlayWindowId: number
  private onNewFrame: (frame: CapturedFrame) => void

  constructor(overlayWindowId: number, onNewFrame: (frame: CapturedFrame) => void) {
    this.overlayWindowId = overlayWindowId
    this.onNewFrame = onNewFrame
  }

  start(intervalMs = 5000) {
    this.stop()
    this.timer = setInterval(() => this.tick(), intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick() {
    try {
      const frame = await captureForegroundWindow(this.overlayWindowId)

      // Hash a sample of the image to detect changes
      const hash = crypto
        .createHash('md5')
        .update(frame.imageBase64.slice(0, 8000))
        .digest('hex')

      if (hash !== this.lastHash) {
        this.lastHash = hash
        this.onNewFrame(frame)
      }
    } catch (err) {
      console.error('Auto-refresh error:', err)
    }
  }
}
```

---

## 8. Overlay Sidebar UX

### Window configuration

```typescript
// main/overlay/overlayWindow.ts

import { BrowserWindow, screen } from 'electron'
import path from 'path'

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  const SIDEBAR_WIDTH = 420

  const win = new BrowserWindow({
    x: screenWidth - SIDEBAR_WIDTH,
    y: 0,
    width: SIDEBAR_WIDTH,
    height: screenHeight,
    frame: false,              // no title bar
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,         // don't clutter taskbar
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Prevent the overlay from stealing focus from the user's app
  win.setAlwaysOnTop(true, 'screen-saver')

  // Allow clicks to pass through when the sidebar is minimized
  // (toggle this when collapsed)
  // win.setIgnoreMouseEvents(true, { forward: true })

  return win
}
```

### Sidebar layout (React)

```
┌─────────────────────────┐
│ Screen Copilot    [—][×]│  ← Drag handle + minimize/close
├─────────────────────────┤
│ 🎓 Lecture Slides  ▾    │  ← Preset picker
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │   [Screenshot]      │ │  ← Capture preview (small)
│ │   Google Slides     │ │
│ │   Captured 3s ago   │ │
│ └─────────────────────┘ │
│ [📸 Capture] [⟳ Auto]  │  ← Capture button + auto-refresh toggle
├─────────────────────────┤
│                         │
│ 🤖 This slide covers   │  ← Chat messages (scrollable)
│ the concept of...       │
│                         │
│ You: Explain simply     │
│                         │
│ 🤖 In simple terms...  │
│                         │
├─────────────────────────┤
│ [Summarize] [Explain]   │  ← Quick actions (2x2 grid)
│ [Quiz Me] [Key Terms]   │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ Ask about this...   │ │  ← Text input
│ └─────────────────────┘ │
├─────────────────────────┤
│ 🟢 Local · E2B · 4.2s  │  ← Status bar
└─────────────────────────┘
```

Width: 420px fixed. The rest of the screen is available for the user's app.

---

## 9. Preset System & Prompts

### Lecture Slide Explainer (primary demo)

```python
# sidecar/prompts/lecture_slide.py

LECTURE_SLIDE_PRESET = {
    "id": "lecture-slide",
    "label": "Lecture Slides",
    "icon": "🎓",
    "system_prompt": """You are a lecture slide explainer helping a university student.
You are given a screenshot of a lecture slide currently being displayed.

Your tasks when asked to summarize or explain:
1. Summarize the visible slide content in 2–4 clear sentences.
2. List up to 3 key takeaways.
3. Explain any jargon, acronyms, or technical terms in plain language.
4. If the slide contains a diagram, chart, or figure, describe what it shows and why it matters.

When asked follow-up questions, answer using ONLY what is visible in the screenshot.

Rules:
- Never invent or assume content that is not visible.
- If text is too small, blurry, or cut off, say so explicitly.
- Be concise and student-friendly. Avoid academic jargon in your explanations.
- If asked to quiz, generate 2–3 questions a student could use for revision.""",
    "starter_questions": [
        "Summarize this slide",
        "Explain the key concepts simply",
        "Quiz me on this material",
        "What are the important terms here?",
    ],
}
```

### Generic Screen (extensibility demo)

```python
# sidecar/prompts/generic_screen.py

GENERIC_SCREEN_PRESET = {
    "id": "generic-screen",
    "label": "Screen Assistant",
    "icon": "🖥️",
    "system_prompt": """You are a local screen copilot. The user has captured a screenshot of their current screen.
This could be a browser page, application, document, spreadsheet, dashboard, terminal, form, or anything else.

Your approach:
1. Identify the type of content visible (webpage, app, code, spreadsheet, etc.).
2. Summarize the key information shown.
3. Answer the user's specific question, grounded only in visible evidence.
4. If content is cropped, unclear, or partially visible, say so.

Rules:
- Reference only what is actually visible in the screenshot.
- Be specific — cite visible text, numbers, labels, and UI elements.
- Do not guess at content outside the visible frame.
- All processing is local and private.""",
    "starter_questions": [
        "What am I looking at?",
        "Summarize the key information",
        "Explain this in detail",
        "What should I pay attention to?",
    ],
}
```

### Preset registry (Python side)

```python
# sidecar/prompts/presets.py

from .lecture_slide import LECTURE_SLIDE_PRESET
from .generic_screen import GENERIC_SCREEN_PRESET

PRESETS = {
    "lecture-slide": LECTURE_SLIDE_PRESET,
    "generic-screen": GENERIC_SCREEN_PRESET,
}

def get_system_prompt(preset_id: str) -> str:
    preset = PRESETS.get(preset_id, GENERIC_SCREEN_PRESET)
    return preset["system_prompt"]
```

### TypeScript preset mirror (for UI rendering)

```typescript
// shared/constants.ts

export const PRESETS = [
  {
    id: 'lecture-slide',
    label: 'Lecture Slides',
    icon: '🎓',
    starterQuestions: [
      'Summarize this slide',
      'Explain the key concepts simply',
      'Quiz me on this material',
      'What are the important terms here?',
    ],
  },
  {
    id: 'generic-screen',
    label: 'Screen Assistant',
    icon: '🖥️',
    starterQuestions: [
      'What am I looking at?',
      'Summarize the key information',
      'Explain this in detail',
      'What should I pay attention to?',
    ],
  },
] as const
```

---

## 10. IPC & API Contract

### Electron IPC channels (main ↔ renderer)

```typescript
// shared/schemas.ts

export const IPC = {
  // Renderer → Main
  CAPTURE_NOW: 'capture:now',              // trigger screenshot
  SET_AUTO_REFRESH: 'capture:auto-refresh', // { enabled, intervalMs }
  LIST_WINDOWS: 'capture:list-windows',    // nice-to-have

  // Main → Renderer
  FRAME_CAPTURED: 'frame:captured',        // CaptureFrame payload
  CAPTURE_ERROR: 'frame:error',            // error string
} as const
```

### Sidecar HTTP API (Electron main → Python)

```
GET  /health
     → { status: "ok", model_loaded: true }

POST /analyze
     Body: { image_base64, question, system_prompt, history }
     → { text: "..." }

POST /analyze/stream
     Body: { image_base64, question, system_prompt, history }
     → SSE stream: data: {"text": "chunk", "done": false}
                    data: {"text": "", "done": true}
```

The Electron main process calls the sidecar. The renderer never talks to the sidecar directly — all communication goes through IPC to keep the architecture clean and the renderer sandboxed.

---

## 11. Workstream Structure (5 People)

Three parallel workstreams, self-assignable. Each has a clear interface contract so they can integrate cleanly.

### Stream A: Capture + Electron Shell (2 people)

**Owns:** Everything in `src/main/`, overlay window, IPC handlers.

Tasks (in order):
1. Scaffold Electron + electron-vite project
2. Create overlay window (frameless, always-on-top, right edge)
3. Implement `captureForegroundWindow()` — screenshot the window behind the overlay
4. Wire IPC: renderer sends `CAPTURE_NOW` → main captures → sends `FRAME_CAPTURED` back
5. Implement auto-refresh manager with hash diffing
6. Wire auto-refresh toggle via IPC
7. Health check: ping sidecar `/health` on startup, show status
8. **Nice-to-have:** global keyboard shortcut (Ctrl+Shift+C)
9. **Nice-to-have:** manual window picker via `listWindows()`

**Integration contract:**
- Renderer calls `window.electronAPI.captureNow()` → gets back `CapturedFrame`
- Renderer calls `window.electronAPI.setAutoRefresh(enabled, intervalMs)`
- Renderer receives `frame:captured` events via preload bridge
- Main process calls `http://localhost:8321/analyze/stream` and forwards SSE chunks to renderer

### Stream B: React Sidebar UI (2 people)

**Owns:** Everything in `src/renderer/`.

Tasks (in order):
1. Sidebar layout — frameless window chrome (drag handle, minimize, close)
2. `CapturePreview` component — shows thumbnail, source label, timestamp
3. Capture button + auto-refresh toggle
4. `ChatPanel` — scrollable message list with user/assistant bubbles
5. `ChatInput` — text input with send button (Enter to send)
6. Streaming text display — characters appear as SSE chunks arrive
7. `QuickActions` — 2x2 grid of preset starter questions
8. `PresetPicker` — dropdown to switch between Lecture / Generic
9. `StatusIndicator` — connection status, model name, last latency
10. Zustand stores for session state
11. **Nice-to-have:** minimize/expand toggle (collapse to thin strip)
12. **Nice-to-have:** dark/light theme

**Integration contract:**
- Uses Zustand stores; calls IPC methods exposed via preload
- Does NOT call sidecar directly — gets streaming data from main process via IPC
- Quick action buttons just set the text input and submit

### Stream C: Inference Sidecar + Prompts (1 person)

**Owns:** Everything in `sidecar/`.

Tasks (in order):
1. Set up Python environment, install LiteRT-LM, download Gemma 4 E2B model
2. Verify vision inference works: send a test image, get text response
3. Build FastAPI server with `/health`, `/analyze`, `/analyze/stream`
4. Implement image preprocessing (resize, JPEG compress)
5. Write lecture-slide system prompt, test with real slide screenshots
6. Write generic-screen system prompt, test with browser/app screenshots
7. Tune prompt for quality — iterate on edge cases (diagrams, code, tables)
8. Write `setup_model.py` for teammates to download the model
9. Write setup instructions in README
10. **Nice-to-have:** multi-turn conversation support (pass history)
11. **Nice-to-have:** Dockerfile

**Integration contract:**
- Runs on `http://localhost:8321`
- Accepts POST with `{ image_base64, question, system_prompt, history }`
- Returns SSE stream for `/analyze/stream`

---

## 12. Hour-by-Hour Schedule

### Saturday Morning (9:00–12:00) — Foundation

All three streams work in parallel from hour 1.

| Time | Stream A (Capture) | Stream B (UI) | Stream C (Inference) |
|------|-------------------|---------------|---------------------|
| 9:00–9:30 | Scaffold Electron + electron-vite | Set up React renderer + Tailwind | Install LiteRT-LM + download E2B model |
| 9:30–10:00 | Create overlay window config | Sidebar layout + drag handle | Verify vision inference works with test image |
| 10:00–10:30 | Implement `captureForegroundWindow` | `CapturePreview` component | Build `/health` + `/analyze` endpoints |
| 10:30–11:00 | Wire IPC: capture button → screenshot | Capture button + mock preview | Build `/analyze/stream` SSE endpoint |
| 11:00–11:30 | Test capture: open slides, click capture, see result | `ChatPanel` + message bubbles | Image preprocessing (resize/compress) |
| 11:30–12:00 | **Integration checkpoint: Stream A ↔ B** | `ChatInput` component | Write lecture-slide prompt, test on slides |

**Milestone 1 (noon):** Clicking Capture in the sidebar takes a screenshot of the window behind it and shows it in the preview. Sidecar answers image questions independently.

### Saturday Afternoon (13:00–17:00) — End-to-End Flow

| Time | Stream A (Capture) | Stream B (UI) | Stream C (Inference) |
|------|-------------------|---------------|---------------------|
| 13:00–13:30 | Wire main process → sidecar HTTP call | `QuickActions` grid (Summarize, Explain, Quiz, Terms) | Tune lecture prompt with real slides |
| 13:30–14:00 | Forward SSE chunks from sidecar → renderer via IPC | Streaming text display in ChatPanel | Test edge cases: diagrams, code snippets, blurry text |
| 14:00–14:30 | **Integration: full end-to-end flow** | Wire QuickActions → submit question | Write generic-screen prompt |
| 14:30–15:00 | Debug end-to-end, fix timing issues | `PresetPicker` dropdown | Test generic prompt on browser pages |
| 15:00–15:30 | Sidecar health check + error states in UI | `StatusIndicator` (connected, model, latency) | Write `setup_model.py` + teammate README |
| 15:30–16:00 | **All streams: test full flow together** | Polish message rendering (markdown, bullets) | Fix prompt issues found during integration |
| 16:00–17:00 | **All streams: bug fixes + polish from testing** |

**Milestone 2 (5pm):** Open lecture slides → click Capture → click "Summarize this slide" → answer streams in. Follow-up questions work.

### Saturday Evening (17:00–19:00) — Polish

Everyone works on the same codebase now.

| Time | Focus |
|------|-------|
| 17:00–17:30 | Styling pass — consistent colors, spacing, fonts |
| 17:30–18:00 | Error handling — sidecar down, capture fails, empty frame |
| 18:00–18:30 | Test on a second teammate's laptop — find setup issues |
| 18:30–19:00 | Fix cross-machine issues, update setup instructions |

**Milestone 3 (7pm):** Demo-ready lecture slide explainer. Works on 2+ team laptops.

### Sunday Morning (9:00–12:00) — Auto-Refresh + Stretch

| Time | Stream A (Capture) | Stream B (UI) | Stream C (Inference) |
|------|-------------------|---------------|---------------------|
| 9:00–9:30 | Implement auto-refresh timer + hash diffing | Auto-refresh toggle button | Multi-turn: pass last 4 messages as history |
| 9:30–10:00 | Wire auto-refresh: new frames pushed to renderer | "New slide detected" indicator | Test multi-turn with "explain that concept more" |
| 10:00–10:30 | Test: advance slides, verify detection | Show previous vs current frame indicator | Tune for "What changed?" questions |
| 10:30–11:00 | **Nice-to-have:** keyboard shortcut Ctrl+Shift+C | **Nice-to-have:** minimize toggle | **Nice-to-have:** Dockerfile |
| 11:00–11:30 | **Nice-to-have:** manual window picker | **Nice-to-have:** dark mode | **Nice-to-have:** Ollama fallback provider |
| 11:30–12:00 | **All streams: integration testing** |

**Milestone 4 (noon):** Auto-refresh detects slide changes. Multi-turn works.

### Sunday Afternoon (13:00–15:00) — Demo Prep

| Time | Focus |
|------|-------|
| 13:00–13:30 | Prepare demo slides — pick 3–4 good lecture slides with diagrams + jargon |
| 13:30–14:00 | Rehearse demo flow: each team member runs through it once |
| 14:00–14:30 | Fix last bugs found during rehearsal |
| 14:30–15:00 | Final rehearsal — someone plays "visitor" and asks questions |

---

## 13. Demo Script

For exhibition visitors (free-flowing, ~2 minutes per visitor):

**Opening line:** "This is a local AI that helps you understand what's on your screen. Everything runs on this laptop — nothing goes to the cloud."

**Show it:**
1. Have a lecture slide open (Google Slides or PDF).
2. Point to the sidebar overlay on the right. "See this sidebar? It's always here."
3. Click **Capture**. Screenshot appears. "It just captured the slide behind it."
4. Click **Summarize this slide**. Answer streams in word by word.
5. "Watch — I can ask follow-ups." Type: "Explain [specific concept on the slide] more simply."
6. Click **Quiz me**. Model generates study questions.
7. If auto-refresh is working: advance to next slide. "See? It detected the new slide automatically."
8. If time: switch to a browser tab, change preset to Generic Screen, capture, ask "What am I looking at?"

**Closing line:** "It works with any window — slides, browser, apps, even bank statements. And nothing ever leaves your machine."

**For judges asking about technical depth:**
- "We use LiteRT-LM, Google's edge inference engine, running Gemma 4 on CPU."
- "The capture uses Electron's desktopCapturer with automatic foreground window detection."
- "Streaming responses come via Server-Sent Events from a local FastAPI sidecar."
- "The sidebar is a frameless always-on-top Electron window that excludes itself from capture."

---

## 14. Setup Checklist (Before Saturday)

### Every team member

- [ ] Install **Node.js 20+** and npm/pnpm
- [ ] Install **WSL2** (Windows only) — `wsl --install` in PowerShell admin
- [ ] Inside WSL2: install **Python 3.12+** and pip
- [ ] Inside WSL2: `pip install litert-lm-api-nightly fastapi uvicorn pillow`
- [ ] Download model: `litert-lm run --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm gemma-4-E2B-it.litertlm --prompt="test"` (triggers download, ~1.4 GB)
- [ ] Verify model works: send a test prompt, get a response
- [ ] Clone the team's GitHub repo
- [ ] Run `npm install` in the Electron project root

### One person (Stream A lead)

- [ ] Scaffold Electron + electron-vite project, push to GitHub
- [ ] Verify `desktopCapturer` works on Windows (may need to run Electron as admin)
- [ ] Test that WSL2 localhost port forwarding works: run FastAPI in WSL2, `curl http://localhost:8321/health` from Windows PowerShell

### One person (Stream C lead)

- [ ] Write initial `server.py` and `requirements.txt`, push to GitHub
- [ ] Test LiteRT-LM vision: save a screenshot as JPEG, send it via the Python API, verify response makes sense
- [ ] Prepare 3–5 test lecture slide screenshots for prompt iteration

### Demo content prep (anyone)

- [ ] Find 3–4 lecture slide decks with good variety: text-heavy, diagram-heavy, code-heavy, jargon-heavy
- [ ] Take screenshots of each for testing
- [ ] Save to `demo-content/` in the repo

---

## 15. Risk Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **LiteRT-LM doesn't support Gemma 4 vision on WSL2** | Critical — no inference | Test vision in WSL2 BEFORE Saturday. If broken, fall back to Ollama + `gemma4:e2b` which runs natively on Windows. |
| **`desktopCapturer` captures the overlay too** | Medium — messy screenshots | Filter by window title (exclude "Screen Copilot"). If unreliable, capture the full display and crop out the sidebar region. |
| **Foreground window detection is wrong** | Medium — captures wrong window | Use `desktopCapturer.getSources()` sorted by z-order. If unreliable, fall back to full-display capture. Manual window picker is the backup plan. |
| **CPU inference too slow for live demo** | High — awkward pauses | Streaming masks latency (text appears word by word). Keep responses short via prompt tuning. Pre-warm the model before visitors arrive. |
| **WSL2 port forwarding breaks** | High — sidecar unreachable | Test before Saturday. If broken, use WSL2's IP directly (`hostname -I` in WSL). Document the fallback. |
| **Teammate has 16 GB RAM** | Medium — model + Electron too heavy | Gemma 4 E2B uses ~2 GB. Electron uses ~200 MB. Should fit. If tight, close other apps during dev. |
| **Teammate on macOS** | Low — different capture behavior | `desktopCapturer` on macOS needs Screen Recording permission. Document the grant steps. LiteRT-LM runs natively on macOS (no WSL needed). |
| **Model hallucinates slide content** | Medium — bad demo | System prompt explicitly forbids inventing content. Low temperature in inference. Test with real slides beforehand. |

### Critical pre-flight test (Friday evening or Saturday 8am)

Run this exact sequence on one Windows laptop before anything else:

```bash
# 1. In WSL2
pip install litert-lm-api-nightly
litert-lm run --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm \
  gemma-4-E2B-it.litertlm --prompt="Describe this image" --image=test_slide.jpg

# 2. If step 1 works, test the HTTP server
cd sidecar && uvicorn server:app --port 8321

# 3. From Windows PowerShell
curl http://localhost:8321/health
```

If step 1 fails (vision not supported in LiteRT-LM for Gemma 4 on x86 Linux), immediately pivot to **Ollama** as the inference backend. The sidecar API contract stays the same — just swap the engine inside `server.py`.

---

## 16. Nice-to-Haves & Post-Hackathon

Ordered by value vs effort for the hackathon:

### Achievable if ahead of schedule

1. **Global keyboard shortcut** (Ctrl+Shift+C) — 30 min, Stream A
2. **Minimize/expand sidebar toggle** — 30 min, Stream B
3. **Manual window picker dropdown** — 45 min, Stream A + B
4. **Multi-turn conversation** (pass history to sidecar) — 30 min, Stream C
5. **Dark mode** — 20 min, Stream B

### Post-hackathon roadmap

- Migrate to Tauri for smaller binary + native Rust capture
- Docker image for one-command sidecar setup
- Ollama fallback provider for non-WSL machines
- Voice input (Whisper) + TTS output (Kokoro)
- Region selection capture (drag to select area)
- OCR preprocessing before model inference
- Privacy allowlist/denylist for window capture
- Redaction overlay for sensitive regions
- Plugin system for custom presets
- Frame history (scroll back through captures)
- "What changed?" comparison between consecutive frames

---

## 17. Pitch Outline (Technical)

For the pitch presentation (slides, no demo):

**Slide 1 — Problem**
Students sit in lectures with complex slides flying by. They miss concepts, don't understand jargon, can't ask questions fast enough. After class, the slides alone don't tell the full story.

**Slide 2 — Existing solutions fail**
ChatGPT/Gemini require manual upload, lose context, and send your screen content to the cloud. Screen-sharing tools don't explain. Note-taking apps capture but don't understand.

**Slide 3 — Our solution**
A floating AI sidebar that sees your screen and explains it — locally, privately, instantly. Always there, never in the way.

**Slide 4 — How it works (architecture)**
Show the architecture diagram. Emphasize: Electron overlay captures the screen → image sent to local LiteRT-LM engine running Gemma 4 → streamed response appears in sidebar. Nothing leaves the machine.

**Slide 5 — Demo screenshots**
Show 2–3 screenshots of the sidebar in action: summarizing a slide, explaining a concept, quizzing the student.

**Slide 6 — Beyond lectures**
Same architecture works for any window: browser pages, code editors, dashboards, financial documents. The preset system makes it extensible. Privacy-first design means sensitive content is safe.

**Slide 7 — Technical depth**
LiteRT-LM (Google's edge inference engine) + Gemma 4 E2B (2B parameter multimodal model). Runs on CPU, no GPU needed. Electron for cross-platform capture. Streaming SSE for responsive UX.

**Slide 8 — Future**
Voice input/output, auto-refresh slide detection, Tauri migration, mobile companion app, plugin marketplace for domain-specific presets (medical, legal, finance).
