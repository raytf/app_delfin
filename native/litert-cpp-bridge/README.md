# LiteRT-LM C++ Bridge

This folder contains the Delfin-specific native bridge source for Track A of
`docs/features/native-windows-backend-research-spec.md`.

The upstream `litert_lm_main` target is a demo CLI. Delfin needs a long-lived
stdio process that speaks a tiny JSONL protocol to `scripts/litert-cpp-proxy.mjs`.

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

2. Copy `delfin_litert_bridge.cc` into `runtime/engine/` and merge the
   `BUILD.bazel` target into `runtime/engine/BUILD`, then build:

```powershell
bazelisk build //runtime/engine:delfin_litert_bridge --config=windows
```

3. Copy the resulting binary into Delfin's gitignored `bin/` directory and point
   `.env` at it:

```powershell
LITERT_CPP_BIN=./bin/delfin_litert_bridge.exe
LITERT_CPP_MODEL=./models/gemma-4-E2B-it.litertlm
```

Then run `npm run dev:litert-cpp` and `npm run benchmark:litert-cpp`.
