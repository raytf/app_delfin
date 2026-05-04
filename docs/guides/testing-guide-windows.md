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
git clone https://github.com/raytf/app_delfin.git
cd app_delfin
npm install
npm run setup
npm run dev:sidecar
```

### Terminal 2 — Windows PowerShell (Electron)

```powershell
cd C:\path\to\app_delfin
npm install
npm run dev
```

If Windows cannot reach `localhost:8321`, find the WSL2 IP with `hostname -I` and set `SIDECAR_WS_URL=ws://<WSL2-IP>:8321/ws` in the Windows-side `.env`.

---

## Option B — Native Windows using the CI-built bridge artifact

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/downloads/)
- GitHub CLI: `winget install --id GitHub.cli -e`
- Restart PowerShell so `gh` is on `PATH`

### Authenticate GitHub CLI

```powershell
gh auth login
```

### Download and smoke-test the latest successful Windows artifact

```powershell
cd C:\path\to\app_delfin
npm install
npm run setup-check:windows
npm run download:ci-bridge:windows
npm run test:ci-bridge:windows -- --SkipBenchmark
```

What this does:

1. Downloads `delfin-litert-bridge-windows-x64` from the latest successful workflow run
2. Stages `delfin_litert_bridge.exe` and `libGemmaModelConstraintProvider.dll` into `bin\`
3. Ensures `.env` points `LITERT_CPP_BIN` and `LITERT_CPP_MODEL` at the expected paths
4. Downloads the `.litertlm` model if missing, preferring `curl.exe` for repeated retry/resume/progress attempts and using a temporary `.part` file
5. Starts `npm run dev:litert-cpp` and waits for `http://localhost:8321/health`

### Run the full benchmark

```powershell
npm run test:ci-bridge:windows
```

### Test a specific workflow run

```powershell
npm run download:ci-bridge:windows -- --RunId <RUN_ID>
# or
npm run test:ci-bridge:windows -- --DownloadArtifact --RunId <RUN_ID>
```

### Full app validation

```powershell
# Terminal 1 — native LiteRT C++ proxy
npm run dev:litert-cpp

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
npm run setup:litert-cpp -- --native-windows
```

After that, validate with the same two-terminal app check used above:

```powershell
# Terminal 1
npm run dev:litert-cpp

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

The helper writes incomplete downloads to `models\<model>.part`, retries transient `curl.exe` failures, and only renames the file after the expected byte count is reached. Rerun the command to resume the `.part` file, or delete the `.part` file first if you want a clean retry.

**`createSymbolicLinkW failed (permission denied)`**

Use Developer Mode or an Administrator VS Developer shell, keep `output_user_root=C:/b`, then rerun the native build.

**Electron cannot connect to the WSL2 sidecar**

Set `SIDECAR_WS_URL=ws://<WSL2-IP>:8321/ws` on the Windows side.