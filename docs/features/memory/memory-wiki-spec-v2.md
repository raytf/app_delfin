# Memory System (LLM Wiki) — v2

> Gate 1 — awaiting approval. Supersedes [`memory-wiki-spec.md`](memory-wiki-spec.md) (v1, Python-sidecar-based). Carries the same product goal (a persistent on-device knowledge base that compounds across sessions and is queried at runtime by Gemma 4) but rebuilds the architecture on the Node.js proxy + C++ bridge stack.

## Gate Resolution

| Field          | Value                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Gate 1 — awaiting approval                                                                                                                                                                                                                     |
| **Created**    | 2026-05-12                                                                                                                                                                                                                                     |
| **Supersedes** | [`memory-wiki-spec.md`](memory-wiki-spec.md) (Python-sidecar architecture)                                                                                                                                                                     |
| **Depends on** | LiteRT-LM v0.11.0 (`EnableConstrainedDecoding` + `LlGuidanceConfig` already in the upstream C++ API); `litert-cpp-proxy.mjs` (already the application layer); existing session persistence (`fileSessionStorage.ts`, `recordUserPrompt`, etc.) |
| **Parent**     | None — this is a stand-alone feature area                                                                                                                                                                                                      |

---

## Goal

Give Delfin a persistent, compounding, **fully on-device** memory of the user's sessions that future user turns can reference automatically — so a question paraphrased weeks after the original session lands on the right prior context without any user effort. Knowledge is stored as user-editable markdown plus a derived SQLite index; retrieval is dense (EmbeddingGemma); references are seamless (no inline citations in the assistant's text).

**Scope rule**: V1 ingests stored Delfin sessions only. Uploaded files, web links, and multimodal sources are specced in §V2 / §V3 but not implemented in V1.

---

## Background — why a v2

The original [`memory-wiki-spec.md`](memory-wiki-spec.md) was written when the Python FastAPI sidecar was the primary runtime. It lives under `sidecar/memory/`, mounts a FastAPI sub-router at `/memory/*`, defines Pydantic schemas, and assumes the LLM engine reference is passed directly into the memory module from `sidecar/server.py`.

Since then the runtime has changed:

- The Python sidecar is **deprecated** (developer reference only).
- The primary stack is `scripts/litert-cpp-proxy.mjs` (Node WebSocket proxy + application layer) talking JSONL/stdio to `native/litert-cpp-bridge/delfin_litert_bridge` (thin C++ inference kernel).
- LiteRT-LM v0.11.0 exposes both **tool calling** and **grammar-constrained JSON decoding** in its C++ API (`ConversationConfig::EnableConstrainedDecoding` + `ConstraintProviderConfig` with `LlgConstraintType::kJson|kRegex|kLark`). Today's `delfin_litert_bridge` does not surface these knobs, but adding them is plumbing — see §Bridge protocol extension.

Research findings that drove the architectural choices in this spec are summarized inline in the relevant sections. The headline ones:

- **Gemma 4 E2B's unconstrained structured-output failure rate is 6–9 %** (Google's own LiteRT-LM field telemetry, issue #2202). With LiteRT-LM grammar-constrained JSON decoding it should be near-zero.
- **EmbeddingGemma (308M, MTEB Eng v2 retrieval = 69.67)** is the current 2025 quality leader sub-500M and pairs naturally with the Gemma 4 stack.
- **Production personal-RAG products converge on raw-chunks + vector retrieval** (Reor, Smart Connections); Khoj does hybrid + reranker. Almost no shipping local app summarises chunks at ingest. We deviate from the common path **only** at the session-summary layer — see §Storage model.

---

## Validated technical decisions for this spec

The four design forks that this spec implements (confirmed by user 2026-05-12):

| Decision | Choice | Rationale |
| --- | --- | --- |
| **Storage model** | Hybrid: raw turn-level chunks **and** one LLM-written summary page per session | Best for a student-learning-concepts workload — chunks preserve verbatim ("what did that slide say?"), the summary gives the gestalt ("explain backpropagation again"). Common-case retrieval hits the summary; specific-fact retrieval hits a chunk. |
| **Retrieval** | Dense-only at V1 (EmbeddingGemma + sqlite-vec); hybrid BM25 + dense via RRF as a V1.5 fast-follow; cross-encoder reranker deferred to V3 | Practitioner guidance for small personal corpora (Superlinked/VectorHub): "start dense-only, add BM25 if you see failures on entity/keyword queries." |
| **Sources** | V1 = stored Delfin sessions only. V2 = + uploaded PDFs/MD/TXT and web links. V3 = + vision and audio. | Smallest scope that ships a measurable feature. |
| **Citations** | Seamless — no inline citations in the assistant's text. Below each assistant message render a collapsed "Sources used (N)" strip showing which pages/chunks were injected. Power users open the markdown directly. | User explicitly requested seamless. The "Sources used" strip is the one new UI element in V1. |

Local-only: **no cloud ingest backend**. Every LLM call routes through the existing bridge.

Embedding model: **EmbeddingGemma (308 MB on disk, ~200 MB resident)** is the default. Fallback to `bge-small-en-v1.5` (130 MB) is allowed but not the default.

---

## Scope

| File                                                                                                | Change                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native/litert-cpp-bridge/delfin_litert_bridge.cc`                                                  | Add optional `decodingConstraint` field on `generate` JSONL request. When present, call `EnableConstrainedDecoding(true)` + build a `ConstraintProviderConfig` with the supplied JSON schema or grammar. |
| `native/litert-cpp-bridge/README.md`                                                                | Document the new `decodingConstraint` request field.                                                                                                                                                |
| `scripts/litert-cpp-proxy.mjs`                                                                      | Mount memory HTTP routes on the existing port-8321 server. On session end (signalled via a new control message from Electron main), enqueue an ingest job. Inject retrieval context into every user turn's system prompt. Forward `memory:progress` events over the existing WebSocket. |
| `scripts/memory/` (new directory)                                                                   | All ingest / retrieval / file I/O logic — see §Module layout.                                                                                                                                       |
| `scripts/memory/*.test.mjs`                                                                          | Vitest coverage for every module (frontmatter round-trip, index upsert, retrieval top-k, ingest schema validation, log append, fixture-wiki retrieval). |
| `src/shared/memoryTypes.ts` (new)                                                                    | TypeScript types for all memory IPC payloads.                                                                                                                                                       |
| `src/shared/memorySchemas.ts` (new)                                                                  | Zod schemas mirroring the types; used in IPC handler validation.                                                                                                                                    |
| `src/main/memory/memoryClient.ts` (new)                                                              | Thin HTTP client wrapping `fetch()` calls to the proxy's `/memory/*` endpoints.                                                                                                                     |
| `src/main/memory/ingestQueue.ts` (new)                                                               | Tracks active ingest jobs; receives `WsMemoryProgress` from `wsClient.ts`; forwards to renderer via `memory:progress`.                                                                              |
| `src/main/ipc/memoryHandlers.ts` (new)                                                               | Registers `memory:*` IPC channels.                                                                                                                                                                  |
| `src/main/ipc/sessionHandlers.ts`                                                                    | After session persistence completes, if `MEMORY_AUTO_INGEST=true`, send the new control message to the proxy.                                                                                       |
| `src/main/index.ts`                                                                                  | Register memory IPC handlers; ensure `MEMORY_DIR` exists at startup.                                                                                                                                |
| `src/preload/index.ts`                                                                               | Extend `contextBridge.exposeInMainWorld` with a `memory` namespace.                                                                                                                                  |
| `src/renderer/components/SessionEndedToast.tsx` (new)                                                | Small auto-dismissing strip on the home screen rendering "Memory updated (N sources, M chunks)" when the most recent ingest completes.                                                              |
| `src/renderer/components/AssistantMessage.tsx` (modified) or wherever assistant messages render      | Append a collapsed "Sources used (N) ▾" strip below each assistant message when retrieval contributed to the turn.                                                                                  |
| `src/renderer/stores/memoryStore.ts` (new)                                                           | Zustand store: `ingestJobs[]`, `lastSourcesUsed[messageId]`, progress listener registration.                                                                                                        |
| `.env.example`                                                                                       | New `MEMORY_*` variables — see §Environment.                                                                                                                                                        |
| `docs/SPEC.md`                                                                                       | Add new IPC channels to the IPC table; add a `WsMemoryProgress` block to the WebSocket protocol section; add `MEMORY_*` to the env vars block; add a one-sentence pointer to this spec under Active Work Map. |
| `STATUS.md`                                                                                          | Add Memory rows; mark old `memory-wiki-spec.md` ✅ archived.                                                                                                                                          |
| `docs/README.md`                                                                                     | Update Memory area to list this spec as 🚧 In Progress, mark the v1 spec 📦 Archived.                                                                                                                |

### Out of scope (V1)

- File uploads (PDF, MD, TXT) — V2.
- Web link ingest — V2.
- Vision captioning of arbitrary screenshots beyond the per-turn screenshot — V3 expansion.
- Audio transcription — V3.
- BM25 / hybrid retrieval — V1.5 fast-follow.
- Cross-encoder reranking — V3.
- Lint pass (orphans, broken links, contradictions) — V3, descoped from the original spec.
- Cloud ingest backend — explicitly rejected (local-only).
- MemoryView overlay (third overlay mode for browsing the wiki in-app) — V2.
- File-watcher on `MEMORY_DIR` for external markdown edits — V3.
- "Ask my notes" retrieval-only command palette — V3.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Renderer                                                             │
│   • SessionEndedToast — "Memory updated (1 source, 8 chunks)"        │
│   • "Sources used (N) ▾" strip below assistant messages              │
│   • memoryStore (Zustand) — ingestJobs + lastSourcesUsed             │
└───────────────────┬──────────────────────────────────────────────────┘
                    │ IPC: memory:*, memory:progress
┌───────────────────▼──────────────────────────────────────────────────┐
│ Electron Main                                                        │
│   • memoryHandlers.ts   — IPC handlers, validate w/ Zod              │
│   • memoryClient.ts     — HTTP client → proxy /memory/*              │
│   • ingestQueue.ts      — receives WsMemoryProgress from wsClient    │
│   • sessionHandlers.ts  — on session end, signal proxy to ingest     │
└───────────────────┬──────────────────────────────────────────────────┘
                    │ HTTP /memory/* + WS memory_progress on :8321
┌───────────────────▼──────────────────────────────────────────────────┐
│ scripts/litert-cpp-proxy.mjs                                         │
│   scripts/memory/                                                    │
│     ├── store.mjs       — atomic markdown read/write                 │
│     ├── index.mjs       — sqlite FTS5 + sqlite-vec                   │
│     ├── embed.mjs       — onnxruntime-node + EmbeddingGemma          │
│     ├── ingest.mjs      — caption + summary + chunk pipeline         │
│     ├── ingestLlm.mjs   — bridge generate w/ grammar constraints     │
│     ├── retrieve.mjs    — dense top-k → context block builder        │
│     ├── memoryRouter.mjs — HTTP endpoints                            │
│     ├── schemas.mjs     — Zod schemas                                │
│     └── logbook.mjs     — append-only log.md                         │
│                                                                      │
│   On every inbound user turn: retrieve.mjs builds a context block    │
│   that is prepended to the system prompt before forwarding to bridge.│
└───────────────────┬──────────────────────────────────────────────────┘
                    │ JSONL stdio — generate (+ decodingConstraint)
┌───────────────────▼──────────────────────────────────────────────────┐
│ native/litert-cpp-bridge/delfin_litert_bridge                        │
│   • NEW: handles decodingConstraint on generate requests             │
│   LiteRT-LM 0.11.0 → Gemma 4 E2B/E4B                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Directory layout

Everything user-visible lives under `MEMORY_DIR` (default `~/.delfin/memory/`):

```text
~/.delfin/memory/
├── AGENTS.md                ← schema/conventions (seeded once, user-editable)
├── wiki/
│   ├── index.md             ← human-readable catalogue (every page, one-line summary, tags)
│   ├── log.md               ← append-only op log
│   ├── sources/             ← one summary page per ingested session/file/url
│   │   └── 2026-05-12-photosynthesis-lecture.md
│   └── assets/              ← symlinks to session capture thumbnails (no copies)
├── index.db                 ← SQLite: page metadata + FTS5 + sqlite-vec embeddings
└── state/
    ├── ingest-queue.jsonl   ← pending / active / done ingest jobs (survives restarts)
    └── version.txt          ← schema version, used for migrations
```

### Schema (markdown frontmatter)

Every page under `wiki/` has YAML frontmatter:

```yaml
---
id: 2026-05-12-photosynthesis-lecture
kind: source
title: "Photosynthesis — Lecture 14"
created: 2026-05-12T19:33:00Z
updated: 2026-05-12T19:33:00Z
source_kind: session       # session | file | url (V2+) | image | audio (V3+)
source_ids: ["sess_abc123"]
tags: ["biology", "photosynthesis", "Calvin cycle"]
chunk_count: 8
---
```

### SQLite (`index.db`) tables

```sql
CREATE TABLE pages (
  id TEXT PRIMARY KEY,                -- matches frontmatter id
  path TEXT NOT NULL UNIQUE,          -- relative to MEMORY_DIR/wiki
  kind TEXT NOT NULL,                 -- 'source'
  title TEXT NOT NULL,
  tags TEXT,                          -- JSON array
  source_kind TEXT NOT NULL,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);

CREATE VIRTUAL TABLE pages_fts USING fts5(
  title, tags, body, content='', tokenize='porter'
);                                     -- V1.5 uses this for BM25; populated at v1

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id TEXT NOT NULL REFERENCES pages(id),
  idx INTEGER NOT NULL,               -- ordinal within page
  text TEXT NOT NULL,
  meta TEXT                           -- JSON: {turn_id, capture_path, ...}
);

CREATE VIRTUAL TABLE chunks_vec USING vec0(
  embedding float[768]                -- EmbeddingGemma output dim
);

-- chunks.rowid == chunks_vec.rowid (1:1 correspondence enforced at insert)
```

### Soft Obsidian compatibility (carried over from v1)

- Wikilinks: `[[Page Title]]`
- Markdown is plain, no Dataview / Obsidian-only callouts
- Frontmatter keys match the v1 spec

---

## Environment variables

Additions to `.env.example`:

```env
# === Memory ===
MEMORY_ENABLED=true                # master switch
MEMORY_DIR=                        # default: $HOME/.delfin/memory
MEMORY_AUTO_INGEST=true            # ingest after session end automatically
MEMORY_INGEST_CONCURRENCY=1        # bridge cannot share the engine — keep 1
MEMORY_MAX_PAGE_BYTES=32768        # max size of any single model-written page
MEMORY_LLM_RETRIES=2               # JSON-schema retry budget per ingest step
MEMORY_SEARCH_LIMIT=10             # max results per /memory/search call
MEMORY_RETRIEVAL_K_CHUNKS=3        # how many chunks injected into user turns
MEMORY_RETRIEVAL_K_SUMMARIES=1     # how many summary pages injected
MEMORY_EMBED_MODEL=embeddinggemma  # embeddinggemma | bge-small
MEMORY_EMBED_DIM=768               # must match the active embed model
```

---

## Bridge protocol extension

Today's JSONL request:

```json
{"type":"generate","requestId":"…","sessionId":"…","systemPrompt":"…","message":{…}}
```

Add **one optional field** for ingest LLM calls:

```json
{"type":"generate","requestId":"…","sessionId":"…","systemPrompt":"…","message":{…},
 "decodingConstraint":{"type":"json_schema","schema":{ /* JSON Schema 2020-12 */ }}}
```

Bridge behavior:

- If `decodingConstraint` is present, before generation: call `EnableConstrainedDecoding(true)` and build a `ConstraintProviderConfig` with `LlgConstraintType::kJson` (for `"type":"json_schema"`), `kRegex` (`"type":"regex","pattern":"…"`), or `kLark` (`"type":"lark","grammar":"…"`). Pass via `OptionalArgs.decoding_constraint`.
- If absent, behavior unchanged (today's text streaming).
- If the bridge cannot honor a constraint (e.g. malformed schema), it emits `{"type":"error","requestId":"…","message":"invalid decodingConstraint: …"}` and aborts the request — never falls back to unconstrained generation silently.

User turns from the renderer **never** carry `decodingConstraint`. Only ingest LLM calls issued by `scripts/memory/ingestLlm.mjs` use it.

---

## HTTP endpoints (mounted on existing port 8321)

The proxy's existing HTTP server (currently only serves `/health`) gains a `/memory/*` mount. JSON request/response throughout.

| Method | Path                              | Description                                                                                          |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET`  | `/memory/health`                  | `{ enabled, wikiExists, pageCount, lastIngest, embedModel, embedDim }`                                |
| `GET`  | `/memory/index`                   | `{ pages: WikiPageSummary[] }`                                                                       |
| `GET`  | `/memory/page?path=…`             | `{ path, frontmatter, body, backlinks[] }`                                                           |
| `GET`  | `/memory/search?q=…&limit=…`      | `{ results: WikiSearchResult[] }` — dense top-k at V1                                                |
| `GET`  | `/memory/log?limit=…`             | `{ entries: LogEntry[] }`                                                                            |
| `GET`  | `/memory/ingest/jobs`             | `{ jobs: IngestJob[] }`                                                                              |
| `POST` | `/memory/ingest/session`          | `{ sessionId }` → `{ jobId }`                                                                        |
| `POST` | `/memory/ingest/<jobId>/cancel`   | → `{ ok: true }`                                                                                      |
| `POST` | `/memory/control/session-ended`   | Internal — called by Electron main on session stop. Body: `{ sessionId, autoIngest: boolean }`. If `autoIngest`, the proxy enqueues an ingest job. |

Progress events for in-flight ingest jobs are pushed over the **existing WebSocket connection** as a new inbound message type `WsMemoryProgress` — see next section. This avoids a second WS / SSE channel.

---

## WebSocket protocol — one new message type

Addition to the existing `WsInboundMessage` union (proxy → Electron):

```typescript
interface WsMemoryProgress {
  type: 'memory_progress'
  jobId: string
  op: 'ingest' | 'retrieve'           // 'retrieve' reserved for V3 long-running queries
  phase: 'queued' | 'caption' | 'summarize' | 'embed' | 'index' | 'done' | 'error'
  subject?: string                    // e.g. "sessions/sess_abc123"
  pct?: number                        // 0..1
  message?: string                    // error detail or status note
}
```

No changes to existing `token` / `audio_*` / `done` / `error` shapes.

Per-turn retrieval (which runs synchronously inside the user-turn handler) does **not** emit `memory_progress` events — it's millisecond-scale; only ingest does.

---

## IPC channels (additions to SPEC.md §IPC Channels)

| Direction | Channel                       | Payload                                                                                                                              |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| R→M       | `memory:list`                 | —                                                                                                                                    |
| R→M       | `memory:get-page`             | `{ path: string }`                                                                                                                   |
| R→M       | `memory:search`               | `{ query: string, limit?: number }`                                                                                                  |
| R→M       | `memory:get-log`              | `{ limit?: number }`                                                                                                                 |
| R→M       | `memory:get-health`           | —                                                                                                                                    |
| R→M       | `memory:ingest-session`       | `{ sessionId: string }` (manual trigger; auto-ingest does not go through IPC)                                                        |
| R→M       | `memory:cancel-ingest`        | `{ jobId: string }`                                                                                                                  |
| R→M       | `memory:get-sources-for-message` | `{ messageId: string }` — returns the chunks/pages injected for that assistant turn (drives the "Sources used" strip)              |
| M→R       | `memory:progress`             | `WsMemoryProgress`                                                                                                                   |
| M→R       | `memory:index-changed`        | — (fires after each successful ingest so renderer can refresh `lastIngest`)                                                          |
| M→R       | `memory:error`                | `{ message: string }`                                                                                                                |

---

## Module layout — `scripts/memory/`

Every module is plain ES modules (`*.mjs`). Each is unit-tested with Vitest under `scripts/memory/<name>.test.mjs`.

### `store.mjs`

Low-level markdown I/O. No LLM, no DB. Atomic writes (`.tmp` + `rename`).

```javascript
export async function readPage(path)                   // → { frontmatter, body }
export async function writePage(path, frontmatter, body)
export async function listPages(wikiDir)               // → string[] paths (excludes index.md/log.md)
export function pageSlug(title)                        // → safe filename
```

### `index.mjs`

SQLite via `better-sqlite3`. Owns the `pages`, `pages_fts`, `chunks`, `chunks_vec` tables. Deterministic — never calls the LLM.

```javascript
export function openIndex(memoryDir)                   // → SqliteIndex
export class SqliteIndex {
  upsertPage(page)
  insertChunks(pageId, chunks)                         // chunks: [{ idx, text, embedding, meta }]
  searchDense(queryEmbedding, k)                       // → ChunkHit[]
  searchFts(query, k)                                  // → ChunkHit[]  (V1.5+)
  getPage(id)
  getPageByPath(path)
  listPages()
  deletePage(id)                                       // for re-ingest idempotency
  close()
}
```

### `embed.mjs`

Loads EmbeddingGemma (ONNX) via `onnxruntime-node` once at proxy startup. Pooled across the process.

```javascript
export async function loadEmbedder({ model, dim })     // → Embedder
export class Embedder {
  embed(texts)                                         // → Float32Array[] (batch supported)
  dim                                                  // 768 for EmbeddingGemma
}
```

Model files live under `models/embedding/embeddinggemma/`. Downloaded on first run by `setup-litert-cpp.mjs` (added to its model-provisioning step) or by `modelHandlers.ts` first-run download flow.

### `ingestLlm.mjs`

Wraps bridge `generate` calls with grammar-constrained decoding. Routes through the same JSONL/stdio bridge child the proxy already manages, but on a **dedicated ingest `sessionId`** so the user's active conversation KV-cache is unaffected.

```javascript
export async function generateConstrained({ systemPrompt, userText, schema, retries }) {
  // 1. Send {type:'generate', sessionId:'ingest_<rand>', systemPrompt, message:{...},
  //          decodingConstraint:{type:'json_schema', schema}}
  // 2. Accumulate streamed tokens
  // 3. Parse JSON, validate with Zod schema (mirror of the JSON schema)
  // 4. On parse/validate failure: send error feedback in a retry, up to MEMORY_LLM_RETRIES
  // 5. On exhaustion: throw IngestStepError (no partial writes)
}
```

A **concurrency guard** (module-level `Mutex`) serialises ingest calls so they yield to active user turns. The mutex acquires per ingest step; if a user-turn `generate` is in flight on the bridge, the ingest step waits. Implementation: an awaitable `Promise` queue with a fairness check — if `proxy.hasInFlightUserTurn()` is true at the head of an ingest step, the queue waits one more `generate` cycle.

### `ingest.mjs`

The ingest pipeline. Two public entry points; V1 implements only `ingestSession`.

```javascript
export async function ingestSession(sessionId, { progressCb }) {
  // 1. Load transcript + capture paths from existing session storage
  // 2. For each turn:
  //      caption = generateConstrained(CAPTION_SCHEMA, /* prompt with screenshot */)
  //      Build chunkText = `${user_text}\n\nDelfin: ${assistant_text}\n\nOn screen: ${caption}`
  // 3. summary = generateConstrained(SUMMARY_SCHEMA, /* full transcript */)
  // 4. writePage('wiki/sources/<slug>.md', { ...summary frontmatter, body: summary.body })
  // 5. For each chunk + the summary body: embedder.embed(text) → Float32Array
  // 6. index.upsertPage(page); index.insertChunks(pageId, chunks)
  // 7. logbook.append('ingest', subject=path, detail=`${chunkCount} chunks, ${captionCount} captions`)
  // 8. emit memory_progress {phase:'done'}
}
// V2+:
export async function ingestFile(filePath, kind, { progressCb })
export async function ingestUrl(url, { progressCb })
```

Progress phases for sessions: `queued → caption → summarize → embed → index → done` (or `error`).

**Idempotency**: re-ingesting a session deletes the existing page first via `index.deletePage(id)`, then re-runs. The markdown file is overwritten by `writePage` (atomic). No partial state if interrupted mid-run (the LLM step writes nothing until validation succeeds; the `index.upsertPage` + `insertChunks` happen in a single SQLite transaction).

### Constrained-decoding schemas

Defined in `scripts/memory/schemas.mjs` (Zod) plus their JSON Schema mirrors passed to the bridge. V1 needs two:

```javascript
export const CaptionSchema = z.object({
  description: z.string().max(500),     // 1–2 sentences describing the screenshot
  topics: z.array(z.string()).max(8),   // 1-word topical keywords
})

export const SummarySchema = z.object({
  title: z.string().max(140),
  tags: z.array(z.string()).max(12),
  summary: z.string().max(2000),         // 200–400 words, markdown ok
})
```

(The original spec's `EntityExtraction` / `EntityUpdateProposal` / `ConceptUpdateProposal` are **removed** — the hybrid raw-chunks + summary model doesn't need them. Entity- and concept-level structure emerges from tags + summary text. This is a deliberate scope cut driven by the cost analysis in §Background — ingest goes from ~7 LLM calls per session down to ~1 summary + ~N captions.)

### `retrieve.mjs`

Dense top-k retrieval. Called synchronously from the proxy's user-turn handler before forwarding the turn to the bridge.

```javascript
export async function buildContextBlock(userText, { embedder, index }) {
  if (!userText.trim()) return null
  const queryEmbedding = await embedder.embed([userText])[0]

  const summaryHits = index.searchDense(queryEmbedding, MEMORY_RETRIEVAL_K_SUMMARIES, { kindFilter: 'summary' })
  const chunkHits   = index.searchDense(queryEmbedding, MEMORY_RETRIEVAL_K_CHUNKS, { kindFilter: 'chunk' })

  if (summaryHits.length === 0 && chunkHits.length === 0) return null

  return {
    block: formatContextBlock(summaryHits, chunkHits),
    sources: [...summaryHits, ...chunkHits].map(h => ({ pageId: h.pageId, path: h.path, chunkIdx: h.idx })),
  }
}
```

The `block` is a single string prepended to the system prompt before forwarding:

```
Relevant context from this user's prior sessions:

[summary: photosynthesis lecture (2026-05-12)]
Photosynthesis converts light energy to chemical energy via the Calvin cycle
and light-dependent reactions. Key enzymes include RuBisCO…

[chunk: 2026-05-12-photosynthesis-lecture · turn 4]
User asked about ATP synthase; Delfin explained that the H+ gradient across
the thylakoid membrane drives rotational motion in the F0/F1 subunits…

End of context. Use this only if it directly helps answer the current question.
```

The `sources` array is cached against the assistant message ID so the renderer's "Sources used (N)" strip can fetch it on demand via `memory:get-sources-for-message`.

**Voice turns** use the `VOICE_TURN_TEXT` constant as the literal `text` field, but the actual question is in the audio blob. For voice turns at V1, retrieval is **skipped** because we have no transcribed query text to embed. (Forward-compatible: V3 audio transcription unlocks retrieval on voice turns too. Worth flagging in the assistant-message UI when retrieval was skipped, so the user understands why memory feels less active on voice turns.)

### `memoryRouter.mjs`

Lightweight HTTP routing using Node's built-in `http` server (no Express dep). Plugs into the proxy's existing HTTP listener.

```javascript
export function registerMemoryRoutes(server, deps) {
  server.on('request', (req, res) => {
    if (!req.url.startsWith('/memory/')) return  // existing /health handler runs
    handleMemoryRequest(req, res, deps)
  })
}
```

### `logbook.mjs`

Append-only `wiki/log.md`. Same format as v1 spec.

```javascript
export async function appendLog(wikiDir, op, subject, detail = '')
export async function readLog(wikiDir, limit = 50)         // → LogEntry[]
```

---

## Shared types

### `src/shared/memoryTypes.ts`

```typescript
export interface WikiPageSummary {
  id: string
  path: string                 // relative to MEMORY_DIR/wiki
  kind: 'source'               // V3 may add 'entity' | 'concept' back
  title: string
  tags: string[]
  sourceKind: 'session' | 'file' | 'url' | 'image' | 'audio'
  created: string
  updated: string
  chunkCount: number
}

export interface WikiSearchResult {
  path: string
  title: string
  snippet: string
  score: number                // cosine similarity at V1
  kind: 'summary' | 'chunk'
}

export interface WikiPage extends WikiPageSummary {
  body: string
  backlinks: string[]
}

export interface IngestJob {
  jobId: string
  op: 'ingest'
  subject: string              // session id at V1
  status: 'pending' | 'running' | 'done' | 'error'
  phase: WsMemoryProgress['phase']
  pct: number
  startedAt: string
  finishedAt?: string
  error?: string
}

export interface LogEntry {
  timestamp: string
  op: string
  subject: string
  detail: string
}

export interface MemoryHealth {
  enabled: boolean
  wikiExists: boolean
  pageCount: number
  chunkCount: number
  lastIngest?: string
  embedModel: string
  embedDim: number
}

export interface SourceReference {
  pageId: string
  path: string
  kind: 'summary' | 'chunk'
  chunkIdx?: number
  title: string
}
```

### `src/shared/memorySchemas.ts`

Zod schemas mirroring every type above. Used in `memoryHandlers.ts` to validate IPC payloads, and in `ingestLlm.mjs` to validate LLM outputs against the JSON-schema-constrained generations.

---

## UI — minimum viable surface (V1)

V1 adds **two** new UI elements and nothing else. Both are small.

### 1. `SessionEndedToast`

A non-blocking strip that slides in on the home screen for ~3 seconds after the most recent ingest job finishes:

```
✓ Session saved · Memory updated (1 source, 6 chunks)            [×]
```

Dismissible. Re-appears for each new completed ingest. Implementation: subscribes to `memory:progress` via `memoryStore`; renders when the latest job transitions to `done`.

### 2. "Sources used (N) ▾" strip

Below every assistant message in `SessionConversation.tsx`, render:

```
💡 Sources used (1) ▾
```

If clicked:

```
💡 Sources used (1) ▴
   📄 Photosynthesis — Lecture 14 (2026-05-12)  [summary]
```

Clicking a source opens the markdown file with `shell.openPath()` in V1 (the user's OS default markdown handler). V2 introduces the MemoryView overlay for in-app reading.

Data flow: when the user-turn round-trip finishes, `sessionHandlers.ts` calls `memoryClient.getSourcesForMessage(messageId)` and stores the result in `memoryStore.lastSourcesUsed[messageId]`. The conversation component reads from the store. If `sources.length === 0`, the strip is omitted entirely.

### UI improvements specced for later phases (not implemented in V1)

These appear here only so the architecture supports them without rework:

- **MemoryView overlay (V2)** — third overlay mode alongside `home` and `active`. Sidebar lists pages; main pane renders markdown with clickable `[[wikilinks]]`. Re-uses the existing overlay-mode state machine.
- **"Ask my notes" command palette (V3)** — `Ctrl+K` opens a retrieval-only quick search; no fresh Gemma turn, just dense top-10 over the wiki. Used for "what was that thing I learned about…?".
- **Per-session "Don't ingest" toggle (V2)** — adds an `ingest: boolean` field to the persisted session record; default `true`. Surfaces as a switch in the session-end view.
- **Cross-session context at session start (V2)** — opt-in: when a new session starts, inject the top-3 most-relevant prior summaries based on the first turn's screen capture (captioned at session-start).
- **"X sessions indexed" indicator (V2)** — single-line widget on the home screen showing wiki size and last-ingested timestamp.
- **Visual diff on wiki update (V3)** — when re-ingesting a session updates its summary, render an added/removed-sentences diff.
- **File-watcher on `MEMORY_DIR` (V3)** — chokidar watches the markdown directory; external edits trigger re-embedding of changed pages. Treats markdown as source of truth.

---

## V1 acceptance criteria

1. `MEMORY_ENABLED=true` causes `~/.delfin/memory/` to be created on first proxy startup with `AGENTS.md`, `wiki/index.md`, `wiki/log.md`, and an initialised `index.db`.
2. Completing a session with `MEMORY_AUTO_INGEST=true` produces, within the latency targets in §Performance: 1 source page in `wiki/sources/`, the per-turn chunks indexed in `chunks` + `chunks_vec`, 1 line in `wiki/log.md`, and an entry in `pages`.
3. `MEMORY_AUTO_INGEST=false` disables automatic post-session ingest. Manual ingest still works via `memory:ingest-session`.
4. During a live **text** user turn whose question paraphrases a prior session's topic, the streamed assistant response demonstrably uses the retrieved context (validated by both inspecting the system prompt sent to the bridge and a manual rubric on response quality across 5 representative paraphrased queries).
5. The "Sources used (N) ▾" strip appears below assistant responses where retrieval contributed, lists the correct page paths/titles, and opens the source on click via `shell.openPath()`.
6. The `SessionEndedToast` appears within 1 s of an ingest job completing and auto-dismisses after 3 s.
7. Re-ingesting the same session is idempotent (no duplicate page on disk, no duplicate chunks in the index, single `update` log entry).
8. Cancelling an in-flight ingest leaves no partial markdown file on disk and no partial rows in the SQLite index.
9. EmbeddingGemma loads successfully at proxy startup; memory health endpoint reports `embedModel: "embeddinggemma"`, `embedDim: 768`.
10. All new IPC channels validate their payloads with Zod; all new WS messages validate at the wsClient boundary. No `any` types introduced.
11. `npm test` (Vitest) passes including new memory module tests.

### Performance targets (V1)

| Metric | Target | Stretch |
| --- | --- | --- |
| Ingest wall time per 5-turn session (E2B, CPU, 16 GB RAM) | ≤ 3 min | ≤ 90 s |
| Per-screenshot caption LLM call | ≤ 10 s | ≤ 5 s |
| Per-session summary LLM call | ≤ 60 s | ≤ 30 s |
| Retrieval latency (embedding + sqlite-vec top-k on 10k chunks) | ≤ 150 ms | ≤ 50 ms |
| Embedding model cold-load at proxy startup | ≤ 5 s | ≤ 2 s |
| Memory overhead at runtime (proxy + EmbeddingGemma resident) | ≤ 350 MB | ≤ 250 MB |

If the M0 spike (§Implementation phasing) misses the **target** column on any metric, return to scope before continuing to M1.

---

## Implementation phasing

| Sub-phase | Scope | Exit gate |
| --- | --- | --- |
| **M0 — Viability spike** | `scripts/memory/spike.mjs` (standalone, not wired into the proxy). Pick 3 stored sessions of varying length/topic. Run: caption per turn + summary per session, all with `decodingConstraint` JSON-schema. Measure per-call latency and parse-failure rate. Validate that EmbeddingGemma loads under onnxruntime-node and that `sqlite-vec` is installable on Windows/macOS/Linux Node. | Written go/no-go report committed in PR description. Targets: ≥ 95 % JSON parse success after retries; ingest target latencies hit; embed + sqlite-vec working on all 3 OSes. |
| **M1 — Foundations** | `store.mjs`, `index.mjs` (sqlite-vec + FTS5 tables, FTS5 populated but unused for retrieval in V1), `embed.mjs` loaded at proxy startup, `memoryRouter.mjs` mounted. Hand-written fixture wiki seeded into `MEMORY_DIR` for tests. Renderer: no UI yet beyond `memoryStore.fetchHealth()`. | `GET /memory/health` returns correct JSON. `GET /memory/search?q=…` against the fixture returns top-k chunks. All `scripts/memory/*.test.mjs` pass. |
| **M2 — Auto-ingest pipeline** | `ingestLlm.mjs` (with bridge `decodingConstraint` extension), `ingest.mjs`, session-end hook in `sessionHandlers.ts` → proxy control message → ingest job. `ingestQueue.ts` in Electron main. `SessionEndedToast` in renderer. | End a real session with `MEMORY_AUTO_INGEST=true`; within performance targets a `sources/<slug>.md` appears, log entry is appended, toast shows. Cancelling mid-ingest leaves no partial state. Idempotency: re-ingest produces no duplicates. |
| **M3 — Retrieval into live turns** | `retrieve.mjs`, proxy injects context block before bridge `generate`, `lastSourcesUsed[messageId]` tracking. Renderer: "Sources used (N) ▾" strip below assistant messages. | Manual rubric across 5 paraphrased queries: ≥ 4/5 turns demonstrably use the retrieved context per the system-prompt inspection. Strip renders correct sources; clicking opens the markdown. V1 acceptance criteria complete. |

Each sub-phase is its own Gate 1→5 cycle. M0 must finish before M1 starts.

---

## V2 — Document and link uploads (separate spec to be written after V1)

| Feature | Notes |
| --- | --- |
| **FileDropZone** | Renderer drop zone (lives in the new MemoryView overlay). Accepts `.pdf`, `.md`, `.txt`. Calls `memory:ingest-file`. |
| **PDF parsing** | `pdfjs-dist` (npm package, pure JS — no Python dep). Extract text per page; merge into chunkable transcript. Falls back to per-page OCR placeholder text if no extractable text (image-only PDFs flagged as needing V3 vision pass). |
| **Web link ingest** | URL input field. Fetch with `node-fetch` + a sensible user-agent. Extract main content with `@mozilla/readability` Node port. Store source page with `source_kind: 'url'`, original URL in frontmatter. |
| **MemoryView overlay mode** | New overlay state; sidebar of pages, markdown reader with wikilink navigation. Wikilinks resolve to `memory:get-page` calls. |
| **Per-session "Don't ingest" toggle** | `ingest: boolean` flag on the persisted session; surfaces in session-end UI. |
| **BM25 hybrid retrieval (V1.5 fast-follow, not gated on V2)** | Add `searchFts` to `index.mjs`; merge dense + FTS5 results via RRF (`1/(60+rank)`). Add `MEMORY_HYBRID_RETRIEVAL=true` flag (default `true`). |

V2 reuses the entire V1 ingest pipeline; only the input adapter changes (session vs file vs URL).

---

## V3 — Multimodal + retrieval polish (separate spec to be written after V2)

| Feature | Notes |
| --- | --- |
| **Image ingest** | User drops an image. Run a "describe this image in 1 paragraph" prompt through the bridge with Gemma 4's vision pathway. Store the description as the source page body. Image symlinked into `assets/`. |
| **Audio ingest** | Same as image but uses Gemma 4's audio pathway for transcription / summarization. Removes the V1 "retrieval skipped on voice turns" caveat by adding transcription as a session-ingest step. |
| **Cross-encoder reranker** | Add `bge-reranker-v2-m3` (small). Reranks top-20 dense+BM25 to top-5. Gated on user-visible retrieval-precision failure mode. |
| **Lint pass** | Scoped down from v1 spec to: broken `[[wikilinks]]`, stale sources (no relevant retrieval hits in 60 days), oversized pages. Deterministic; no LLM. |
| **File-watcher on `MEMORY_DIR`** | chokidar; external markdown edits trigger re-embedding. |
| **"Ask my notes" command palette** | `Ctrl+K` from anywhere; retrieval-only quick search. |
| **Cross-session context at session start** | Opt-in: inject top-3 prior summaries based on the first turn's screen capture. |

---

## Risks and open questions

| # | Risk / question | Mitigation |
| --- | --- | --- |
| R1 | **EmbeddingGemma RAM cost alongside Gemma 4 E2B (2 GB) is high on 8 GB machines.** | M0 measures peak RSS with both loaded. If 8 GB is the target floor, fall back to `bge-small-en-v1.5` (130 MB) and document in `.env.example`. |
| R2 | **Voice turns skip retrieval at V1 because we have no query text to embed.** Users may perceive memory as inconsistent ("works in text mode, not in voice"). | Flag in the assistant-message UI when retrieval was skipped due to missing query text. Schedule V3 audio transcription. |
| R3 | **Bridge `decodingConstraint` may not be enough on its own** — grammar-constrained decoding ensures schema compliance but does not guarantee semantic quality of the summary text. | M0 spike includes a manual quality rubric. Iterate on the summary prompt until it produces useful summaries; this is prompt engineering, not architectural risk. |
| R4 | **Ingest concurrency with active user turns** — bridge serialises. Long ingest jobs would block a new user turn. | `ingestLlm.mjs` mutex yields between every step. Worst case is a user-turn waits one LLM call (~5–10 s) before getting through. Acceptable trade-off; mitigated by running ingest only at session end when the user is typically already done. |
| R5 | **`sqlite-vec` (or `sqlite-vss`) Node binding maturity on Windows.** | Spike in M0 — install on Windows x64 / macOS arm64 / Linux x64 via `better-sqlite3`'s loadable-extension API. If broken on a platform, fall back to a JS-side cosine-similarity scan (still fast at 10k chunks). |
| R6 | **EmbeddingGemma ONNX availability and licensing.** | Verify in M0: ONNX export exists on HuggingFace (`onnx-community/embeddinggemma-300m-ONNX` or similar) and is Apache-licensed-compatible with our bundling. If not, fall back to bge-small-en-v1.5 (already MIT). |
| R7 | **Markdown frontmatter parser dependency.** Adding `gray-matter` or rolling our own. | Use `gray-matter` — battle-tested, ~30 KB, no native deps. |
| Q1 | **Should the embedding model also be configurable to a *user-installed* one** (e.g. Ollama-hosted `nomic-embed-text`)? Adds flexibility for power users; adds support surface. | Recommend: **no for V1.** Reconsider in V3 alongside Ollama integration if there's demand. |
| Q2 | **Where do model files go for distribution?** Today `models/` is gitignored and provisioned by `setup-litert-cpp.mjs`. Embedding model is a new asset class. | Extend `assetManager.ts` to manage a new `embedding-model` asset alongside `litert-cpp-model` / `piper-bin` / `piper-voice`. First-run download via the same `SetupScreen` flow. |
| Q3 | **Schema migration policy.** If we change frontmatter fields or table schema later, do we rebuild the SQLite index from markdown, or write migrations? | Recommend: **always rebuild from markdown.** The markdown files are the source of truth; the SQLite index is derived. Bump `state/version.txt` to invalidate on schema change. |

---

## Verification checklist (V1)

- [ ] M0 spike report committed; go/no-go decision recorded in PR description
- [ ] `scripts/memory/*.test.mjs` covers frontmatter round-trip, index upsert/search, log append, ingest schema validation (with constrained decoding), retrieval against a fixture wiki, idempotent re-ingest
- [ ] `delfin_litert_bridge` accepts `decodingConstraint` on `generate` and emits a clear `error` when the constraint is malformed
- [ ] Bridge changes covered by a manual test plan in the PR description (test JSON-schema-constrained generation against a known-bad-without-constraint prompt)
- [ ] `/memory/health` returns correct JSON when `MEMORY_ENABLED=false`
- [ ] `/memory/health` returns correct JSON when wiki directory does not yet exist (auto-creates on first call)
- [ ] `ingestSession()` completes within performance targets on a real stored 5-turn session
- [ ] `ingestSession()` is idempotent — running it twice produces no duplicate pages and no duplicate chunks
- [ ] Cancel ingest job mid-run: no partial page writes left on disk, no partial rows in `chunks`/`chunks_vec`
- [ ] `WsMemoryProgress` events reach the renderer via the existing wsClient
- [ ] `SessionEndedToast` renders within 1 s of ingest `done`; auto-dismisses after 3 s
- [ ] "Sources used (N) ▾" strip renders only when retrieval contributed; lists correct page paths/titles; opens the markdown via `shell.openPath()` on click
- [ ] `MEMORY_AUTO_INGEST=false` disables automatic post-session ingest
- [ ] Voice turns proceed without retrieval and the assistant-message UI flags this clearly
- [ ] `src/shared/memoryTypes.ts` — no `any` types
- [ ] `src/shared/memorySchemas.ts` — Zod schema covers all fields of every type
- [ ] All existing tests still pass (`npm test`)
- [ ] `AGENTS.md` memory-dir template seeded on first run; not overwritten if user has edited it
- [ ] `assetManager.ts` provisions the EmbeddingGemma ONNX model on first run; `SetupScreen` shows progress for the new asset
- [ ] `docs/SPEC.md` updated with new IPC channels, `WsMemoryProgress`, and `MEMORY_*` env vars
- [ ] `STATUS.md` Memory section updated; old v1 spec marked 📦 archived

---

## Out-of-band reading

- LiteRT-LM C++ API constrained-decoding docs: `ai.google.dev/edge/litert-lm/cpp`
- LiteRT-LM v0.11.0 release notes (Gemma 4 MTP, native Windows): GitHub release page
- LiteRT-LM #2202 (Gemma 4 E2B structured-output field telemetry): the source of the 6–9% bad-json measurement
- Gemma 4 function calling guide: `ai.google.dev/gemma/docs/capabilities/function-calling`
- EmbeddingGemma announcement: `developers.googleblog.com/en/introducing-embeddinggemma/`
- Karpathy LLM-wiki pattern writeup (informs the summary-page approach but not the chunk layer)
