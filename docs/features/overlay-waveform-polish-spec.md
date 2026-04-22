# Overlay + Waveform Polish Spec

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | ✅ Complete — implemented |
| **Approval date** | 2026-04-11 |
| **Implemented date** | 2026-04-11 |
| **Approver** | Human reviewer (project lead) |
| **Summary** | Compact overlay resize/simplification and shift from scalar waveform animation to analyser-driven per-bar rendering for mic and AI TTS playback |



## Goal

Prevent the minimized overlay UI from clipping the new waveform/status controls, and make `VoiceWaveform` feel more seamless and audio-reactive, closer to the Parlor example, while keeping the implementation renderer-local.

## Scope

### Docs
- Add this draft spec: `docs/overlay-waveform-polish-spec.md`

### Planned implementation files
- `src/main/overlay/overlayWindow.ts` — increase compact/open minimized bounds so new content is not cut off
- `src/renderer/components/MinimizedSessionBar.tsx` — rebalance compact/open overlay layout to fit waveform + controls cleanly
- `src/renderer/components/MinimizedPromptPanel.tsx` — small spacing changes if open variants also need room
- `src/renderer/components/VoiceWaveform.tsx` — switch from single-level animation to smoothed per-bar amplitude rendering
- `src/renderer/App.tsx` — derive live assistant waveform bars from the existing Web Audio playback pipeline
- `src/renderer/hooks/useVAD.ts` — derive live mic waveform bars from the shared mic stream/analyser
- `src/renderer/utils/waveformState.ts` — update waveform state helpers if the presentation contract changes
- `src/renderer/__tests__/...` — update/add tests for waveform presentation and minimized overlay rendering

## Out of scope

- Sidecar protocol changes
- New IPC channels
- TTS engine/backend changes
- Full expanded-view redesign
- New third-party waveform/rendering libraries

## Current codebase facts

- The compact minimized overlay window is currently `290 × 75`, but `MinimizedSessionBar.tsx` now stacks a waveform, a status row, and an actions row, so the window is undersized for the current content.
- The waveform currently consumes a single scalar `level` and synthesizes most bar motion procedurally.
- User and assistant amplitude are currently reduced to one averaged value each, which makes the bars look alive but not truly audio-shaped.
- The TTS path already schedules chunks in sequence via `audioNextStartTimeRef`, so the playback system is already close to gapless at the audio level.

## Proposed design

### 1) Overlay layout fix

#### Compact minimized overlay
- Increase the compact minimized window height and width enough to fully contain:
  - one compact waveform row
  - one compact status row
  - one compact action row
- Favor legibility over the current ultra-short footprint.
- Also simplify the compact UI so it is less text-heavy:
  - shorten labels where possible
  - use tighter spacing and a more icon-forward compact control row
  - reduce stacked visual weight so the overlay still feels lightweight after the size increase

#### Prompt-open minimized variants
- Re-check `prompt-input` and `prompt-response` heights after compact layout changes.
- Current priority is compact minimized mode; prompt-open variants only need adjustment if the compact layout changes create obvious imbalance.

### 2) More seamless waveform rendering

#### Visual goal
- Move from “single level drives all bars” to “reduced real spectrum/envelope drives each bar”.
- Preserve ambient motion for idle/processing, but make active user/assistant bars reflect the current audio shape.
- Keep colour rules unchanged:
  - green = user
  - blue = assistant
  - orange = processing / idle

#### Data model recommendation
- Replace or extend `VoiceWaveform` props so it can receive reduced bar amplitudes, e.g. a normalized array of bar values.
- Renderer computes bar data locally from analyser frequency bins (or RMS/envelope + bins), then smooths them before passing to the component.

#### Mic source recommendation
- Reuse the shared mic stream already created for VAD.
- Sample the analyser continuously while speech listening is enabled, not only after VAD declares speech, so the waveform can feel more immediate.
- Still use the existing VAD-driven state machine to decide colour/state priority.
- Keep bars visible and smoothly decaying across the speech-state transition so the waveform does not appear to drop out shortly before or during the colour change.
- Mic energy may animate the bars while listening, but the waveform should only switch to green once VAD has classified the input as user speech.

#### Assistant source recommendation
- Feed all decoded TTS chunks through one shared playback analysis path.
- Prefer a stable chain like:
  - `AudioBufferSourceNode -> assistantGainNode -> assistantAnalyserNode -> destination`
- Sample analyser bins every animation frame and reduce them into the same bar-count used by `VoiceWaveform`.
- Smooth with attack/release behavior so the waveform does not flicker between chunk boundaries.

#### “Seamless like Parlor” interpretation
- The goal is visual continuity, not just gapless audio.
- Concretely, that means:
  - continuous RAF-driven analyser sampling
  - per-bar smoothing instead of one averaged scalar
  - a shared analyser chain for all active assistant chunks
  - idle fallback drift only when true signal energy is very low
  - hold/decay behavior around user speech transitions so visual amplitude does not disappear before state colour catches up

## Interface contract

### Renderer-local waveform type (proposed)
- `type WaveformBars = readonly number[]`

### `VoiceWaveform.tsx` props (proposed)
- Keep:
  - `state: WaveformVisualState`
  - `className?: string`
  - `compact?: boolean`
  - `label?: string`
- Replace or extend:
  - `bars: WaveformBars` — normalized per-bar amplitudes
  - `activityLevel?: number` — optional overall activity scalar for alpha/glow decisions

### `useVAD.ts` return contract (proposed)
- Keep existing listening/mute state
- Keep `userAudioLevel` if still useful for state priority
- Add:
  - `userWaveformBars: WaveformBars`

### `App.tsx` derived renderer contract (proposed)
- Keep current state selection helper
- Add:
  - `assistantWaveformBars: WaveformBars`
  - `waveformBars: WaveformBars`

### IPC / WebSocket contract
- No new IPC channels
- No new WebSocket messages

## Acceptance criteria

- In minimized compact mode, the waveform, status row, and action row are fully visible with no clipping inside the overlay window.
- The compact minimized overlay may be taller/wider than today, but it also uses a simplified layout so it still feels lightweight.
- In minimized open modes, footer controls and response/input content remain fully visible.
- User speech waveform responds immediately to live mic energy with more natural per-bar variation than the current scalar animation.
- While the mic is listening, waveform bars remain visually continuous; they do not disappear noticeably before the waveform switches into the green user-speaking state.
- AI speech waveform responds to current TTS playback energy with visually continuous motion across chunk boundaries.
- Idle and processing still use orange, with processing visibly more energetic than idle.
- Barge-in still switches visual priority to the user without protocol changes.
- No new sidecar or IPC contracts are introduced.
- Tests cover waveform data reduction/state selection and at least one minimized overlay rendering/layout case.

## Risks / open questions

1. **Compact control simplification:** I plan to simplify the compact overlay labels and spacing in addition to resizing the window. If you want a specific compact wording/icon treatment, call it out before implementation.
2. **Prompt-open variants:** These are not the main issue, so any resizing there should stay minimal unless testing shows clipping.

## Approved decisions captured in this draft

- Compact minimized overlay: make it larger as needed
- Compact minimized UI: also simplify it so the overlay remains lightweight
- Clipping scope: primarily compact minimized mode
- Mic semantics: waveform turns green when VAD says it is speech, not just whenever raw mic energy exists
- Transition fix: keep waveform bars visually continuous so they do not disappear before the colour/state transition
- Waveform API: move from scalar `level` to per-bar `bars`

## Recommendation

Recommended first pass:
- increase the compact minimized bounds and slightly rebalance the compact layout
- use analyser-driven per-bar arrays for both mic and assistant playback
- keep the existing state priority rules, but sample mic bars continuously while speech listening is enabled
- preserve orange ambient fallback only when analyser energy is genuinely near-zero
