# Windows Setup & Validation Guide

> **Who is this for?** A developer or tester on a Windows host who wants the full setup + validation flow for Delfin, either through the default WSL2 path or the native LiteRT-LM C++ bridge path.

---

## Choose your Windows path

### Option A — Windows + WSL2 (default for general development)

Use this when you want the standard LiteRT-LM Python sidecar flow. Electron runs on the Windows host; the sidecar runs inside WSL2 Ubuntu.

### Option B — Native Windows with the CI-built LiteRT C++ bridge

Use this when you want to validate the prebuilt `delfin_litert_bridge.exe` artifact produced by `.github/workflows/build-litert-cpp-bridge.yml`.

### Option C — Native Windows local build (opt-in)

Use this only when you need to rebuild the bridge locally with Bazel + MSVC instead of consuming the CI artifact.

---

## Option A — Windows + WSL2 quick setup

### Prerequisites

- [WSL2](https://learn.microsoft.com/windows/wsl/install) with Ubuntu 22.04+
- [Node.js 20+](https://nodejs.org/) installed on both Windows and WSL2
- [Python 3.12+](https://www.python.org/downloads/) installed in WSL2

### Terminal 1 — WSL2 Ubuntu (sidecar)

```bash
git clone https://github.com/delfin-project/delfin.git
cd delfin
npm install
npm run setup
npm run dev:sidecar
```

### Terminal 2 — Windows PowerShell (Electron)

```powershell
cd C:\path\to\delfin
npm install
npm run dev
```

If Windows cannot reach `localhost:8321`, find the WSL2 IP with `hostname -I` and set `SIDECAR_URL=http://<WSL2-IP>:8321` in the Windows-side `.env`.

---

## Option B — Native Windows one-shot setup

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/downloads/)
- GitHub CLI (`winget install --id GitHub.cli -e`) and `gh auth login` for CI artifact download
- Optional, for backend source builds: Bazelisk + Visual Studio 2022 Build Tools

### Run setup

```powershell
cd C:\path\to\delfin
npm install
npm run setup
npm run check:windows
```

What this does:

1. Seeds `.env` from `.env.example` if it does not already exist (`setup:env`)
2. Creates/updates `.env` with `LITERT_CPP_*` and Piper values (`setup:litert-cpp`)
3. Reuses existing `bin\` bridge files, otherwise downloads `delfin-litert-bridge-windows-x64` from the latest successful GitHub Actions workflow run via `gh`
4. Ensures the `.litertlm` model exists under `models\`
5. Bootstraps the repo-local Piper runtime under `bin\piper\venv\`
6. Downloads/activates the default Piper voice and writes `LITERT_CPP_TTS_BACKEND=piper`
7. Validates that `.env` has every key from `.env.example` (`check:env`)

### Optional bridge-only smoke test

```powershell
cd C:\path\to\delfin
npm install
npm run download:bridge:windows
npm run test:bridge:windows -- --SkipBenchmark
```

What this does:

1. Downloads `delfin-litert-bridge-windows-x64` from the latest successful workflow run
2. Stages `delfin_litert_bridge.exe` and `libGemmaModelConstraintProvider.dll` into `bin\`
3. Ensures `.env` points `LITERT_CPP_BIN` and `LITERT_CPP_MODEL` at the expected paths
4. Downloads the `.litertlm` model if missing, defaulting to Python `huggingface_hub` and falling back to Windows BITS, then `curl.exe` retry/resume with a temporary `.part` file
5. Starts `npm run dev:backend` and waits for `http://localhost:8321/health`

> This CI-artifact smoke test still validates the bridge + model path only. Prefer `npm run setup` for a fresh clone because it also seeds `.env`, provisions Piper runtime/voice, and validates env keys at the end.

### Run the full benchmark

```powershell
npm run test:bridge:windows
```

### Test a specific workflow run

```powershell
npm run download:bridge:windows -- --RunId <RUN_ID>
# or
npm run test:bridge:windows -- --DownloadArtifact --RunId <RUN_ID>
```

### Full app validation

```powershell
# Terminal 1 — native LiteRT C++ proxy
npm run dev:backend

# Terminal 2 — Electron app
npm run dev
```

Manual checklist:

- [ ] Plain text turn streams and completes
- [ ] Vision turn references captured screen content
- [ ] Follow-up turn is faster than the first turn (KV-cache reuse)
- [ ] Reopen / reconnect still works
- [ ] Optional Piper speech plays if configured

---

## Option C — Native Windows local bridge build

This is the backend-developer path. Default setup does not silently fall back to
Bazel/MSVC; pass `--source-build` when you intentionally want to rebuild the
bridge locally.

### Additional prerequisites

- Bazelisk: `winget install --id Bazel.Bazelisk -e`
- Visual Studio 2022 Build Tools with **Desktop development with C++**
- Java with `JAVA_HOME` set
- Developer PowerShell for VS 2022 or x64 Native Tools shell

Verify MSVC first:

```powershell
where.exe cl
cl
```

`where.exe cl` must resolve to `Hostx64\x64\cl.exe`.

Give Bazel a short output root in your LiteRT-LM checkout:

```powershell
cd C:\path\to\LiteRT-LM
New-Item -ItemType Directory -Force C:\b | Out-Null
if (-not (Select-String -Path .\.bazelrc -Pattern 'output_user_root' -Quiet)) {
  Add-Content .\.bazelrc "`nstartup --output_user_root=C:/b"
}
bazelisk shutdown
```

Then from the Delfin repo:

```powershell
npm run setup:litert-cpp -- --source-build
```

This setup flow now also bootstraps a repo-local pinned `piper-tts` runtime under `bin\piper\venv\` and installs/activates the default Piper voice unless you pass `--no-piper`.

After that, validate with the same two-terminal app check used above:

```powershell
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev
```

---

## Report your results

Useful artifacts to share:

- `Invoke-RestMethod http://localhost:8321/health`
- Latest benchmark JSON under `results\`
- Any proxy logs from:
  - `$env:TEMP\delfin-litert-cpp-proxy.log`
  - `$env:TEMP\delfin-litert-cpp-proxy.err.log`

---

## Troubleshooting

**`gh` is not recognized**

```powershell
winget install --id GitHub.cli -e
```

Then restart PowerShell and run `gh auth login`.

**Bridge DLL missing**

The native Windows runtime copy needs both `delfin_litert_bridge.exe` and `libGemmaModelConstraintProvider.dll` side-by-side in `bin\`.

**Smoke test times out waiting for `/health`**

Inspect:

```powershell
Get-Content $env:TEMP\delfin-litert-cpp-proxy.log
Get-Content $env:TEMP\delfin-litert-cpp-proxy.err.log
```

**Model download was interrupted**

The helper defaults to Python `huggingface_hub` when it is available on Windows. If that path is unavailable or fails, it falls back to Windows BITS and then to `curl.exe`. The fallback chain writes incomplete downloads to `models\<model>.part`, retries transient failures, and only renames the file after the expected byte count is reached. Rerun the command to resume the `.part` file, or delete the `.part` file first if you want a clean retry.

**`createSymbolicLinkW failed (permission denied)`**

Use Developer Mode or an Administrator VS Developer shell, keep `output_user_root=C:/b`, then rerun the native build.

**Electron cannot connect to the WSL2 sidecar**

Set `SIDECAR_URL=http://<WSL2-IP>:8321` on the Windows side.