# LiteRT-LM C++ Bridge

This folder contains the Delfin-specific native bridge source for Track A of
`docs/features/native-windows-backend-research-spec.md`.

The upstream `litert_lm_main` target is a demo CLI. Delfin needs a long-lived
stdio process that speaks a tiny JSONL protocol to `scripts/litert-cpp-proxy.mjs`.

## Developer environment policy

The default developer environment is **Linux / macOS (arm64) / WSL2**. Native
Windows local builds are still supported via the `--native-windows` opt-in flag
on `npm run setup:litert-cpp`; CI also produces native Windows binaries (see
`docs/features/distribution/distribution-cicd-spec.md`).

| Host                 | Default `npm run setup:litert-cpp`                                  | With `--native-windows`                          |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| Linux                | Clone + Bazel build + env + Piper + model                           | Errors: flag not valid off Windows               |
| macOS (arm64)        | Clone + Bazel build + env + Piper + model                           | Errors: flag not valid off Windows               |
| Windows (PowerShell) | Prints WSL2 setup instructions and exits 0                          | Runs the native Bazel + MSVC flow                |
| WSL2 (Linux)         | Same as Linux                                                       | (n/a — `process.platform` is `linux`)            |

## Default developer setup (Linux / macOS / WSL2)

On a clean Linux or macOS arm64 host (or a WSL2 Ubuntu distro on Windows),
install the prereqs that match upstream LiteRT-LM:

```bash
# Ubuntu / WSL2
sudo apt update && sudo apt install -y git git-lfs build-essential clang \
  python3 python3-pip default-jdk
mkdir -p ~/.local/bin
curl -L -o ~/.local/bin/bazelisk \
  https://github.com/bazelbuild/bazelisk/releases/latest/download/bazelisk-linux-amd64
chmod +x ~/.local/bin/bazelisk
export PATH="$HOME/.local/bin:$PATH"

# macOS (arm64)
xcode-select --install                # provides clang
brew install bazelisk git-lfs
```

Then from the Delfin checkout:

```bash
npm install
npm run setup:litert-cpp
```

The script clones `google-ai-edge/LiteRT-LM` into `<parent>/LiteRT-LM`, runs
`bazelisk build //runtime/engine:delfin_litert_bridge`, copies the resulting
`delfin_litert_bridge` binary into `bin/`, sets `LITERT_CPP_BIN` /
`LITERT_CPP_MODEL` in `.env`, installs the default Piper voice, and downloads
or copies the `.litertlm` model.

Pass `--help` to see all options (`--litert-lm-dir`, `--skip-build`,
`--no-piper`, `--no-model`, `--install-prereqs`, `--dry-run`, …).

### Two-terminal workflow (WSL2 + Windows host)

WSL2 forwards `localhost` between the Linux distro and the Windows host
automatically, so the bridge running inside WSL2 is reachable from Electron
running on Windows:

```text
WSL2 (Ubuntu)                            Windows host
─────────────────                        ─────────────────
$ npm run dev:litert-cpp                 $ npm run dev
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

## Native Windows opt-in (`--native-windows`)

Use this path when you need to produce or test a native Windows `.exe` locally
without going through CI. Run it from **Developer PowerShell for VS 2022** or
**x64 Native Tools Command Prompt for VS 2022**.

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

Then run the setup script with the opt-in flag:

```powershell
npm run setup:litert-cpp -- --native-windows
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
- Text, vision, and audio turns stream successfully through `npm run dev:litert-cpp`.
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

`npm run setup:litert-cpp` already does all of the steps below; this section
is only useful when iterating on `delfin_litert_bridge.cc` against a
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
   npm run build:litert-cpp-bridge -- -- --litert-lm-dir <path>/LiteRT-LM
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

Then run `npm run dev:litert-cpp` and `npm run benchmark:litert-cpp`.

After rebuilding from post-`570d2fa` source, run the full benchmark sweep
(including S2 vision) to validate the vision + KV-cache changes:

```bash
node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios 's1,s2,s3'
```
