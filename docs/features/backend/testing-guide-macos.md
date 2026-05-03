# Testing the Native Backend — macOS

> **Who is this for?** A team member on a macOS machine (arm64 Apple Silicon or Intel x64) who wants to validate the LiteRT-LM C++ bridge on the `research/distribution-and-native-backend` branch.

---

## What you are testing

The LiteRT-LM C++ bridge (`delfin_litert_bridge`) replaces the Python sidecar with a single native binary. The acceptance criteria are in [`litert-cpp-bridge-runtime-validation-spec.md`](litert-cpp-bridge-runtime-validation-spec.md). You will build the binary, run the S1/S2/S3 benchmark sweep, and optionally launch the full Electron app.

---

## Step 0 — Install prerequisites

| Tool | Install |
|------|---------|
| **Xcode Command Line Tools** | `xcode-select --install` |
| **Bazelisk** | `brew install bazelisk` |
| **Node.js 20+** | `brew install node` or [nodejs.org](https://nodejs.org) |
| **Python 3.12+** | `brew install python@3.12` or via Conda |

Verify with:
```bash
clang --version
bazelisk version
node -v     # need 20+
python3 -V  # need 3.12+
```

---

## Step 1 — Clone LiteRT-LM (outside the Delfin repo)

The build script injects the bridge source into Google's upstream tree to compile with Bazel. The LiteRT-LM clone must live **outside** the Delfin repository — placing it inside `app_delfin/` would pollute the project's working tree and confuse git.

Clone it somewhere like your home directory:

```bash
# ⚠️  Run this from your home directory (or any path outside app_delfin/)
cd ~
git clone https://github.com/google-ai-edge/LiteRT-LM.git
# Result: ~/LiteRT-LM   ← this is the path you'll pass to the test script
```

You can also use any other parent directory — just note the full path:

```bash
# Alternative: a dedicated projects folder
git clone https://github.com/google-ai-edge/LiteRT-LM.git ~/projects/LiteRT-LM
# Then pass ~/projects/LiteRT-LM as the argument in Step 3
```

> The clone is ~500 MB. Bazel will download additional dependencies on the first build (~1 GB). Both are one-time costs.

---

## Step 2 — Pull the branch and set up Delfin

Run these from inside the `app_delfin/` directory:

```bash
cd /path/to/app_delfin   # wherever you cloned Delfin
git pull
git checkout research/distribution-and-native-backend
npm install
npm run setup:sidecar   # creates sidecar/.venv with benchmark Python deps
```

---

## Step 3 — Run the automated test script

This single command checks prerequisites, builds the bridge, downloads the model, and configures voice/TTS (Piper). Pass the path to your **LiteRT-LM clone** (the one you created outside of `app_delfin/` in Step 1):

```bash
# Run from inside app_delfin/
./scripts/test-native-backend.sh ~/LiteRT-LM
```

> **First run takes 10–20 minutes** — Bazel downloads dependencies and compiles ~200 C++ source files. Subsequent runs use the Bazel cache and take under 30 seconds.

**What the script does for you:**
1. **Builds the C++ bridge** binary inside your LiteRT-LM tree.
2. **Downloads the model** (`gemma-4-E2B-it.litertlm`) if missing.
3. **Patches your `.env`** with `LITERT_CPP_BIN` and `LITERT_CPP_MODEL`.
4. **Sets up Piper TTS**: it enables `VOICE_ENABLED=true`, sets `LITERT_CPP_TTS_BACKEND=piper`, and prompts to install the recommended `hfc_female` voice.
5. **Starts the proxy** and runs the S1/S2/S3 benchmark sweep.

Watch for `✅ Built: .../bin/delfin_litert_bridge` to confirm the build succeeded, then wait for `ready` before the benchmark starts.

---

## Step 4 — Report your results

Once the benchmark finishes, find the output:

```bash
ls -lt results/*.json | head -3
```

Share the **latest JSON file** and the terminal output (especially S1 TTFT, S2 TTFT, and S3 Turn 2+ TTFT) with the team.

**Expected numbers** (based on Windows validation — macOS may differ):

| Scenario | Metric | Target |
|----------|--------|--------|
| S1 (text) | TTFT | ~5,000–6,000 ms |
| S2 (vision) | TTFT | logged (no prior macOS baseline) |
| S3 Turn 2+ | TTFT | **≤ 700 ms** (KV-cache reuse) |

---

## Step 5 — Full app validation (required)

This step tests the complete user-facing experience with the C++ backend. Run it after the benchmark in Step 3.

### Start the app

```bash
# Terminal 1 — start the C++ proxy (leave this running)
npm run dev:litert-cpp

# Terminal 2 — start Electron
npm run dev
```

### Checklist

Work through each item and note ✅ pass / ❌ fail / ⚠️ partial in your report.

#### Text turns
- [ ] Open a new study session from the home screen.
- [ ] Type a question (e.g. "What is gradient descent?") and press Enter.
- [ ] Tokens stream in progressively — no blank response or error banner.
- [ ] The session saves correctly and appears on the home screen after you exit.

#### Vision (screenshot capture)
- [ ] Open any app with visible content (a browser page, a PDF, a slide deck).
- [ ] In Delfin, press the capture button or wait for auto-capture.
- [ ] Ask a question about what's on screen (e.g. "Summarise what you see").
- [ ] The response correctly references the captured content — not a generic reply.

#### Voice input
> Voice should already be on (`VOICE_ENABLED=true`). The mic waveform appears in the overlay when a session is active.

- [ ] Start a session and speak a question aloud.
- [ ] The waveform animates while you speak, then stops.
- [ ] The spoken question is submitted as a turn (visible in the transcript).
- [ ] A streamed response arrives — same quality as a typed turn.

#### Piper TTS (spoken responses)
> Piper is configured if you accepted the `hfc_female` install prompt in Step 3.

- [ ] After a text or voice turn completes, the response is read aloud by Piper.
- [ ] Speech is sentence-by-sentence (not all-at-once at the end).
- [ ] Voice sounds like `hfc_female` — a clear female US English voice.
- [ ] Saying something while the app is speaking stops playback (barge-in).

If you skipped the voice install prompt or need to reinstall:
```bash
npm run voice:install -- en/en_US/hfc_female/medium --use
# then restart: npm run dev:litert-cpp
```

> **Note:** If Piper is disabled or its binary is missing, the proxy falls back to browser Web Speech automatically — this is the expected graceful-degradation path.

---

## Troubleshooting

**Build fails with `no such target '//runtime/engine:delfin_litert_bridge'`**
The build script patches the upstream `BUILD` file once. If it already ran but the binary was missing, check `<your-LiteRT-LM-path>/runtime/engine/BUILD` for the `delfin_litert_bridge` target. If it is absent, the patch failed silently — re-run the script.

**Bazel downloads are very slow**
Bazel respects `HTTP_PROXY` / `HTTPS_PROXY`. If you are on a slow connection, set these to an appropriate proxy.

**`--config` error from Bazel**
The build script omits `--config` on macOS (Bazel auto-detects clang). If your LiteRT-LM version requires a specific config, override:
```bash
node scripts/build-litert-cpp-bridge.mjs \
  --litert-lm-dir ~/LiteRT-LM \   # adjust to your actual clone path
  --bazel-config --config=macos
```

**Proxy exits immediately after build**
Check `.env` has `LITERT_CPP_BIN=./bin/delfin_litert_bridge` (no `.exe`). The script sets this automatically, but a stale `.env` may override it.

**S2 (vision) fails or returns empty**
Vision is newly implemented and untested on macOS. Note the exact error and share it — this is expected and tracking it is part of the validation goal.
