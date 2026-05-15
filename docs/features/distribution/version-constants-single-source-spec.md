# Distribution — Single Source of Truth for Version Constants

> Gate 1 spec — awaiting approval before implementation.

## Gate Resolution

| Field          | Value |
| -------------- | ----- |
| **Status**     | 🚧 Gate 1 — spec draft, awaiting human approval. |
| **Created**    | 2026-05-15 |
| **Depends on** | Nothing — self-contained refactor. |
| **Blocks**     | Any future `LITERT_LM_REF` or `MODEL_REVISION` bump; currently those bumps require two separate edits with no enforcement. |

---

## Problem

Two files independently pin the same version constants with no shared source of truth:

| Constant | `scripts/setup-litert-cpp.mjs` | `src/main/sidecar/assetManager.ts` |
|---|---|---|
| `MODEL_REVISION` | `export const MODEL_REVISION = '84b6978...'` | `const MODEL_REVISION = "84b6978..."` |
| `LITERT_LM_REF` | `export const LITERT_LM_REF = 'v0.11.0'` | not present (only the model is managed here) |
| `MODEL_REPO` | read from `env` / `process.env` with a hardcoded fallback | `const MODEL_REPO = "litert-community/..."` (hardcoded) |
| `MODEL_FILE` | read from `env` / `process.env` with a hardcoded fallback | `const MODEL_FILE = "gemma-4-E2B-it.litertlm"` (hardcoded) |

**`assetManager.ts`** drives the first-run download flow in the packaged app. Its `MODEL_REVISION` is also the version key written to `userData/manifest.json`; a mismatch between manifest and definition triggers re-download on every launch.

**`setup-litert-cpp.mjs`** drives dev setup and CI bridge rebuilds.

**The drift scenario:** when a developer bumps `LITERT_LM_REF` + `MODEL_REVISION` in `setup-litert-cpp.mjs` to upgrade the bridge, there is no check that forces `assetManager.ts` to be updated in the same commit. The packaged app will silently keep downloading the old model revision while dev builds use the new one. No test or CI gate currently catches this.

A secondary issue: `MODEL_REPO`, `MODEL_FILE`, and the Piper `PIPER_RELEASE_TAG` / `PIPER_VOICE_ID` pinned in `assetManager.ts` are also defined independently of any script-level equivalent, adding further surface for drift.

---

## Goal

Make it structurally impossible for `setup-litert-cpp.mjs` and `assetManager.ts` to drift on model and bridge version constants — by giving them a single shared source that both import from.

---

## Proposed solution

### `scripts/versions.mjs` — single canonical constants file

```js
// scripts/versions.mjs
// Single source of truth for pinned version constants.
// setup-litert-cpp.mjs imports this directly.
// assetManager.ts consumes it via Vite define (baked at build time).
// ALWAYS bump MODEL_REVISION and LITERT_LM_REF together — see README §Updating the LiteRT-LM bridge.

export const LITERT_LM_REF    = 'v0.11.0'
export const MODEL_REVISION   = '84b6978eff6e4eea02825bc2ee4ea48579f13109'
export const MODEL_REPO       = 'litert-community/gemma-4-E2B-it-litert-lm'
export const MODEL_FILE       = 'gemma-4-E2B-it.litertlm'
export const PIPER_RELEASE_TAG = '2023.11.14-2'
export const PIPER_VOICE_ID   = 'en_US-hfc_female-medium'
```

### `setup-litert-cpp.mjs` — replace inline constants with imports

Replace the inline `export const LITERT_LM_REF = ...` and `export const MODEL_REVISION = ...` at the top of the file with:

```js
import { LITERT_LM_REF, MODEL_REVISION, MODEL_REPO, MODEL_FILE } from './versions.mjs'
```

The `MODEL_REPO` and `MODEL_FILE` fallback logic (currently: `process.env.MODEL_REPO ?? env['MODEL_REPO'] ?? 'litert-community/...'`) stays; `versions.mjs` values simply become the canonical fallback rather than inline strings.

### `electron.vite.config.ts` — inject via Vite `define`

Read the constants at build time and inject them as compile-time replacements:

```ts
import { LITERT_LM_REF, MODEL_REVISION, MODEL_REPO, MODEL_FILE, PIPER_RELEASE_TAG, PIPER_VOICE_ID } from './scripts/versions.mjs'

// in the main config:
define: {
  __MODEL_REVISION__:    JSON.stringify(MODEL_REVISION),
  __MODEL_REPO__:        JSON.stringify(MODEL_REPO),
  __MODEL_FILE__:        JSON.stringify(MODEL_FILE),
  __PIPER_RELEASE_TAG__: JSON.stringify(PIPER_RELEASE_TAG),
  __PIPER_VOICE_ID__:    JSON.stringify(PIPER_VOICE_ID),
}
```

TypeScript needs corresponding ambient declarations in `src/main/env.d.ts` (or a new `src/main/versions.d.ts`):

```ts
declare const __MODEL_REVISION__:    string
declare const __MODEL_REPO__:        string
declare const __MODEL_FILE__:        string
declare const __PIPER_RELEASE_TAG__: string
declare const __PIPER_VOICE_ID__:    string
```

### `assetManager.ts` — replace hardcoded strings with injected constants

```ts
// Before:
const MODEL_REPO     = "litert-community/gemma-4-E2B-it-litert-lm"
const MODEL_FILE     = "gemma-4-E2B-it.litertlm"
const MODEL_REVISION = "84b6978eff6e4eea02825bc2ee4ea48579f13109"
const PIPER_RELEASE_TAG = "2023.11.14-2"
const PIPER_VOICE_ID    = "en_US-hfc_female-medium"

// After:
const MODEL_REPO     = __MODEL_REPO__
const MODEL_FILE     = __MODEL_FILE__
const MODEL_REVISION = __MODEL_REVISION__
const PIPER_RELEASE_TAG = __PIPER_RELEASE_TAG__
const PIPER_VOICE_ID    = __PIPER_VOICE_ID__
```

`LITERT_LM_REF` is not consumed by `assetManager.ts` and does not need to be injected (it is only used by `setup-litert-cpp.mjs` and the CI workflow).

### Test guard

Add a test in `scripts/setup-litert-cpp.test.mjs` (or a new `scripts/versions.test.mjs`) that imports both `scripts/versions.mjs` and `src/main/sidecar/assetManager.ts`'s expected constants, and asserts they are identical. Since `assetManager.ts` will reference `__MODEL_REVISION__` etc., the test instead validates that the `define` values are derivable from `versions.mjs` and that no inline overrides exist in `assetManager.ts` (a source grep assertion is sufficient).

---

## Scope

**In scope:**

- `scripts/versions.mjs` — new file
- `scripts/setup-litert-cpp.mjs` — replace inline constants with imports from `versions.mjs`; existing env-override logic (`process.env.MODEL_REPO ?? ...`) is preserved
- `electron.vite.config.ts` — add `define` block for the six constants
- `src/main/sidecar/assetManager.ts` — replace five hardcoded constants with the injected `__CONSTANT__` names
- `src/main/versions.d.ts` (new) — ambient `declare const` for the injected names, or extend existing `src/env.d.ts` if one exists
- `scripts/versions.test.mjs` (new) — structural assertion that `assetManager.ts` contains no hardcoded version strings matching the old values
- `docs/README.md` — add `versions.mjs` to the "Updating the LiteRT-LM bridge" procedure description
- `docs/SPEC.md` §Environment Variables — note that `MODEL_REVISION` is now authoritative in `scripts/versions.mjs`
- `README.md` §Updating the LiteRT-LM bridge — update Step 3 to say "edit `scripts/versions.mjs`" instead of "`scripts/setup-litert-cpp.mjs`"

**Out of scope:**

- Moving `LITERT_LM_REF` out of `setup-litert-cpp.mjs` exports (it is consumed by tests for that file; the import from `versions.mjs` is sufficient)
- `.env.example` `MODEL_REVISION` comment (the env-override path is a dev escape hatch, not the primary pin; the comment already explains this)
- Piper version management beyond replacing the hardcoded strings (voice switching via `npm run voice:use` is a separate concern)
- Any changes to CI workflows

---

## Files changed

| File | Change |
|---|---|
| `scripts/versions.mjs` | **New** — six exported constants |
| `scripts/versions.test.mjs` | **New** — structural assertion against stale hardcodes |
| `scripts/setup-litert-cpp.mjs` | Replace 2 inline `export const` with imports; keep `LITERT_LM_REF` re-exported for test compatibility |
| `electron.vite.config.ts` | Add `define` block reading from `scripts/versions.mjs` |
| `src/main/sidecar/assetManager.ts` | Replace 5 hardcoded strings with `__CONSTANT__` names |
| `src/main/versions.d.ts` | **New** — ambient declarations for the 5 injected names |
| `README.md` | Step 3 of §Updating the LiteRT-LM bridge — point to `scripts/versions.mjs` |
| `docs/SPEC.md` | §Environment Variables — note authoritative location |

---

## Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | `scripts/versions.mjs` is the only file that defines `MODEL_REVISION`, `MODEL_REPO`, `MODEL_FILE`, `PIPER_RELEASE_TAG`, and `PIPER_VOICE_ID` as literal strings. `npm test` includes an assertion that catches any new hardcoded copies. |
| AC2 | `npm run setup:litert-cpp` (dry-run) logs the same model revision as `npm run build` embeds in `assetManager.ts` — verified by inspecting the built `dist/electron/main/index.js` for the SHA. |
| AC3 | After bumping `MODEL_REVISION` in `scripts/versions.mjs` alone, both `setup-litert-cpp.mjs` and the Electron build immediately reflect the new value with no other edits required. |
| AC4 | `npm test` passes with no regressions. |
| AC5 | `npm run build` succeeds and `dist/electron/main/index.js` does not contain the literal string `__MODEL_REVISION__` (i.e. the `define` substitution fires correctly). |
| AC6 | The `README.md` §Updating the LiteRT-LM bridge procedure correctly describes editing `scripts/versions.mjs` as the single edit point. |

---

## Risks and open questions

| Risk | Likelihood | Mitigation |
|---|---|---|
| Vite `define` does not fire for Electron main in `electron-vite` | Low | `electron-vite` exposes per-process config objects; `define` in the `main` config is standard. Verify in a spike commit before implementing the full change. |
| `electron.vite.config.ts` importing a `.mjs` file causes a TypeScript or bundler error | Low | The config file is run by Vite (not `tsc`), so ESM `.mjs` imports work. If it fails, add `"type": "module"` or use a dynamic `import()` inside an `async` plugin. |
| Test for "no hardcoded strings" is too brittle (e.g. false-positive on SHA in a comment) | Low | Match only the specific old SHA / strings, and scope the grep to `src/main/sidecar/assetManager.ts` — not the whole repo. |
