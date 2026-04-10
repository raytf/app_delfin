# Phase 6 — Polish + Optimisation

> **Goal**: Apply visual polish, improve error states, implement performance optimisations, and prepare for demo. At the end of this phase, the app is demo-ready: visually clean, resilient to errors, and noticeably faster than the baseline.

**Depends on**: Phase 5 (all features working end-to-end)

---

## 6.1 Visual polish

### Styling pass

Review all components and ensure consistent design:

- **Colour palette**: Use a consistent blue accent (`#2563EB` / Tailwind `blue-600`) for interactive elements. Gray palette for backgrounds and borders.
- **Typography**: System font stack. 14px base for body text, 13px for status/metadata, 16px for headings within cards.
- **Spacing**: Consistent `p-3` padding on sections, `gap-2` between elements, `rounded-lg` on cards.
- **Borders**: `border-b border-gray-200` between sections. No double borders.
- **Shadows**: Subtle shadow on the overlay window itself (if supported by the OS). No internal shadows.
- **Transitions**: Add `transition-all duration-150` to buttons for smooth hover/active states.

### Structured response card styling

The StructuredCard component should be visually distinct:
- Summary: light blue background (`bg-blue-50`), slightly larger text, top of card
- Key points: bullet list with `list-disc` styling, normal text size
- Answer: regular text below key points
- Card border: `border-l-4 border-blue-500`

### Empty states

- **No capture**: Show a dotted border placeholder with "Click Capture or press Ctrl+Shift+C" text
- **No messages**: Show a friendly prompt: "Capture your screen and ask a question to get started"
- **Disconnected**: Show the status clearly but don't block the UI. Gray out the send button. Show a "Reconnecting..." label.

### Loading states

- **Capturing**: Brief spinner or pulse on the Capture button
- **Streaming**: Animated ellipsis or cursor after the last token
- **Connecting**: Pulse animation on the status dot

## 6.2 Error state improvements

### "Sidecar not running" experience

When the sidecar is disconnected:
1. StatusIndicator shows red dot + "Disconnected · Reconnecting..."
2. The Capture button still works (capture is Electron-local)
3. The Send button is visually disabled (gray) with a tooltip "Sidecar not connected"
4. QuickActions are also disabled
5. If the user tries to send anyway, show an inline error: "Cannot send — the inference sidecar is not connected. Start it with: cd sidecar && uvicorn server:app --port 8321"

### Capture failures

If `desktopCapturer` returns no sources or fails:
- Show an inline error in CapturePreview: "Capture failed. Ensure Screen Recording permission is granted (macOS) or try capturing a different window."
- Do not crash

### Model not loaded

If the sidecar is connected but `/health` reports `model_loaded: false`:
- StatusIndicator: "Connected · Model loading..."
- Disable send until model is ready
- Poll `/health` every 5 seconds until `model_loaded: true`

## 6.3 Performance optimisations

Implement the quick wins from the v4 plan. These are small changes with measurable impact.

### Already done (verify these are in place)

- [ ] `cache_dir` is set in engine loading (Phase 1)
- [ ] `MAX_IMAGE_WIDTH` defaults to 512 (Phase 1)
- [ ] Pre-warm prompt runs at startup (Phase 1)

### New optimisations for this phase

#### 1. Visual token budget control

In `sidecar/inference/engine.py` or `server.py`, when passing the image to the model, configure the visual token budget:

```python
vision_token_budget = int(os.environ.get("VISION_TOKEN_BUDGET", "280"))
# Pass this to the model when creating the content
# The exact API depends on LiteRT-LM's vision token budget parameter
content.append({
    "type": "image",
    "blob": blob,
    # "token_budget": vision_token_budget,  # if supported by the API
})
```

Check the LiteRT-LM documentation for the exact parameter name. If the Python API doesn't expose this directly, document it as a known limitation and set the image resize width to compensate (smaller image = fewer vision tokens implicitly).

#### 2. Conversation history trimming *(nice-to-have)*

See Phase 1 Section 1.5 for the full implementation using a parallel Python message list. This is a low-priority polish item — skip it if you're short on time and only return to it if you observe real slowdown after 10+ turns during the demo.

#### 3. Prompt size audit

Review `lecture_slide.py` and `generic_screen.py`:
- Count tokens (rough estimate: words × 1.3)
- If either prompt exceeds ~200 tokens, trim unnecessary instructions
- Every token saved is a fixed cost reduction on every request

## 6.4 Keyboard shortcut (nice-to-have)

If time permits, add a global keyboard shortcut:

```typescript
// In main process
import { globalShortcut } from 'electron';

app.whenReady().then(() => {
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    // Trigger capture
    const frame = await captureForegroundWindow(mainWindow.id);
    mainWindow.webContents.send('frame:captured', frame);
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

## 6.5 README

Write a comprehensive README.md covering:

1. **What it is**: One-paragraph description
2. **Screenshot**: Placeholder for a screenshot of the sidebar in action
3. **Quick start**:
   - Prerequisites (Node.js 20+, Python 3.12+, LiteRT-LM)
   - Clone, copy `.env.example` to `.env`
   - `pip install -r sidecar/requirements.txt`
   - `npm install`
   - Start sidecar: `cd sidecar && uvicorn server:app --host 0.0.0.0 --port 8321`
   - Start app: `npm run dev`
4. **Configuration**: Table of all `.env` variables with descriptions
5. **Platform notes**: WSL2 setup, macOS permissions, Wayland limitations
6. **Architecture**: Brief description with reference to the ASCII diagram
7. **Development**: How to use the mock sidecar, hot reloading, running tests

## 6.6 Demo preparation

### Demo content

Ensure `demo-content/` contains:
- 3-4 lecture slide screenshots (JPEG) covering:
  - A text-heavy biology/science slide
  - A diagram-heavy architecture slide
  - A code snippet slide
  - A jargon-heavy finance/legal slide
- A README explaining what each slide is for

### Demo script verification

Walk through the demo script from the v4 plan and verify every step works:

1. Launch app → sidebar appears on right edge
2. Open lecture slides → visible behind sidebar
3. Click Capture → screenshot appears
4. Click "Summarize this slide" → structured card appears
5. TTS reads the answer (if enabled)
6. Type follow-up → context-aware response
7. Click Stop mid-response → stops cleanly
8. Click "Quiz me" → quiz questions generated
9. Advance slide (if auto-refresh on) → new slide detected
10. Switch to Generic Screen → capture browser → different response style

### Performance baseline

Record approximate performance numbers for the demo machine:
- Time to first token (text-only query): ~X seconds
- Time to first token (image query): ~X seconds
- Token generation speed: ~X tok/s
- TTS latency (first sentence): ~X seconds

Include these in the README under a "Performance" section.

---

## ✅ Phase 6 — Verification Checklist

### Visual
- [ ] Sidebar has consistent colours, spacing, and typography
- [ ] StructuredCard is visually distinct (blue left border, summary highlight, bullet points)
- [ ] Empty state (no capture, no messages) looks intentional, not broken
- [ ] Loading/streaming states have visual indicators (spinner, ellipsis, pulse)
- [ ] Buttons have hover/active transitions

### Error handling
- [ ] With sidecar stopped: send button is disabled, status shows "Disconnected"
- [ ] Trying to send while disconnected shows a helpful inline error
- [ ] Capture failure shows an inline error in CapturePreview
- [ ] Model still loading: status shows "Model loading...", send disabled

### Performance
- [ ] `cache_dir` is set — second app launch is noticeably faster than first
- [ ] Images are resized to ≤512px before sending (verify by logging image dimensions in sidecar)
- [ ] Pre-warm runs on startup — first real query doesn't have extra cold-start delay
- [ ] After 10+ messages, response speed hasn't degraded significantly (history trimming)
- [ ] System prompts are under ~200 tokens each

### Demo readiness
- [ ] README.md exists and accurately describes setup steps
- [ ] `demo-content/` contains 3+ test slide screenshots
- [ ] Full demo flow (capture → summarise → follow-up → quiz → stop → preset switch) works end-to-end
- [ ] Keyboard shortcut Ctrl+Shift+C triggers capture (if implemented)
- [ ] Performance numbers recorded for demo machine
- [ ] `bash scripts/setup-check.sh` passes all checks on the demo machine
