# Testing the Native Backend — Linux

> **Who is this for?** A team member on a Linux x64 machine (Ubuntu 22.04+ recommended) who wants to validate the LiteRT-LM C++ bridge on the `research/distribution-and-native-backend` branch.

---

## What you are testing

The LiteRT-LM C++ bridge (`delfin_litert_bridge`) replaces the Python sidecar with a single native binary. The acceptance criteria are in [`litert-cpp-bridge-runtime-validation-spec.md`](litert-cpp-bridge-runtime-validation-spec.md). You will build the binary, run the S1/S2/S3 benchmark sweep, and optionally launch the full Electron app.

> **WSL2 note:** If you are on Windows with WSL2 Ubuntu, these instructions work as-is. The benchmark will run inside WSL2. The Electron app must still be started from the Windows side; connect it to the WSL2 proxy via `SIDECAR_WS_URL=ws://<WSL2-IP>:8321/ws`.

---

## Step 0 — Install prerequisites

```bash
# C++ compiler + build tools
sudo apt update && sudo apt install -y build-essential git curl python3 python3-pip python3-venv

# Node.js 20+ (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Bazelisk
curl -Lo /usr/local/bin/bazelisk \
  https://github.com/bazelbuild/bazelisk/releases/latest/download/bazelisk-linux-amd64
chmod +x /usr/local/bin/bazelisk
```

Verify:
```bash
g++ --version       # or clang++ --version
bazelisk version
node -v             # need 20+
python3 -V          # need 3.12+
```

> **Python 3.12 on Ubuntu 22.04**: if `python3 -V` shows 3.10, install 3.12 via the deadsnakes PPA:
> ```bash
> sudo add-apt-repository ppa:deadsnakes/ppa
> sudo apt install -y python3.12 python3.12-venv
> ```

---

## Step 1 — Clone LiteRT-LM

```bash
git clone https://github.com/google-ai-edge/LiteRT-LM.git ~/LiteRT-LM
```

> The clone is ~500 MB. Bazel downloads additional dependencies on the first build (~1 GB). Both are one-time costs.

---

## Step 2 — Pull the branch and set up Delfin

```bash
git pull
git checkout research/distribution-and-native-backend
npm install
npm run setup:sidecar   # creates sidecar/.venv with benchmark Python deps
```

---

## Step 3 — Run the automated test script

This single command checks prerequisites, builds the bridge, downloads the model if needed, starts the proxy, and runs the full benchmark:

```bash
./scripts/test-native-backend.sh ~/LiteRT-LM
```

> **First run takes 10–20 minutes** — Bazel downloads dependencies and compiles ~200 C++ source files. Subsequent runs use the Bazel cache and take under 30 seconds.

Watch for `✅ Built: .../bin/delfin_litert_bridge` to confirm the build succeeded, then wait for `ready` before the benchmark starts.

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

## Step 5 — Optional: test inside the Electron app

```bash
# Terminal 1 — proxy
npm run dev:litert-cpp

# Terminal 2 — Electron app
npm run dev
```

The test script already wrote `LITERT_CPP_BIN` and `LITERT_CPP_MODEL` to `.env`. Try a text turn and a screenshot capture to verify vision works.

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
  --litert-lm-dir ~/LiteRT-LM \
  --bazel-config --config=linux
```

**WSL2: proxy starts but Electron can't connect**
Get the WSL2 IP and update `.env`:
```bash
hostname -I | awk '{print $1}'  # e.g. 172.20.x.x
# In .env on the Windows side:
# SIDECAR_WS_URL=ws://172.20.x.x:8321/ws
```

**S2 (vision) fails or returns empty**
Vision is newly implemented and untested on Linux. Note the exact error and share it — this is expected and tracking it is part of the validation goal.

**espeak-ng errors from TTS**
If the Python sidecar TTS pipeline complains about espeak-ng data, apply the WSL2 symlink fix documented in `AGENTS.md` §Validated Technical Decisions. The C++ bridge itself does not use espeak-ng.
