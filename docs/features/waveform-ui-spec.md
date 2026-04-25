# Waveform UI Feature Spec

> Feature spec for a reusable waveform component that visualizes user speech, AI speech, and non-speaking states in the renderer. Implemented per the Feature Development Workflow in AGENTS.md.

## Gate Resolution

| Field | Value |
|---|---|
| **Status** | ✅ Complete — implemented |
| **Approval date** | 2026-04-11 |
| **Implemented date** | 2026-04-11 |
| **Approver** | Human reviewer (project lead) |
| **Scoped changes confirmed at approval** | Placement: expanded + minimized overlay; fidelity: real-ish mic amplitude + stylized AI playback-tracking animation; idle and processing both orange with different motion intensity; waveform visible only when speech input is toggled on; reusable component; reduced motion deferred; colors use existing design tokens; no new IPC channels or WebSocket message shapes |

## Goal

Add a reusable waveform UI component that gives immediate visual feedback for who is active in the conversation: green for user speech, blue for AI speech, and orange for processing / silent states.

Inspired by Parlor's renderer-side waveform approach: a lightweight animated bar visualizer with state-based color changes, ambient motion when no strong audio signal is present, and real amplitude-driven motion when audio is available.

## Scope

### Docs
- Create this draft spec: `docs/waveform-ui-spec.md`

### Planned implementation files
- `src/renderer/components/VoiceWaveform.tsx` — reusable waveform renderer
- `src/renderer/App.tsx` — derive and pass waveform state / levels
- `src/renderer/hooks/useVAD.ts` — expose enough mic activity data for live user visualization
- `src/renderer/types/vad-runtime.d.ts` — extend types if stream sharing is needed
- `src/renderer/components/ExpandedSessionView.tsx` — place waveform in expanded session UI
- `src/renderer/components/MinimizedSessionBar.tsx` — compact waveform in minimized UI
- `src/renderer/utils/waveformState.ts` — renderer-local waveform state selection helper
- `src/renderer/styles/globals.css` — only if a tiny amount of shared motion styling is still needed beyond Tailwind classes
- `src/renderer/__tests__/...` — renderer tests for waveform state selection / visibility

## Out of scope

- Sidecar inference changes
- New WebSocket message types or IPC channels unless approval changes the design
- TTS backend/model changes
- Auto-refresh work
- Transcript redesign beyond the waveform placement needed for this feature
- Adding third-party visualization libraries unless explicitly approved

## Current codebase facts this spec builds on

- Renderer already knows when the AI is speaking via `sidecar:audio_start`, `sidecar:audio_chunk`, `sidecar:audio_end`
- Renderer already tracks `isAudioPlaying`, `isSubmitting`, `isListening`, and `isMuted`
- AI audio is decoded and scheduled in `App.tsx`, so playback amplitude can be derived locally without sidecar changes
- User voice currently flows through `useVAD.ts`, but that hook only exposes speaking lifecycle callbacks, not a live mic level yet
- Existing UI already has inline speech labels in `ExpandedSessionView.tsx`, `SessionConversation.tsx`, and `MinimizedSessionBar.tsx`

## Proposed design

### UX behaviour
- Show one shared waveform visual language across session UI
- State priority:
  1. `user` — green, driven by real-ish live mic amplitude when the user is speaking
  2. `assistant` — blue, driven by stylized motion that still tracks actual TTS playback activity
  3. `processing` — orange, animated with low ambient motion while waiting for model response
  4. `idle` — orange, lower-energy ambient motion when session is active but nobody is speaking
- The waveform should never freeze completely; idle / processing should still show subtle motion so the UI feels alive
- When the user barges in, the waveform should switch from blue to green as playback stops and mic input becomes dominant
- The waveform is visible only when speech input is toggled on by the user

### Rendering approach
- Use a small canvas-based bar waveform inspired by Parlor
- Default shape: centered vertical rounded bars with mirrored height around the midline
- No dependency on external charting / waveform packages
- Use `requestAnimationFrame` for drawing
- Use real amplitude when available; fall back to ambient drift when signal is absent or very quiet

### Data source approach
- **AI waveform:** derive a renderer-local playback level from the existing Web Audio TTS path so blue animation tracks active speech playback without requiring sample-perfect amplitude accuracy
- **User waveform:** extend `useVAD.ts` so the microphone path can expose a normalized live level for the waveform; exact metering accuracy is not required
- Do not send audio levels over IPC or WebSocket; keep the feature renderer-local

## Interface contract

### New local renderer type
- `type WaveformVisualState = 'idle' | 'processing' | 'user' | 'assistant'`

### New component
- `VoiceWaveform.tsx`
- Props:
  - `state: WaveformVisualState`
  - `level: number` — normalized `0..1`; active source level for the current state
  - `className?: string`
  - `compact?: boolean` — optional smaller layout for minimized UI
  - `label?: string` — optional accessible text / small caption

### `useVAD.ts` change (proposed)
- Extend `UseVADReturn` with:
  - `userAudioLevel: number` — normalized `0..1`, updated while mic is active
  - `isUserSpeaking: boolean` — true during an active detected speech segment
- If needed, extend `VadMicVADOptions` typing with:
  - `getStream?: () => Promise<MediaStream>`

### `App.tsx` derived state contract (renderer-only)
- Add derived values, not shared types:
  - `userAudioLevel: number`
  - `assistantAudioLevel: number`
  - `waveformState: WaveformVisualState`
  - `waveformLevel: number`
  - `showWaveform: boolean`

### IPC / WebSocket contract
- No new IPC channels
- No new WebSocket message shapes

## Planned placement

### Expanded session view
- Add the waveform near the existing Speech section so mic / AI activity is visible without taking over the conversation layout

### Minimized session bar
- Show a compact waveform beside or directly above the existing mic / speaking indicators

## Acceptance criteria

- In an active session, the waveform is visible in the approved placement(s)
- The waveform is hidden when speech input is toggled off
- When the user speaks, the waveform turns green and its bar heights respond to mic loudness
- When the AI is speaking via streamed TTS audio, the waveform turns blue and its motion tracks active playback in a way that visually matches the speech
- While awaiting the model response, the waveform turns orange and shows low-energy motion
- When the session is active but silent, the waveform remains orange with subtler motion than processing
- Barge-in transitions blue → green without needing a full UI refresh
- Ending a session or leaving the active session view stops waveform animation and releases any added audio resources cleanly
- No new Electron main-process, IPC, or sidecar protocol changes are required
- Renderer tests cover waveform state selection logic and at least one visibility/rendering case

## Risks / open questions

1. **Mic stream sharing:** `vad-web` supports a `getStream` pattern in the reference implementation, but if the current runtime behaves differently in Electron we may need a small fallback plan for user-level sampling.
2. **Minimized layout density:** compact overlay space is tight, so the first pass should prefer legibility over squeezing in too many labels around the waveform.
3. **Conversation bubble integration:** Deferred — this feature only introduces a reusable waveform component, not inline message waveforms.

## Approval checklist

Approved decisions captured in this spec:
- placement: `expanded + minimized`
- fidelity: `real-ish mic amplitude` + `stylized AI playback-tracking animation`
- idle + processing: both orange, with different motion intensity
- visibility: only when speech input is toggled on
- reusable component: yes
- reduced motion: not part of the first pass
- colors: use existing design tokens
