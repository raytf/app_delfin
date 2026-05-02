# LiteRT-LM C++ Bridge

This folder contains the Delfin-specific native bridge source for Track A of
`docs/features/native-windows-backend-research-spec.md`.

The upstream `litert_lm_main` target is a demo CLI. Delfin needs a long-lived
stdio process that speaks a tiny JSONL protocol to `scripts/litert-cpp-proxy.mjs`.

## Current status — 2026-05-02

- Native Windows build is validated with Visual Studio 2022 17.14 / MSVC 14.44.
- App-facing runtime copy needs both `delfin_litert_bridge.exe` and
  `libGemmaModelConstraintProvider.dll` next to it in `bin/`.
- Text turns stream successfully through `npm run dev:litert-cpp`.
- Vision is the next high-priority gap: the bridge currently accepts JSON
  message arrays but does not yet convert `{ "type": "image", "blob": "..." }`
  content parts into LiteRT-LM C++ image inputs.

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
{"type":"generate","requestId":"uuid","messages":[{"role":"user","content":[{"type":"text","text":"Explain this"}]}]}
{"type":"interrupt","requestId":"uuid"}
```

Bridge → proxy:

```json
{"type":"token","requestId":"uuid","text":"..."}
{"type":"done","requestId":"uuid","text":"full response","message":{"role":"model","content":[{"type":"text","text":"full response"}]}}
{"type":"error","requestId":"uuid","message":"..."}
```

## Build inside LiteRT-LM

1. Clone and prepare the upstream tree:

```powershell
git clone https://github.com/google-ai-edge/LiteRT-LM.git
cd LiteRT-LM
bazelisk build //runtime/engine:litert_lm_main --config=windows
```

2. From the Delfin repo, run the helper against that checkout. It copies
   `delfin_litert_bridge.cc`, merges the `BUILD.bazel` target, builds, and
   copies the resulting executable into Delfin's gitignored `bin/` directory:

```powershell
npm run build:litert-cpp-bridge -- -- --litert-lm-dir D:\path\to\LiteRT-LM
```

Use `node scripts/build-litert-cpp-bridge.mjs --plan --litert-lm-dir <path>` for a dry-run plan without invoking Bazel.

3. Point `.env` at the built bridge and model:

```powershell
LITERT_CPP_BIN=./bin/delfin_litert_bridge.exe
LITERT_CPP_MODEL=./models/gemma-4-E2B-it.litertlm
```

Then run `npm run dev:litert-cpp` and `npm run benchmark:litert-cpp`.

Until vision support lands, benchmark text scenarios only:

```powershell
node scripts/run-benchmark.mjs --backend litert-cpp --runs 5 --scenarios 's1,s3'
```
