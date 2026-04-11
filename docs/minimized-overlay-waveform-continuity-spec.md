# Minimized Overlay Waveform Continuity Spec

> Approved and implemented on 2026-04-11. This spec captured the minimized overlay continuity fix: persistent waveform/status chrome in prompt-open modes, a more voice-aware response layout, and automatic return to compact mode after assistant playback completes.

## Goal

Keep the waveform visible and meaningful in the minimized overlay after the user finishes speaking, so the UI continues to show processing and assistant-speaking states instead of switching to a text-only response view.

## Scope

### Docs
- Update this approved spec: `docs/minimized-overlay-waveform-continuity-spec.md`

### Planned implementation files
- `src/renderer/App.tsx` — refine minimized overlay voice-turn variant transitions
- `src/renderer/components/MinimizedSessionBar.tsx` — render waveform/status chrome in prompt-open minimized variants as well as compact mode
- `src/renderer/components/MinimizedPromptPanel.tsx` — make room for waveform-aware response layout and improve processing/response presentation
- `src/renderer/utils/minimizedOverlay.ts` — update auto-reveal logic if needed
- `src/main/overlay/overlayWindow.ts` — adjust prompt-response/input sizing only if the new persistent waveform/header needs more room
- `src/renderer/__tests__/minimizedOverlay.test.ts` — update transition expectations if variant logic changes
- `src/renderer/__tests__/minimizedSessionBar.test.ts` — add coverage for waveform visibility in prompt-open modes
- `STATUS.md` and relevant phase docs — update after implementation approval/review

## Out of scope

- Expanded overlay redesign
- Sidecar/WebSocket changes
- TTS backend/model changes
- Replacing the overall minimized overlay interaction model with a totally different shell

## Current codebase facts

- `App.tsx` auto-reveals minimized voice turns via `revealMinimizedVoiceResponse()`.
- `getVoiceTurnRevealVariant()` currently switches minimized voice turns from `compact` to `prompt-response`.
- `MinimizedSessionBar.tsx` currently renders the waveform only in the `compact` branch.
- `MinimizedPromptPanel.tsx` shows loading dots / response text, but no waveform/status header.
- Result: the initial minimized overlay looks good while listening, but once the app switches to `prompt-response`, the waveform disappears by design.

## Proposed design

### UX goal
- The minimized overlay should feel like one continuous voice surface, not a compact waveform card that abruptly turns into a separate text panel.
- The waveform should remain visible throughout:
  - listening
  - processing
  - assistant speaking
  - post-response idle (if the minimized overlay remains open)

### Recommended UI structure
- Introduce a persistent minimized voice header/chrome that can appear in both compact and prompt-open modes.
- That shared chrome should include:
  - waveform
  - short status label (`Listening`, `Thinking`, `AI speaking`, `Ready`)
  - optional mic toggle / speech toggle affordance
- The prompt/response content should live below that shared waveform/status region instead of replacing it.

### Variant behavior options
- **Recommended:** keep auto-opening to `prompt-response`, but preserve the waveform/status header in that mode.
- Alternative: stop auto-opening for voice turns and keep the overlay compact until the user expands it manually.

### Processing state
- During processing, the minimized overlay should keep the orange waveform visible and pair it with a clearer “Thinking” treatment.
- The loading dots in `MinimizedPromptPanel.tsx` can remain, but should complement the waveform rather than replace it.

### Assistant TTS state
- While TTS is playing, the waveform remains visible in blue in the minimized response view.
- The response text streams beneath a persistent waveform/status header.

### Post-response completion
- After the assistant finishes speaking (or the response completes with no playback), the minimized overlay automatically returns to compact mode after a short delay.

### UI improvement direction
- Reduce the feeling of “text only” mode by making the top of the response view visibly audio-aware.
- Possible improvements for first pass:
  - persistent waveform/status strip at the top of prompt-response
  - more compact footer actions so response body gets more space
  - clearer hierarchy between live status and transcript/response content

## Interface contract

### Renderer component contract
- `MinimizedSessionBar.tsx` should accept and render waveform props consistently regardless of `minimizedVariant`
- No new IPC or shared types required unless a new minimized variant is introduced

### Variant contract
- Existing variants today:
  - `compact`
  - `prompt-input`
  - `prompt-response`
- Preferred first pass: keep the same variant enum and change rendering behavior, not the type contract

### Waveform contract
- Keep using the existing renderer-local waveform bars/state contract
- No sidecar / IPC changes

## Acceptance criteria

- Starting a voice turn in minimized mode still shows the compact listening overlay with the waveform visible.
- After the user finishes speaking, the minimized overlay may auto-open to response mode, but the waveform remains visible.
- While processing, the waveform remains visible and orange, with clear “thinking” feedback.
- While assistant TTS is playing, the waveform remains visible and blue in the minimized response view.
- Response text can still stream/display in minimized response mode without clipping or crowding the waveform/header.
- The minimized overlay feels visually continuous across listening → processing → speaking instead of switching to a separate text-only layout.
- Tests cover waveform visibility in compact and prompt-response variants.

## Resolved decisions

1. Keep the current voice-turn auto-open behaviour.
2. Use a persistent header above prompt-open content so the expanding response body remains readable.
3. Auto-return the minimized overlay to compact mode after assistant playback/response completion.
4. Apply a moderate UI polish pass rather than a full redesign.

## Recommendation

Recommended first pass:
- keep the current auto-open behavior
- add a persistent waveform/status header to `prompt-response` and `prompt-input`
- keep the compact variant for initial listening state
- make the response panel feel like an expanded continuation of the compact voice overlay rather than a separate text-only mode
