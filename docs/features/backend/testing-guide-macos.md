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

## Step 1 — Clone LiteRT-LM

The bridge source is injected into Google's upstream tree to compile. You need a local clone:

```bash
git clone https://github.com/google-ai-edge/LiteRT-LM.git ~/LiteRT-LM
```

> The clone is ~500 MB. Bazel will download additional dependencies on the first build (~1 GB). Both are one-time costs.

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

## Step 5 — Optional: test inside the Electron app

```bash
# Terminal 1 — keep the proxy running
npm run dev:litert-cpp

# Terminal 2 — start Electron (reads LITERT_CPP_BIN from .env)
npm run dev
```

The script already wrote `LITERT_CPP_BIN` and `LITERT_CPP_MODEL` to your `.env`. Try a text turn and a screenshot capture to verify vision.

---

## Troubleshooting

**Build fails with `no such target '//runtime/engine:delfin_litert_bridge'`**
The build script patches the upstream `BUILD` file once. If it already ran but the binary was missing, check `~/LiteRT-LM/runtime/engine/BUILD` for the `delfin_litert_bridge` target. If it is absent, the patch failed silently — re-run the script.

**Bazel downloads are very slow**
Bazel respects `HTTP_PROXY` / `HTTPS_PROXY`. If you are on a slow connection, set these to an appropriate proxy.

**`--config` error from Bazel**
The build script omits `--config` on macOS (Bazel auto-detects clang). If your LiteRT-LM version requires a specific config, override:
```bash
node scripts/build-litert-cpp-bridge.mjs \
  --litert-lm-dir ~/LiteRT-LM \
  --bazel-config --config=macos
```

**Proxy exits immediately after build**
Check `.env` has `LITERT_CPP_BIN=./bin/delfin_litert_bridge` (no `.exe`). The script sets this automatically, but a stale `.env` may override it.

**S2 (vision) fails or returns empty**
Vision is newly implemented and untested on macOS. Note the exact error and share it — this is expected and tracking it is part of the validation goal.
