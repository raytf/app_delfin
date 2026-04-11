# Screen Copilot — Detailed Implementation Plan

> **A local, privacy-first screen copilot that helps you understand what's on your screen.**
> 1.5-day hackathon · 5 people · 3 streams · Phase-gated milestones

> ⚠️ **This plan reflects the team/parallel-stream view of the work. The authoritative API contract, file structure, and pseudocode live in [`docs/SPEC.md`](docs/SPEC.md) and the phase docs (`docs/phases/phase-*.md`). Where this document conflicts with those, the SPEC wins.**

---

## How to Read This Document

This plan is divided into **6 phases** that run sequentially as gates — each phase has a **milestone checkpoint** that must be met before moving on. Within each phase, the three workstreams operate in parallel. Every task has an **owner**, **estimated time**, **deliverable**, and **dependencies** listed explicitly.

**Team structure:**

| Stream | People | Owns |
|--------|--------|------|
| **A — Capture + Electron Shell** | Person A1, Person A2 | `src/main/`, overlay window, IPC, Electron config |
| **B — React Sidebar UI** | Person B1, Person B2 | `src/renderer/`, all React components, Zustand stores |
| **C — Inference Sidecar + Prompts** | Person C1 | `sidecar/`, model setup, prompts, FastAPI server |

> **Assigning people:** Stream C is solo and on the critical path — assign your strongest Python person. Stream A needs someone comfortable with Electron internals and OS-level APIs. Stream B is the most approachable for anyone comfortable with React/Tailwind. Within each 2-person stream, divide tasks however works best for your pair — the table assigns A1/A2 and B1/B2 to tasks but these are suggestions, not rigid roles.

**Schedule overview:**

| Day | Hours | Duration |
|-----|-------|----------|
| Friday evening | Async | ~2–3 hrs (Phase 0 setup) |
| Saturday | 10:00 AM – 9:00 PM | 11 hrs (Phases 1–3) |
| Sunday | 10:00 AM – 1:00 PM | 3 hrs (Phases 4–5) |

---

## Phase 0 — Pre-Hackathon Setup (Friday Evening)

**Goal:** Every laptop can run the sidecar, every laptop can run Electron. The critical LiteRT-LM vision test is done. Zero setup work on Saturday morning.

**Duration:** 2–3 hours (asynchronous, each person on their own machine)

---

### Phase 0 Task List

#### 0.1 — Everyone: Environment Setup

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| 0.1.1 | Install **Node.js 20+** and pnpm/npm | All 5 | 5 min | `node -v` outputs 20+ |
| 0.1.2 | **Windows users:** Install WSL2 (`wsl --install` in admin PowerShell), reboot | Windows users | 15 min | `wsl --version` works |
| 0.1.3 | **Windows users:** Inside WSL2, install Python 3.12+ and pip | Windows users | 10 min | `python3 --version` outputs 3.12+ |
| 0.1.4 | **macOS/Linux users:** Ensure Python 3.12+ and pip are available natively | Mac/Linux users | 5 min | `python3 --version` outputs 3.12+ |
| 0.1.5 | Install sidecar Python deps: `pip install litert-lm-api-nightly fastapi[standard] uvicorn[standard] pillow` | All 5 | 5 min | All packages installed without error |
| 0.1.6 | Download Gemma 4 E2B model (~1.4 GB): `litert-lm run --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm gemma-4-E2B-it.litertlm --prompt="test"` | All 5 | 10–20 min | Model file exists at `~/.cache/litert-lm/` |
| 0.1.7 | Clone the team GitHub repo | All 5 | 2 min | Repo cloned locally |

#### 0.2 — Person C1: Critical Path Validation

This is the **single most important pre-hackathon task**. If vision inference doesn't work, the team must pivot to Ollama before Saturday.

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| 0.2.1 | **CRITICAL:** Test LiteRT-LM vision with a real screenshot | C1 | 30 min | A text response describing the contents of a test slide image |
| 0.2.2 | If 0.2.1 fails on WSL2: test natively on a Linux or macOS teammate's machine | C1 + any Mac/Linux teammate | 20 min | Confirm whether the failure is WSL2-specific or general |
| 0.2.3 | If 0.2.1 fails everywhere: **pivot to Ollama** — install Ollama, pull `gemma3:4b` or similar vision model, test with same image | C1 | 30 min | Working vision inference via Ollama |
| 0.2.4 | Write initial `sidecar/server.py` and `sidecar/requirements.txt`, push to repo | C1 | 20 min | Teammates can `pip install -r requirements.txt` and run the server |
| 0.2.5 | Prepare 3–5 test lecture slide screenshots, save to `demo-content/` | C1 | 15 min | Test images committed to repo |

**How to test vision (0.2.1):**

```bash
# Save a lecture slide as test_slide.jpg, then:
litert-lm run --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm \
  gemma-4-E2B-it.litertlm --prompt="Describe this image in detail" --image=test_slide.jpg
```

If this produces a sensible description of the slide content, vision works. If it errors, times out, or produces garbage, escalate immediately.

#### 0.3 — Person A1: Electron Scaffold

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| 0.3.1 | Scaffold Electron + electron-vite + React + TypeScript project; add `concurrently` to devDependencies and wire the `dev:full` npm script | A1 | 30 min | `npm run dev:full` launches Electron window and sidecar together; `npm run dev` launches Electron only |
| 0.3.2 | Verify `desktopCapturer` works — take a test screenshot from Electron, log it | A1 | 20 min | Console shows base64 image data |
| 0.3.3 | **Windows only:** Verify WSL2 localhost port forwarding — run FastAPI in WSL2, `curl http://localhost:8321/health` from Windows PowerShell | A1 | 10 min | Health endpoint responds from Windows side |
| 0.3.4 | Push scaffold to GitHub, confirm all teammates can clone and `npm install && npm run dev:full` | A1 | 10 min | Working dev environment for all |

#### 0.4 — Decision Gate

Before anyone goes to sleep Friday night, confirm in the team chat:

- [ ] **Vision inference works** (LiteRT-LM or Ollama — which engine are we using?)
- [ ] **Electron scaffold runs** on at least one machine
- [ ] **WSL2 port forwarding works** (or confirmed unnecessary if team is all Mac/Linux)
- [ ] **Model is downloaded** on all laptops

> **If vision doesn't work with LiteRT-LM:** The Ollama fallback changes nothing about the architecture except the internals of `engine.py`. The sidecar API contract stays identical. Don't panic — just swap the engine and move on.

---

## Phase 1 — Foundation (Saturday 10:00–13:00)

**Goal:** Clicking "Capture" in the sidebar takes a screenshot of the foreground window and displays it in the sidebar. The sidecar can independently answer questions about images.

**Duration:** 3 hours

**All three streams work in parallel from minute one.**

---

### Stream A — Capture + Electron Shell

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| A1.1 | Create overlay window config: frameless, always-on-top, right-edge, 420px wide, `skipTaskbar: true` | A1 | 30 min | Phase 0 scaffold | `overlayWindow.ts` — Electron window positioned correctly |
| A1.2 | Implement `captureForegroundWindow()` — get all window sources, filter out "Screen Copilot", take JPEG thumbnail of the top candidate | A1 | 30 min | A1.1 | `captureService.ts` — returns `CapturedFrame` object |
| A1.3 | Set up preload bridge: expose `window.electronAPI.captureNow()` to renderer | A2 | 30 min | A1.1 | `preload/index.ts` — secure contextBridge setup |
| A1.4 | Wire IPC handler: renderer sends `capture:now` → main calls `captureForegroundWindow()` → main sends `frame:captured` back to renderer | A2 | 30 min | A1.2, A1.3 | Round-trip works: button click → screenshot appears |
| A1.5 | Set up shared types: `CaptureFrame`, `ChatMessage`, `Session`, `AnalyzeRequest` in `src/shared/types.ts` | A2 | 20 min | — | Types importable by both main and renderer |
| A1.6 | **Integration test with Stream B:** Open a slide deck, click Capture in the sidebar, verify screenshot appears in the preview component | A1 + B1 | 30 min | A1.4 + B1.3 | Screenshot visible in sidebar |

**Stream A notes:**
- The overlay window must use `setAlwaysOnTop(true, 'screen-saver')` to stay above other apps without stealing focus.
- Filter captures by window title: exclude anything containing "Screen Copilot".
- A1 and A2 can split however they prefer — the suggested split has A1 on OS-level capture logic and A2 on IPC/types plumbing, but swap if your pair has different strengths.

---

### Stream B — React Sidebar UI

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| B1.1 | Set up React renderer with Tailwind CSS, global styles, colour tokens | B1 | 30 min | Phase 0 scaffold | Styled blank sidebar renders in Electron |
| B1.2 | Sidebar layout shell: frameless chrome with drag handle region, minimize button (placeholder), close button | B1 | 30 min | B1.1 | Draggable sidebar with title bar |
| B1.3 | `CapturePreview` component: shows screenshot thumbnail (or placeholder), source label ("Google Slides — Lecture 5"), timestamp ("Captured 3s ago") | B2 | 30 min | B1.1 | Component renders with mock data |
| B1.4 | Capture button: calls `window.electronAPI.captureNow()`, loading state while waiting | B2 | 20 min | B1.3, A1.3 (preload bridge) | Button triggers capture IPC |
| B1.5 | `ChatPanel` component: scrollable message list with user/assistant message bubbles, auto-scroll to bottom | B1 | 40 min | B1.1 | Chat panel renders with mock messages |
| B1.6 | `ChatInput` component: text input with send button, Enter to submit, disable while streaming | B2 | 20 min | B1.5 | Input works, fires onSubmit callback |

**Stream B notes:**
- Use mock data for everything in Phase 1. Real data flows arrive in Phase 2.
- Keep the sidebar at exactly 420px wide. Use a dark header bar, light body. Keep it minimal.
- B1 and B2 can split however works — the suggested split has B1 on layout/ChatPanel and B2 on interactive widgets, but adjust to your pair.

---

### Stream C — Inference Sidecar + Prompts

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| C1.1 | Finalize `server.py`: FastAPI app with lifespan model loading, `/health` HTTP endpoint, `/ws` WebSocket endpoint | C1 | 30 min | Phase 0 validation | `GET /health` returns `{ status: "ok", model_loaded: true }` |
| C1.2 | Implement WebSocket `handle_turn`: accept `{text, image, preset_id}` JSON, run inference via tool call, send `structured` or `token` + `done` messages | C1 | 50 min | C1.1 | WebSocket turn works when tested with `wscat` |
| C1.3 | Image preprocessing helper: `resize_image_blob(b64_str) -> str` — in-memory base64→PIL→resize→JPEG, no temp files | C1 | 20 min | — | `preprocess.py` works correctly |
| C1.4 | Add JSON extraction fallback (`_extract_structured_from_text`) for when tool calling fails | C1 | 15 min | C1.2 | Fallback extracts Summary/Answer/Key points from raw text |
| C1.5 | Write lecture-slide system prompt, test with 3+ real slide screenshots | C1 | 30 min | C1.2 | Prompt produces useful summaries of test slides |
| C1.6 | Write `setup_model.py` for teammates to download the model | C1 | 15 min | — | `python setup_model.py` downloads model if not present |

**Stream C notes:**
- C1 is solo on the critical path. Protect their focus time — no interruptions from other streams.
- Test the WebSocket turn first with `wscat` before wiring to Electron. See test commands below.
- The sidecar uses WebSocket (not HTTP POST/SSE). Image blobs are confirmed to work via `{"type": "image", "blob": b64_str}` — no temp files needed.
- Use the single-consumer Queue pattern from `docs/phases/phase-1-sidecar.md` §1.4 — do not use two concurrent `iter_text()` consumers.

**How to test the sidecar independently:**

```bash
# Start the server
cd sidecar && uvicorn server:app --host 0.0.0.0 --port 8321

# Test health
curl http://localhost:8321/health

# Test WebSocket turn (install wscat: npm i -g wscat)
wscat -c ws://localhost:8321/ws
# Then type:
{"text": "Summarize this slide", "preset_id": "lecture-slide"}
# Expect: {"type": "structured", "data": {...}} then {"type": "done"}

# Test with image (replace <base64> with real JPEG base64):
{"text": "What is on this slide?", "preset_id": "lecture-slide", "image": "<base64>"}

# Test interrupt: send {"type":"interrupt"} while a long response is streaming
```

---

### Phase 1 Milestone Checkpoint (Saturday 13:00)

**All three must pass before lunch:**

- [ ] **Stream A:** Clicking Capture in the sidebar takes a screenshot of the window behind the overlay and shows it in `CapturePreview`
- [ ] **Stream B:** Sidebar renders with layout, capture preview, chat panel (mock data), and input box
- [ ] **Stream C:** Sidecar `/ws` WebSocket returns a structured response when given a slide image via `wscat`

> **If Stream C is behind:** This is the highest risk. If vision inference is unreliable, spend the lunch break troubleshooting. If LiteRT-LM is fundamentally broken, pivot to Ollama now — do not wait until the afternoon.

---

## Phase 2 — End-to-End Flow (Saturday 13:30–17:30)

**Goal:** The full loop works: capture → send to sidecar → streaming response appears in sidebar. Quick action buttons trigger preset questions. Preset switching works.

**Duration:** 4 hours (including 30 min lunch break 13:00–13:30)

---

### Stream A — Capture → Sidecar Bridge

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| A2.1 | Implement `wsClient.ts`: persistent WebSocket to `ws://localhost:8321/ws` with auto-reconnect (2s backoff), `onSidecarMessage` / `onSidecarStatus` callbacks | A1 | 45 min | Phase 1 complete | Main process maintains WebSocket connection to sidecar |
| A2.2 | Route sidecar messages to renderer via IPC: `token` → `sidecar:token`, `structured` → `sidecar:structured`, `done` → `sidecar:done`, `error` → `sidecar:error` | A1 | 30 min | A2.1 | Renderer receives typed messages from sidecar |
| A2.3 | Add IPC handler `sidecar:send`: renderer sends `{text, preset_id, image}`, main forwards to WebSocket; add `sidecar:interrupt` handler | A2 | 30 min | A2.1 | Clean IPC contract for message submission and interruption |
| A2.4 | Health check on startup: main process GETs `/health` once on connect, then polls every 5s while `model_loaded: false`, sends status to renderer | A2 | 20 min | C1.1 | Renderer knows if sidecar is up and model is loaded |
| A2.5 | Error handling: sidecar unreachable, WebSocket close, malformed JSON — surface errors to renderer via `sidecar:error` IPC | A1 | 30 min | A2.1 | Error messages appear in chat panel instead of silent failure |
| A2.6 | **End-to-end integration test:** Open slides → Capture → click "Summarize" → structured card or streaming answer appears in chat | A1 + B1 + C1 | 30 min | A2.2 + B2.3 + C1.2 | The demo flow works |

---

### Stream B — Interactive UI

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| B2.1 | `QuickActions` component: 2×2 grid of preset starter questions ("Summarize", "Explain", "Quiz Me", "Key Terms") | B2 | 30 min | B1.6 | Buttons render, clicking one sets the input text and auto-submits |
| B2.2 | `PresetPicker` component: dropdown to switch between "Lecture Slides" and "Screen Assistant" — changing preset swaps the quick action labels and system prompt | B1 | 30 min | B2.1 | Dropdown works, quick actions update |
| B2.3 | Streaming text + structured display: wire ChatPanel to receive `sidecar:token` (append text) and `sidecar:structured` (render StructuredCard) IPC events, auto-scroll | B1 | 45 min | B1.5, A2.2 | Text appears word-by-word; structured cards render on tool call |
| B2.4 | Zustand session store: `currentFrame`, `messages[]`, `isStreaming`, `presetId` — all components read from this store | B1 | 30 min | — | Single source of truth for session state |
| B2.5 | Zustand settings store: `sidecarUrl`, `modelName`, `autoRefreshEnabled`, `autoRefreshInterval` | B2 | 20 min | — | Settings persisted in store |
| B2.6 | `StatusIndicator` component: shows connection status (🟢 connected / 🔴 disconnected), model name, last response latency | B2 | 20 min | A2.4, B2.5 | Status bar at bottom of sidebar |
| B2.7 | Polish message rendering: handle markdown-like formatting (bold, bullets, code blocks) in assistant responses — use a simple regex-based renderer or a lightweight markdown lib | B1 | 30 min | B2.3 | Responses look clean, not raw text |

---

### Stream C — Prompt Tuning + Robustness

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| C2.1 | Iterate on lecture-slide prompt with real slides: test diagrams, code snippets, blurry text, heavy jargon | C1 | 60 min | C1.5 | Prompt handles edge cases gracefully |
| C2.2 | Write generic-screen system prompt, test with browser pages, code editors, dashboards | C1 | 30 min | C1.2 | Generic preset produces useful output |
| C2.3 | Build preset registry: `presets.py` with `get_system_prompt(preset_id)`, expose `GET /presets` endpoint so the Electron app can fetch available presets | C1 | 20 min | C2.2 | Presets accessible via API |
| C2.4 | Tune inference parameters: temperature (low, ~0.3 for factual), max tokens (cap at 512 to keep responses snappy), stop sequences | C1 | 20 min | C2.1 | Responses are concise, factual, not rambling |
| C2.5 | Write setup instructions in `sidecar/README.md`: install steps for WSL2, macOS, and Linux | C1 | 20 min | — | Any teammate can set up the sidecar from the README |
| C2.6 | **Join end-to-end integration test** — help debug any sidecar-side issues | C1 | 30 min | A2.6 | Full flow verified |

---

### Phase 2 Milestone Checkpoint (Saturday 17:30)

- [ ] Open lecture slides → click Capture → click "Summarize this slide" → answer streams word-by-word in chat
- [ ] Follow-up questions work (type a question, hit Enter, get a response about the same screenshot)
- [ ] Quick action buttons ("Summarize", "Explain", "Quiz Me", "Key Terms") all trigger and return responses
- [ ] Preset picker switches between Lecture Slides and Screen Assistant
- [ ] Status indicator shows connected/disconnected accurately
- [ ] Error states handled: sidecar down shows message, not crash

> **If the end-to-end flow doesn't work by 16:00:** All hands on debugging. Drop preset picker and status indicator — they're polish, not core.

---

## Phase 3 — Polish + Cross-Machine Testing (Saturday 17:30–21:00)

**Goal:** The app looks demo-ready and works on at least 2 different team laptops. Get a head start on auto-refresh and multi-turn if time allows.

**Duration:** 3.5 hours

**All streams merge — everyone works on the same codebase.**

---

### Task List

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| P3.1 | **Styling pass:** Consistent colour palette, spacing, font sizes. Dark header, clean message bubbles, readable status bar | B1 + B2 | 45 min | Sidebar looks polished, not "hackathon rough" |
| P3.2 | **Error handling pass:** Capture fails gracefully (shows "No window found"), sidecar timeout shows retry message, empty frame shows helpful placeholder | A1 + A2 | 30 min | No crashes, no silent failures |
| P3.3 | **Test on second laptop:** Clone repo on a teammate's machine (different OS if possible), follow the README, run the full flow | A2 + C1 | 45 min | Works on ≥2 machines |
| P3.4 | Fix any cross-machine issues found in P3.3: path differences, port conflicts, permission issues, model path assumptions | Whoever hit the issue | 30 min | Issues resolved, README updated |
| P3.5 | **UX micro-polish:** Loading spinner while model is responding, "Capturing..." state on button, smooth scroll on new messages | B2 | 30 min | Interactions feel responsive |
| P3.6 | Update `README.md` with complete setup + run instructions for both Electron and sidecar | C1 | 20 min | New teammate could set up from README alone |
| P3.7 | **Auto-refresh — early start:** Implement `AutoRefreshManager` with timer + hash-based image diffing (gets a head start on Phase 4) | A1 | 45 min | `autoRefresh.ts` — captures every N seconds, emits only on change |
| P3.8 | **Multi-turn — early start:** Add `history` parameter support to `/analyze/stream`, pass last 4 messages as conversation context (gets a head start on Phase 4) | C1 | 30 min | Follow-ups reference previous answers |

---

### Phase 3 Milestone Checkpoint (Saturday 21:00 — End of Day 1)

- [ ] App looks visually polished — you'd be comfortable showing it to a judge
- [ ] Works on 2+ team laptops
- [ ] README has complete setup instructions
- [ ] No known crashes or silent failures
- [ ] Bonus: auto-refresh manager and/or multi-turn support partially or fully implemented

> **This is the "safe demo" checkpoint.** Everything after this is improvement, not survival. Go home, rest, and start Sunday with what works.

---

## Phase 4 — Auto-Refresh, Multi-Turn + Demo Prep (Sunday 10:00–13:00)

**Goal:** Auto-refresh detects slide changes. Multi-turn conversation works. Team can deliver a smooth demo. This is the final phase — it combines feature completion and demo rehearsal into the 3-hour Sunday window.

**Duration:** 3 hours

---

### Sunday 10:00–11:30 — Feature Completion (Parallel Streams)

#### Stream A — Auto-Refresh

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| A4.1 | Finish `AutoRefreshManager` if not completed in P3.7: timer that captures every N seconds, hashes a sample of the image, only emits if hash changed | A1 | 30 min (or skip if done) | A1.2 | Auto-refresh fires and detects changes |
| A4.2 | Wire auto-refresh IPC: renderer sends `capture:auto-refresh` with `{ enabled, intervalMs }`, main starts/stops the manager | A2 | 20 min | A4.1 | Toggle works from UI |
| A4.3 | Push new frames to renderer: when auto-refresh detects a change, send `frame:captured` with the new frame, store previous frame for comparison | A1 | 20 min | A4.1 | New screenshots appear automatically when slides advance |
| A4.4 | Test: open a slide deck, enable auto-refresh, advance slides, verify the sidebar updates | A1 + A2 | 20 min | A4.3 | Reliable detection across 5+ slide transitions |

#### Stream B — Auto-Refresh UI

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| B4.1 | Auto-refresh toggle button: on/off state, visual indicator when active (pulsing dot or similar) | B2 | 20 min | A4.2 | Toggle button in the capture area |
| B4.2 | "New slide detected" indicator: brief flash or notification when auto-refresh finds a changed frame | B1 | 20 min | A4.3 | User knows when a new slide was captured |
| B4.3 | **Nice-to-have (if time):** Minimize/expand toggle — collapse sidebar to a thin 48px strip, expand back with click | B1 | 30 min | — | Sidebar can get out of the way |
| B4.4 | **Nice-to-have (if time):** Dark mode toggle using CSS variables | B2 | 20 min | — | Light/dark theme switching |

#### Stream C — Multi-Turn + Final Tuning

| # | Task | Owner | Time | Depends On | Deliverable |
|---|------|-------|------|------------|-------------|
| C4.1 | Finish multi-turn support if not completed in P3.8: accept `history` array in `/analyze/stream`, pass last 4 messages as conversation context | C1 | 30 min (or skip if done) | Phase 2 complete | Follow-ups reference previous answers |
| C4.2 | Test multi-turn: "Summarize this slide" → "Explain that concept more simply" → "Give me an analogy" | C1 | 20 min | C4.1 | Conversation flows naturally |
| C4.3 | Tune prompts for "What changed?" questions: when the user asks about changes between slides, prompt should reference both current and previous frame context | C1 | 20 min | C4.1 | Useful "what changed" responses |

---

### Sunday 11:30–12:00 — Integration Testing (All Streams)

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| I4.1 | Full integration test: auto-refresh + multi-turn + preset switching, all working together | All 5 | 30 min | No regressions, all features work together |
| I4.2 | Fix any bugs found during integration | Whoever found the bug | (within the 30 min) | Bugs fixed |

---

### Sunday 12:00–13:00 — Demo Prep + Rehearsal (All Streams)

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| D5.1 | Select 3–4 demo slides: pick lecture slides with good variety — one text-heavy, one with a diagram, one with code/formulas, one with jargon | Anyone | 15 min | Demo slides ready in a PDF or Google Slides deck |
| D5.2 | Pre-warm the model: run 2–3 inference calls before the demo to ensure the model is loaded and responsive | C1 | 5 min | First demo response is fast, not cold-start slow |
| D5.3 | Rehearse demo flow: each team member runs through the full script once (see Demo Script below) | All 5 | 20 min | Everyone can deliver the demo |
| D5.4 | Fix last bugs found during rehearsal | Whoever found the bug | 10 min | No known bugs |
| D5.5 | Final rehearsal: one person plays "visitor" and asks unexpected questions | All 5 | 10 min | Team handles curveballs gracefully |

---

### Demo Script (2 minutes per visitor)

**Opening:** "This is a local AI that helps you understand what's on your screen. Everything runs on this laptop — nothing goes to the cloud."

**Show it:**

1. Have a lecture slide open (Google Slides or PDF)
2. Point to the sidebar on the right: "See this sidebar? It's always here."
3. Click **Capture**. Screenshot appears. "It just captured the slide behind it."
4. Click **Summarize this slide**. Answer streams in word by word.
5. Ask a follow-up: "Explain [specific concept] more simply."
6. Click **Quiz me**. Model generates study questions.
7. If auto-refresh is working: advance to next slide. "See? It detected the new slide automatically."
8. If time: switch to a browser tab, change preset to Generic Screen, capture, ask "What am I looking at?"

**Closing:** "It works with any window — slides, browser, apps. And nothing ever leaves your machine."

**For judges asking technical questions:**
- "We use LiteRT-LM, Google's edge inference engine, running Gemma 4 on CPU."
- "Capture uses Electron's desktopCapturer with automatic foreground window detection."
- "Streaming responses come via WebSocket from a local FastAPI sidecar — structured tool-call responses when the model cooperates, raw token streaming as a fallback."
- "The sidebar is a frameless always-on-top Electron window that excludes itself from capture."

**Fallback talking points (if something breaks during demo):**
- Sidecar crashes: "The model runs locally on CPU — sometimes it needs a moment. Let me restart the inference server." (Run `uvicorn server:app --host 0.0.0.0 --port 8321` in terminal)
- Capture grabs wrong window: "We filter by window title — let me manually select the right source." (If manual picker was built; otherwise just re-capture)

---

### Phase 4+5 Milestone Checkpoint (Sunday 13:00 — End of Hackathon)

- [ ] Auto-refresh detects slide changes reliably (advance 5 slides, all 5 detected)
- [ ] Multi-turn conversation works ("explain that more" references the previous answer)
- [ ] UI clearly shows when auto-refresh is active and when a new slide was detected
- [ ] Team can deliver a smooth 2-minute demo without fumbling
- [ ] At least 2 team members can handle the demo solo (bus factor)
- [ ] Demo laptop is charged, model is pre-warmed, slides are ready

---

## Phase 6 — Nice-to-Have Stretch Goals

**Only attempt these if you finish Phase 4 tasks early on Sunday morning (before 11:30) and have time to spare.**

These are ordered by impact-to-effort ratio:

| Priority | Feature | Stream | Effort | Description |
|----------|---------|--------|--------|-------------|
| 1 | Global keyboard shortcut (Ctrl+Shift+C) | A | 30 min | Capture without clicking the sidebar — impressive in demos |
| 2 | Minimize/expand sidebar toggle | B | 30 min | Collapse to thin strip, expand back — shows UX polish |
| 3 | Manual window picker dropdown | A + B | 45 min | Select which window to capture from a dropdown list |
| 4 | Dark mode | B | 20 min | CSS variable toggle — quick win for visual variety |
| 5 | Dockerfile for sidecar | C | 30 min | One-command setup — good for "reproducibility" talking point |
| 6 | Ollama fallback provider | C | 30 min | Backup engine — good insurance |

---

## Risk Register & Mitigations

| # | Risk | Probability | Impact | Mitigation | Owner |
|---|------|-------------|--------|------------|-------|
| R1 | LiteRT-LM vision doesn't work on WSL2/x86 Linux | Medium | **Critical** | Test in Phase 0. Fallback: Ollama with `gemma3:4b` vision. Sidecar API stays the same. | C1 |
| R2 | `desktopCapturer` captures the overlay window | Medium | Medium | Filter by window title (exclude "Screen Copilot"). Fallback: full-display capture + crop. | A1 |
| R3 | Foreground window detection picks wrong window | Medium | Medium | `getSources()` returns z-ordered list — first non-overlay candidate is usually correct. Fallback: full-display capture. | A1 |
| R4 | CPU inference too slow for live demo (>15s per response) | Medium | High | Streaming masks latency. Keep max_tokens low (512). Pre-warm model. Use low temperature. | C1 |
| R5 | WSL2 port forwarding breaks | Low | High | Test in Phase 0. Fallback: use WSL2's internal IP via `hostname -I`. | A1 |
| R6 | Teammate has only 16 GB RAM | Low | Medium | Gemma 4 E2B uses ~2 GB, Electron ~200 MB. Should fit. Close other apps during dev. | All |
| R7 | macOS teammate hits different capture behaviour | Low | Low | `desktopCapturer` on macOS needs Screen Recording permission. Document the grant steps. | A1 |
| R8 | Model hallucinates slide content | Medium | Medium | System prompt forbids inventing content. Low temperature. Test with real slides. | C1 |
| R9 | Team member gets stuck on unfamiliar tech | Medium | Medium | Pair within streams. If one person is stuck for >30 min, call for help from another stream. | All |

---

## Communication & Coordination

### Integration Checkpoints (Mandatory)

| Time | What | Who |
|------|------|-----|
| Saturday 13:00 | Phase 1 milestone check — all three streams report status | All 5 |
| Saturday 15:30 | Mid-afternoon sync — is end-to-end working? Blockers? | All 5 |
| Saturday 17:30 | Phase 2 milestone check — demo flow works? | All 5 |
| Saturday 21:00 | Phase 3 milestone check — polish done, works on 2 machines? | All 5 |
| Sunday 11:30 | Phase 4 feature check — auto-refresh + multi-turn working? | All 5 |
| Sunday 13:00 | Final check — demo rehearsed and ready? | All 5 |

### Git Workflow

- **Main branch** is always deployable — never push broken code to main
- Each stream works on their own branch: `stream-a/capture`, `stream-b/ui`, `stream-c/sidecar`
- Merge to main at each milestone checkpoint after testing
- If merge conflicts arise, the two conflicting streams resolve together immediately
- Commit frequently with descriptive messages — you'll thank yourself when debugging

### Slack/Discord Channel Structure (Suggested)

- `#general` — announcements, milestone check-ins
- `#stream-a-capture` — Electron + capture discussion
- `#stream-b-ui` — React + UI discussion
- `#stream-c-sidecar` — Python + inference discussion
- `#bugs` — bug reports during integration testing

---

## Quick Reference: Who Owns What

| File/Directory | Owner | Stream |
|----------------|-------|--------|
| `src/main/index.ts` | A1 | A |
| `src/main/capture/captureService.ts` | A1 | A |
| `src/main/capture/autoRefresh.ts` | A1 | A |
| `src/main/capture/focusDetector.ts` | A1 | A |
| `src/main/ipc/handlers.ts` | A2 | A |
| `src/main/overlay/overlayWindow.ts` | A1 | A |
| `src/main/sidecar/healthCheck.ts` | A2 | A |
| `src/shared/types.ts` | A2 | A |
| `src/shared/schemas.ts` | A2 | A |
| `src/shared/constants.ts` | B1 | B |
| `src/renderer/App.tsx` | B1 | B |
| `src/renderer/components/CapturePreview.tsx` | B2 | B |
| `src/renderer/components/ChatPanel.tsx` | B1 | B |
| `src/renderer/components/ChatInput.tsx` | B2 | B |
| `src/renderer/components/QuickActions.tsx` | B2 | B |
| `src/renderer/components/PresetPicker.tsx` | B1 | B |
| `src/renderer/components/StatusIndicator.tsx` | B2 | B |
| `src/renderer/stores/sessionStore.ts` | B1 | B |
| `src/renderer/stores/captureStore.ts` | B2 | B |
| `src/renderer/stores/settingsStore.ts` | B2 | B |
| `src/renderer/styles/globals.css` | B1 | B |
| `sidecar/server.py` | C1 | C |
| `sidecar/inference/engine.py` | C1 | C |
| `sidecar/inference/preprocess.py` | C1 | C |
| `sidecar/prompts/presets.py` | C1 | C |
| `sidecar/prompts/lecture_slide.py` | C1 | C |
| `sidecar/prompts/generic_screen.py` | C1 | C |
| `sidecar/setup_model.py` | C1 | C |
| `demo-content/` | C1 | C |
| `README.md` | C1 + A1 | Shared |

---

## Appendix: IPC & API Contracts

### Electron IPC Channels (Main ↔ Renderer)

```
Renderer → Main:
  capture:now                     → triggers screenshot
  capture:auto-refresh            → { enabled: boolean, intervalMs: number }
  sidecar:send                    → { text, preset_id, image? }   (WsOutboundMessage)
  sidecar:interrupt               → sends {"type":"interrupt"} over WebSocket

Main → Renderer:
  frame:captured                  → CaptureFrame payload
  sidecar:token                   → { text: string }
  sidecar:structured              → StructuredResponse { summary, answer, key_points }
  sidecar:done                    → (no payload)
  sidecar:error                   → { message: string }
  sidecar:status                  → { connected: boolean }
  sidecar:audio_start             → (no payload)
  sidecar:audio_chunk             → { audio: string (base64 PCM), index: number }
  sidecar:audio_end               → (no payload)
```

### Sidecar API (Electron Main ↔ Python — WebSocket)

The sidecar uses WebSocket, **not** HTTP POST/SSE. All inference I/O flows over `ws://localhost:8321/ws`.

```
GET  /health  (HTTP)
     → { status: "ok", model_loaded: true, backend: "GPU"|"CPU", model: string }

WebSocket /ws
  Inbound (Electron → Sidecar):
    { type: "interrupt" }
    { text: string, preset_id: string, image?: string }   ← base64 JPEG

  Outbound (Sidecar → Electron):
    { type: "structured", data: { summary, answer, key_points } }
    { type: "token",      text: string }
    { type: "done" }
    { type: "error",      message: string }
    { type: "audio_start" }
    { type: "audio_chunk", audio: string, index: number }
    { type: "audio_end" }
```

---

## Appendix: Timeline at a Glance

```
FRIDAY EVENING
  └── Phase 0: Setup + Critical LiteRT-LM Vision Test

SATURDAY (10:00 AM – 9:00 PM)
  10:00 ┬── Phase 1: Foundation (parallel streams)
        │   Stream A: Overlay window + capture
        │   Stream B: Sidebar layout + components
        │   Stream C: Sidecar server + /analyze endpoints
  13:00 ┴── ✅ Milestone 1: Capture works, sidecar answers questions
        │
  13:30 ┬── Phase 2: End-to-End Flow (parallel streams)
        │   Stream A: Wire capture → sidecar → renderer
        │   Stream B: Quick actions, presets, streaming display
        │   Stream C: Prompt tuning + robustness
  17:30 ┴── ✅ Milestone 2: Full demo flow works
        │
  17:30 ┬── Phase 3: Polish + Cross-Machine Testing (merged)
        │   + Early start on auto-refresh & multi-turn
  21:00 ┴── ✅ Milestone 3: Demo-ready, works on 2+ laptops

SUNDAY (10:00 AM – 1:00 PM)
  10:00 ┬── Phase 4: Auto-Refresh + Multi-Turn (parallel streams)
  11:30 ┴── Feature complete
        │
  11:30 ┬── Integration testing (all streams)
  12:00 ┴── All features working together
        │
  12:00 ┬── Phase 5: Demo Prep + Rehearsal (merged)
  13:00 ┴── ✅ Milestone 5: Team can deliver smooth 2-min demo

  Spare time → Phase 6: Nice-to-have stretch goals
```
