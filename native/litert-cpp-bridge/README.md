# LiteRT-LM C++ Bridge

This folder contains the Delfin-specific native bridge source for Track A of
`docs/features/native-windows-backend-research-spec.md`.

The upstream `litert_lm_main` target is a demo CLI. Delfin needs a long-lived
stdio process that speaks a tiny JSONL protocol to `scripts/litert-cpp-proxy.mjs`.

## Developer environment policy

`npm run setup:litert-cpp` is now artifact-first for supported runtime hosts:
Windows x64, macOS arm64, and Linux x64. It reuses existing bridge files or
downloads the matching CI workflow artifact via `gh`, then provisions the model,
Piper runtime/voice, and `.env`. Local Bazel source builds are reserved for
backend developers via `--source-build` or `--bridge-source build`.

| Host                 | Default `npm run setup:litert-cpp`                                  | Source build opt-in                              |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| Linux x64            | Existing bin → `delfin-litert-bridge-linux-x64` artifact → env + Piper + model | `--source-build`                                 |
| macOS arm64          | Existing bin → `delfin-litert-bridge-macos-arm64` artifact → env + Piper + model | `--source-build`                                 |
| Windows x64          | Existing bin → `delfin-litert-bridge-windows-x64` artifact → env + Piper + model | `--source-build` from VS Developer shell         |
| WSL2 (Linux x64)     | Same as Linux                                                       | `--source-build` inside WSL2                     |

## Default setup (Linux / macOS / WSL2)

On a clean Linux or macOS arm64 host (or a WSL2 Ubuntu distro on Windows),
install the artifact-first setup prerequisites:

```bash
# Ubuntu / WSL2
sudo apt update && sudo apt install -y git curl python3 python3-pip python3-venv
# Install GitHub CLI via https://github.com/cli/cli/blob/trunk/docs/install_linux.md
gh auth login

# macOS (arm64)
brew install node python@3.12 gh
gh auth login
```

Then from the Delfin checkout:

```bash
npm install
npm run setup:litert-cpp
```

The script downloads the matching CI-built bridge artifact into `bin/`, sets
`LITERT_CPP_BIN` / `LITERT_CPP_MODEL` in `.env`, bootstraps a repo-local pinned
`piper-tts` runtime under `bin/piper/venv`, installs/activates the default Piper
voice, and downloads or copies the `.litertlm` model.

Backend developers who need to rebuild the bridge locally should pass
`--source-build` and install the Bazel/toolchain prerequisites below. Pass
`--help` to see all options (`--source-build`, `--litert-lm-dir`,
`--skip-build`, `--no-piper`, `--no-model`, `--install-prereqs`, `--dry-run`, …).

### Two-terminal workflow (WSL2 + Windows host)

WSL2 forwards `localhost` between the Linux distro and the Windows host
automatically, so the bridge running inside WSL2 is reachable from Electron
running on Windows:

```text
WSL2 (Ubuntu)                            Windows host
─────────────────                        ─────────────────
$ npm run dev:backend                 $ npm run dev
  ├─ scripts/litert-cpp-proxy.mjs          ├─ Electron main
  ├─ bin/delfin_litert_bridge              ├─ Vite renderer
  └─ Piper TTS (Linux)                     └─ ws://localhost:8321 ──┐
        listening on ws://localhost:8321 ◄───────────────────────────┘
```

Notes:

- Keep the Delfin and LiteRT-LM checkouts under your WSL2 home (`~/...`), **not**
  under `/mnt/c/...` — Bazel under `/mnt/c` is unusably slow.
- The renderer-side concerns (screen capture, `@ricky0123/vad-web`, Web Speech
  fallback) stay on the Windows host. The bridge + proxy + Piper TTS run inside
  WSL2.

## Native Windows setup

Use this path when you need to run the native Windows backend locally. A fresh
clone can start with `npm run setup:litert-cpp`; only `--source-build` requires
**Developer PowerShell for VS 2022** or **x64 Native Tools Command Prompt for
VS 2022**.

Install these first:

- Git on PATH
- Bazelisk: `winget install --id Bazel.Bazelisk -e`
- Build Tools for Visual Studio 2022 (`winget install --id Microsoft.VisualStudio.2022.BuildTools -e`) with **Desktop development with C++**, including MSVC v143 and a Windows SDK
- Python 3.13, Java with `JAVA_HOME` set (per upstream LiteRT-LM Windows prereqs)

Verify the compiler before invoking Bazel:

```powershell
where.exe cl
cl
```

`where.exe cl` must resolve to `Hostx64\x64\cl.exe`. If it lists
`Hostx86\x86\cl.exe` instead, your shell is initialized for x86; reopen the
**x64 Native Tools** shell or run `Launch-VsDevShell.ps1 -Arch amd64 -HostArch amd64`.

A short Bazel output root avoids path-length and stale-cache issues. Bazel
also needs to extract upstream archives that contain symlinks — if Windows
denies symlink creation, enable Developer Mode or use an Administrator VS
Developer shell:

```powershell
cd C:\Users\<you>\projects\LiteRT-LM
New-Item -ItemType Directory -Force C:\b | Out-Null
if (-not (Select-String -Path .\.bazelrc -Pattern 'output_user_root' -Quiet)) {
  Add-Content .\.bazelrc "`nstartup --output_user_root=C:/b"
}
bazelisk shutdown
```

Then run the setup script with the backend-developer source-build flag:

```powershell
npm run setup:litert-cpp -- --source-build
```

Common failures:

- `createSymbolicLinkW failed (permission denied)`: use Developer Mode or an Administrator VS Developer shell, keep the short `C:/b` output root, then retry.
- `SET INCLUDE=msvc_not_found` or `vc_installation_error_x64.bat`: Bazel cannot find MSVC; install **Desktop development with C++**, reopen a VS Developer shell, and confirm `where.exe cl` resolves to `Hostx64\x64\cl.exe`. If needed, set `$env:BAZEL_VS = "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"` before rerunning setup.

---

## Current status — 2026-05-03

- Native Windows build of `delfin_litert_bridge.exe` is validated with Visual
  Studio 2022 17.14 / MSVC 14.44 (text, vision, and audio scenarios).
- App-facing runtime copy needs both `delfin_litert_bridge.exe` and
  `libGemmaModelConstraintProvider.dll` next to it in `bin/`.
- Text, vision, and audio turns stream successfully through `npm run dev:backend`.
- Vision + per-session KV-cache reuse + native audio input are all **built and
  runtime-validated** in the current `bin/delfin_litert_bridge.exe`:
  - `--vision_backend` flag, `JsonPreface`, `g_sessions` map, `reset_session`
  - `--audio_backend` flag (default `cpu`), session `SetAudioModalityEnabled`,
    and `MessageHasContentType` guard that returns a clear JSONL error when
    audio is sent but `--audio_backend=none`
- macOS and Linux native builds have not yet been attempted.

## JSONL protocol

Bridge startup output:

```json
{
  "type": "ready",
  "backend": "litert-cpp",
  "model": "D:\\models\\gemma.litertlm"
}
```

Proxy → bridge:

```json
{"type":"generate","requestId":"<uuid>","sessionId":"<uuid>","systemPrompt":"You are Delfin…","message":{"role":"user","content":[{"type":"image","blob":"<base64 JPEG>"},{"type":"audio","blob":"<base64 WAV>"},{"type":"text","text":"Explain this slide"}]}}
{"type":"interrupt","requestId":"<uuid>"}
{"type":"reset_session","sessionId":"<uuid>"}
```

`sessionId` is generated by the proxy once per WebSocket connection. The first
`generate` for a new `sessionId` creates a fresh `Conversation` (with the
provided `systemPrompt` packed into the `JsonPreface`); subsequent turns reuse
that `Conversation` so the KV-cache survives across turns. The proxy issues
`reset_session` when the WebSocket closes.

Bridge → proxy:

```json
{"type":"token","requestId":"<uuid>","text":"..."}
{"type":"done","requestId":"<uuid>","text":"full response","message":{"role":"model","content":[{"type":"text","text":"full response"}]}}
{"type":"error","requestId":"<uuid>","message":"..."}
```

## Build inside LiteRT-LM (manual)

`npm run setup:litert-cpp -- --source-build` does all of the steps below; this
section is only useful when iterating on `delfin_litert_bridge.cc` against a
pre-existing LiteRT-LM checkout.

1. Clone and prepare the upstream tree.

   Linux / macOS / WSL2:

   ```bash
   git clone https://github.com/google-ai-edge/LiteRT-LM.git
   cd LiteRT-LM
   bazelisk build //runtime/engine:litert_lm_main
   ```

   Native Windows (Developer PowerShell for VS 2022):

   ```powershell
   git clone https://github.com/google-ai-edge/LiteRT-LM.git
   cd LiteRT-LM
   New-Item -ItemType Directory -Force C:\b | Out-Null
   if (-not (Select-String -Path .\.bazelrc -Pattern 'output_user_root' -Quiet)) {
     Add-Content .\.bazelrc "`nstartup --output_user_root=C:/b"
   }
   bazelisk build //runtime/engine:litert_lm_main --config=windows
   ```

2. From the Delfin repo, run the helper against that checkout. It copies
   `delfin_litert_bridge.cc`, merges the `BUILD.bazel` target, builds, and
   copies the resulting executable into Delfin's gitignored `bin/` directory:

   ```bash
   npm run bridge:build -- -- --litert-lm-dir <path>/LiteRT-LM
   ```

   The helper applies `--config=windows` automatically when invoked from
   native Windows; on Linux/macOS it uses Bazel's auto-detected toolchain.

> **Windows output-root workaround.** If Bazel still uses
> `C:\Users\<you>\_bazel_<you>\...`, add the startup option to
> `LiteRT-LM\.bazelrc` and restart Bazel:
>
> ```powershell
> cd D:\path\to\LiteRT-LM
> New-Item -ItemType Directory -Force D:\b | Out-Null
> if (-not (Select-String -Path .\.bazelrc -Pattern 'output_user_root' -Quiet)) {
>   Add-Content .\.bazelrc "`nstartup --output_user_root=D:/b"
> }
> bazelisk shutdown
> ```
>
> A shorter root (for example `C:\b` or `D:\b`) keeps generated paths under
> Windows path limits and avoids reusing old failed extraction state.

Use `node scripts/build-litert-cpp-bridge.mjs --plan --litert-lm-dir <path>` for a dry-run plan without invoking Bazel.

3. Point `.env` at the built bridge and model:

   ```ini
   # Linux / macOS / WSL2
   LITERT_CPP_BIN=./bin/delfin_litert_bridge
   # Native Windows
   LITERT_CPP_BIN=./bin/delfin_litert_bridge.exe

   LITERT_CPP_MODEL=./models/gemma-4-E2B-it.litertlm
   ```

Then run `npm run dev:backend` and `npm run benchmark:litert-cpp`.

After rebuilding from post-`570d2fa` source, run the full benchmark sweep
(including S2 vision) to validate the vision + KV-cache changes:

```bash
node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios 's1,s2,s3'
```
