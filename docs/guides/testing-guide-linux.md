# Linux Native Backend Setup & Validation Guide

> **Who is this for?** A developer or tester on Linux x64 (Ubuntu 22.04+ recommended) who wants the full setup + validation flow for the LiteRT-LM C++ bridge.

---

## What this guide covers

The LiteRT-LM C++ bridge (`delfin_litert_bridge`) replaces the Python sidecar with a single native binary. The acceptance criteria are in [`litert-cpp-bridge-runtime-validation-spec.md`](../features/backend/litert-cpp-bridge-runtime-validation-spec.md). Default setup downloads the CI-built `delfin-litert-bridge-linux-x64` artifact; source builds are reserved for backend developers using `--source-build`.

> **WSL2 note:** If you are on Windows with WSL2 Ubuntu, these instructions work as-is. The benchmark will run inside WSL2. The Electron app must still be started from the Windows side; connect it to the WSL2 sidecar via `SIDECAR_URL=http://<WSL2-IP>:8321`.

---

## Step 0 — Install prerequisites

```bash
# Runtime setup tools
sudo apt update && sudo apt install -y git curl python3 python3-pip python3-venv

# Node.js 20+ (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# GitHub CLI (see official instructions for your distro if this changes)
type -p curl >/dev/null || sudo apt install curl -y
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
  sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
  sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh -y
gh auth login
```

Verify:
```bash
node -v             # need 20+
python3 -V          # need 3.12+
gh auth status
```

> **Python 3.12 on Ubuntu 22.04**: if `python3 -V` shows 3.10, install 3.12 via the deadsnakes PPA:
> ```bash
> sudo add-apt-repository ppa:deadsnakes/ppa
> sudo apt install -y python3.12 python3.12-venv
> ```

---

## Step 1 — Optional source-build prep

Skip this step for normal artifact-based setup. Backend developers who need to rebuild `delfin_litert_bridge` locally should install build tools and Bazelisk, then clone LiteRT-LM **outside** the Delfin repository.

```bash
sudo apt install -y build-essential clang default-jdk
curl -Lo /usr/local/bin/bazelisk \
  https://github.com/bazelbuild/bazelisk/releases/latest/download/bazelisk-linux-amd64
chmod +x /usr/local/bin/bazelisk
```

Clone it somewhere like your home directory:

```bash
# ⚠️  Run this from your home directory (or any path outside app_delfin/)
cd ~
git clone https://github.com/google-ai-edge/LiteRT-LM.git
# Result: ~/LiteRT-LM   ← default location used by --source-build
```

You can also use any other parent directory — just note the full path:

```bash
# Alternative: a dedicated projects folder
git clone https://github.com/google-ai-edge/LiteRT-LM.git ~/projects/LiteRT-LM
# Then pass --litert-lm-dir ~/projects/LiteRT-LM when using --source-build
```

> The clone is ~500 MB. Bazel downloads additional dependencies on the first source build (~1 GB). Both are one-time costs.

---

## Step 2 — Pull the branch and set up Delfin

Run these from inside the `app_delfin/` directory:

```bash
cd /path/to/app_delfin   # wherever you cloned Delfin
git pull
git checkout research/distribution-and-native-backend
npm install
```

---

## Step 3 — Run setup

This single command seeds `.env`, downloads the CI bridge artifact, downloads the model, configures voice/TTS (Piper), and validates env keys:

```bash
# Run from inside app_delfin/
npm run setup
```

Backend developers can force a source build instead (calls the underlying step directly):

```bash
npm run setup:litert-cpp -- --source-build
```

**What the script does for you:**
1. **Seeds `.env`** from `.env.example` if it does not already exist (`setup:env`).
2. **Stages the C++ bridge** from `delfin-litert-bridge-linux-x64` into `bin/`.
3. **Downloads the model** (`gemma-4-E2B-it.litertlm`) if missing.
4. **Patches your `.env`** with `LITERT_CPP_BIN` and `LITERT_CPP_MODEL`.
5. **Sets up Piper TTS**: it enables `VOICE_ENABLED=true`, sets `LITERT_CPP_TTS_BACKEND=piper`, and prompts to install the recommended `hfc_female` voice.
6. **Validates `.env`** has every key from `.env.example` (`check:env`).
7. Leaves the repo ready for `npm run dev:backend` and optional benchmarking.

Watch for `✅ Bridge staged from GitHub Actions artifact` to confirm the artifact was installed.

---

## Step 4 — Report your results

```bash
ls -lt results/*.json | head -3
```

Share the **latest JSON file** and terminal output (S1 TTFT, S2 TTFT, and S3 Turn 2+ TTFT) with the team.

**Expected numbers** (based on Windows validation — Linux may differ):

| Scenario | Metric | Target |
|----------|--------|--------|
| S1 (text) | TTFT | ~5,000–6,000 ms |
| S2 (vision) | TTFT | logged (no prior Linux baseline) |
| S3 Turn 2+ | TTFT | **≤ 700 ms** (KV-cache reuse) |

---

## Step 5 — Full app validation (required)

This step tests the complete user-facing experience with the C++ backend. Run it after the benchmark in Step 3.

### Start the app

```bash
# Terminal 1 — start the C++ proxy (leave this running)
npm run dev:backend

# Terminal 2 — start Electron
npm run dev
```

> **WSL2:** The proxy runs in WSL2. Start the Electron app from a Windows terminal in the same repo directory (`npm run dev`). Ensure `SIDECAR_URL=http://<WSL2-IP>:8321` in `.env` on the Windows side.

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
# then restart: npm run dev:backend
```

> **Note:** If Piper is disabled or its binary is missing, the proxy falls back to browser Web Speech automatically — this is the expected graceful-degradation path.

> **WSL2 audio note:** Piper outputs audio via the system sound device. In WSL2, run `pactl info` to confirm PulseAudio is connected. If no sound device is found, browser Web Speech (running on the Windows-side Electron window) is the simpler fallback.

---

## Troubleshooting

**Bazel fails with `error: command not found: bazelisk`**
Make sure `/usr/local/bin` is in your `PATH`. Run `which bazelisk` to verify.

**Build fails with linker error about `--dynamic-list`**
Your `ld` version may not support the `--dynamic-list` flag used in the Linux linkopts. Try with `gold` or `lld`:
```bash
sudo apt install -y binutils-gold   # or: sudo apt install -y lld
# then re-run the test script
```

**`--config` error from Bazel**
The build script omits `--config` on Linux (Bazel auto-detects GCC/Clang). If your LiteRT-LM version requires a specific config, override:
```bash
node scripts/build-litert-cpp-bridge.mjs \
  --litert-lm-dir ~/LiteRT-LM \   # adjust to your actual clone path
  --bazel-config --config=linux
```

**WSL2: proxy starts but Electron can't connect**
Get the WSL2 IP and update `.env`:
```bash
hostname -I | awk '{print $1}'  # e.g. 172.20.x.x
# In .env on the Windows side:
# SIDECAR_URL=http://172.20.x.x:8321
```

**S2 (vision) fails or returns empty**
Vision is newly implemented and untested on Linux. Note the exact error and share it — this is expected and tracking it is part of the validation goal.

**espeak-ng errors from TTS**
If the Python sidecar TTS pipeline complains about espeak-ng data, apply the WSL2 symlink fix documented in `AGENTS.md` §Validated Technical Decisions. The C++ bridge itself does not use espeak-ng.
