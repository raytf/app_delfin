# Phase 7 — Memory System (LLM Wiki)

> **Goal**: Give Delfin a persistent, compounding, on-device memory modelled on Karpathy's LLM wiki pattern. A single global markdown wiki is maintained by the local model (Gemma 4 E2B) across all sessions. The model queries it at runtime via tool calls to produce answers grounded in the user's accumulated history. No cloud, no vector DB, no second model.

**Depends on**: Phase 4 (persistent session storage, sidecar tool calling, IPC bridge all working)

---

## Sub-phase map

Complete each sub-phase as its own Gate 1→5 cycle before starting the next.

| Sub-phase | Scope summary | Gate |
|---|---|---|
| **M0** — E2B viability spike | Implement only `extract_entities` + `draft_source_page` ingest steps; run on 3 real sessions; measure latency and JSON parse success rate. | Written go/no-go report before any further build. |
| **M1** — Read-only wiki infrastructure | `store.py`, `index.py`, `logbook.py`, REST endpoints, seed with hand-written fixture wiki, in-app MemoryView reader. | `curl /memory/search?q=...` works; UI renders pages with working wikilinks. |
| **M2** — Session ingest (auto + manual) | Full ingest pipeline, background job runner, WS progress, IPC wiring, IngestStatusCard. | End-session → source page + entity pages + log entry appear within expected time. |
| **M3** — File ingest + runtime tools + lint | FileDropZone, PDF handling, `search_wiki`/`read_wiki_page` tools, lint, LintReportView. | Live turn cites a wiki page; lint report renders; PDF drop produces artefacts. |

---

## 7.0 E2B viability spike (M0)

Before any UI or infrastructure is built, validate that Gemma 4 E2B can reliably produce the structured JSON outputs the ingest pipeline requires.

### What to build (spike only)

Create `sidecar/memory/spike.py` — a standalone script (not wired into the server) that:

1. Loads three stored Delfin sessions from disk (pick sessions with varied content).
2. Runs `extract_entities` (step 1) and `draft_source_page` (step 2) against each session using the live LiteRT-LM engine.
3. Measures per-step wall-clock latency and logs it.
4. Counts JSON parse/validation failures against the Pydantic schemas; retries up to `MEMORY_LLM_RETRIES=2` and records the retry count.
5. Prints a structured report to stdout.

### Schemas to validate during spike (defined in `sidecar/memory/schemas.py`)

```python
class EntityExtraction(BaseModel):
    relevant: bool          # false → skip entity update, source page only
    reason: str
    entities: list[ExtractedEntity]

class ExtractedEntity(BaseModel):
    name: str
    kind: Literal["person", "place", "concept", "product", "event", "other"]
    evidence: str           # ≤ 200 chars — the sentence that surfaced this entity

class SourcePageDraft(BaseModel):
    title: str
    tags: list[str]
    body: str               # full markdown, ≤ MEMORY_MAX_PAGE_BYTES chars
```

### Go/no-go criteria

| Metric | Go | No-go |
|---|---|---|
| JSON parse success (after retries) | ≥ 90 % of steps | < 90 % |
| `extract_entities` per session | ≤ 60 s | > 120 s |
| `draft_source_page` per session | ≤ 90 s | > 180 s |
| Entity names obviously wrong / hallucinated | < 20 % | ≥ 20 % |

If no-go: revisit prompt design, tighter JSON schemas, or chain-of-thought reduction before proceeding to M1. Document findings in the PR description.

---

## 7.1 Directory layout

All memory lives under a single data directory, configurable via `MEMORY_DIR` env var (default: `$XDG_DATA_HOME/delfin/memory/` or `$HOME/.local/share/delfin/memory/` if `XDG_DATA_HOME` is not set).

```
$XDG_DATA_HOME/delfin/memory/
├── AGENTS.md                    ← schema: conventions the model follows (user-editable)
├── wiki/
│   ├── index.md                 ← catalogue: every page, one-line summary, tags, source_ids
│   ├── log.md                   ← append-only operation log
│   ├── sources/                 ← one page per ingested source
│   │   └── 2026-04-21-session-<id>.md
│   ├── entities/                ← people, places, products, events
│   │   └── Alan Turing.md
│   ├── concepts/                ← ideas, topics, definitions
│   │   └── Backpropagation.md
│   └── assets/                  ← session capture thumbnails (symlinks, not copies)
└── state/
    ├── ingest-queue.jsonl        ← pending / active / done ingest jobs
    └── lint-last.json            ← cached lint report
```

### Soft Obsidian compatibility

- Wikilinks use double-bracket format: `[[Entity Name]]`.
- Every page has YAML frontmatter: `id`, `kind`, `created`, `updated`, `source_ids[]`, `tags[]`.
- Log entries begin `## [YYYY-MM-DD HH:MM] <op> | <subject>` so `grep` parsing works.
- Assets dir mirrors the layout expected by Obsidian's attachment folder setting.
- No format features that _require_ Obsidian are used (no Dataview queries, no Obsidian-only callouts).

---

## 7.2 Environment variables (additions to `.env.example`)

```env
# === Memory ===
MEMORY_ENABLED=true
MEMORY_DIR=                        # default: $XDG_DATA_HOME/delfin/memory (or $HOME/.local/share/delfin/memory if XDG_DATA_HOME is not set)
MEMORY_AUTO_INGEST=true            # ingest automatically when a session ends
MEMORY_INGEST_CONCURRENCY=1        # keep at 1; E2B cannot share the engine
MEMORY_MAX_PAGE_BYTES=32768        # max size of any single model-written page
MEMORY_LLM_RETRIES=2              # JSON parse/validate retry count per ingest step
MEMORY_SEARCH_LIMIT=10            # max results returned by search_wiki tool
```


---

## 7.3 Sidecar — memory module

All new Python lives under `sidecar/memory/`. Nothing in this module may import from `sidecar/server.py` directly; communication is through the FastAPI sub-router and the existing engine reference passed at startup.

### sidecar/memory/store.py

Low-level file I/O. Never calls the LLM. Functions:

```python
def read_page(path: Path) -> tuple[dict, str]:
    """Parse YAML frontmatter and body from a wiki markdown file."""

def write_page(path: Path, frontmatter: dict, body: str) -> None:
    """Atomic write: write to .tmp then os.replace(). Never partial-writes."""

def list_pages(wiki_dir: Path) -> list[Path]:
    """Return all .md paths under wiki/ except index.md and log.md."""

def page_slug(title: str) -> str:
    """Normalise a title to a safe filename (lowercase, hyphens, no specials)."""
```

### sidecar/memory/index.py

Maintains `wiki/index.md`. Never calls the LLM; purely deterministic.

```python
def load_index(wiki_dir: Path) -> list[IndexEntry]:
    """Parse index.md into a list of IndexEntry objects."""

def upsert_index_entry(wiki_dir: Path, entry: IndexEntry) -> None:
    """Insert or replace the entry for a given page path, then rewrite index.md."""

def search_index(wiki_dir: Path, query: str, limit: int = 10) -> list[WikiSearchResult]:
    """Substring match on title + summary + tags. Returns ranked results."""
```

`IndexEntry` fields: `path`, `kind`, `title`, `summary` (≤120 chars), `tags`, `source_count`, `updated`.
`WikiSearchResult` fields: `path`, `title`, `snippet` (first match context), `tags`, `score` (match count, not semantic).

### sidecar/memory/logbook.py

```python
def append_log(wiki_dir: Path, op: str, subject: str, detail: str = "") -> None:
    """Append one entry: ## [YYYY-MM-DD HH:MM] <op> | <subject>\n<detail>"""

def read_log(wiki_dir: Path, limit: int = 50) -> list[LogEntry]:
    """Return the last N log entries, newest first."""
```

### sidecar/memory/schemas.py

Pydantic models for every LLM output (`model_config = ConfigDict(extra="forbid")`):

```python
class EntityExtraction(BaseModel):
    relevant: bool          # false → skip entity updates; produce source page only
    reason: str
    entities: list[ExtractedEntity]

class ExtractedEntity(BaseModel):
    name: str
    kind: Literal["person", "place", "concept", "product", "event", "other"]
    evidence: str           # ≤ 200 chars — the sentence that surfaced this entity

class SourcePageDraft(BaseModel):
    title: str
    tags: list[str]
    body: str               # full markdown, ≤ MEMORY_MAX_PAGE_BYTES chars

class EntityUpdateProposal(BaseModel):
    action: Literal["create", "update", "skip"]
    new_body: str | None    # None when action == "skip"
    rationale: str          # ≤ 200 chars, written to log

class ConceptUpdateProposal(BaseModel):  # same shape as EntityUpdateProposal
    action: Literal["create", "update", "skip"]
    new_body: str | None
    rationale: str

class ContradictionFinding(BaseModel):
    claim_a: str
    claim_b: str
    source_a: str
    source_b: str
    severity: Literal["minor", "major"]

class LintReport(BaseModel):
    orphans: list[str]                   # page paths with zero inbound wikilinks
    broken_links: list[tuple[str, str]]  # (source_path, missing_target_name)
    missing_index: list[str]             # paths absent from index.md
    stale_pages: list[str]
    contradictions: list[ContradictionFinding]
    generated_at: str                    # ISO 8601 timestamp
```

### sidecar/memory/ingest.py

Orchestrates the multi-step pipeline. Each public function is one atomic LLM turn with retry.

```python
async def ingest_session(
    session_id: str, engine, wiki_dir: Path,
    progress_cb: Callable[[str, float], Awaitable[None]],
) -> None:
    # 1. Load transcript + capture paths from session storage
    # 2. extract_entities()           → EntityExtraction
    # 3. draft_source_page()          → SourcePageDraft → write sources/<slug>.md
    # 4. For each entity: propose_entity_update() → apply if action != "skip"
    # 5. extract_concepts() + propose_concept_update() for each concept
    # 6. upsert_index_entry() for every written page  (deterministic, no LLM)
    # 7. append_log()

async def ingest_file(
    file_path: Path, kind: Literal["pdf", "text", "image"],
    engine, wiki_dir: Path,
    progress_cb: Callable[[str, float], Awaitable[None]],
) -> None:
    # extract text (pypdf for PDF, read() for text, vision call for image)
    # then run steps 2-7 from ingest_session
```

**Retry wrapper** (used internally by every LLM step):

```python
async def _call_with_retry(
    prompt: list[dict], schema: type[BaseModel], engine, retries: int,
) -> BaseModel:
    # Call engine, parse JSON, validate. On failure: append error feedback
    # to prompt and retry up to `retries` times.
    # Raises IngestStepError after exhausting retries — never writes partial output.
```

**Concurrency guard**: a module-level `asyncio.Lock` is shared between `ingest.py` and `ws_endpoint`. The active user inference turn holds the lock; ingest acquires it between steps and yields immediately when a user turn is waiting.

### sidecar/memory/lint.py

```python
async def run_lint(engine, wiki_dir: Path) -> LintReport:
    # Checks (deterministic):
    #   orphans      — pages with zero inbound [[wikilinks]]
    #   broken_links — [[X]] with no matching page
    #   missing_index — pages not listed in index.md
    #   stale_pages  — latest source_id older than 30 days and ≥2 sources exist
    # Check (LLM):
    #   contradictions — one detect_contradictions() call per entity page with ≥2 sources
    # Writes state/lint-last.json; returns LintReport.
```

### sidecar/memory/tools.py

Tool schemas + executors registered per connection inside `ws_endpoint`.

```python
SEARCH_WIKI_TOOL = {
    "name": "search_wiki",
    "description": "Search the user's personal knowledge wiki for pages about a topic.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "limit": {"type": "integer", "default": 5, "maximum": 10}
        },
        "required": ["query"]
    }
}

READ_WIKI_PAGE_TOOL = {
    "name": "read_wiki_page",
    "description": "Read the full content of a wiki page by its relative path.",
    "parameters": {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"]
    }
}

async def execute_tool(name: str, args: dict, wiki_dir: Path) -> str:
    """Dispatch search_wiki / read_wiki_page and return a JSON string result.
    Result is truncated to VISION_TOKEN_BUDGET * 2 characters before returning."""
```

### sidecar/memory/router.py

FastAPI `APIRouter` mounted at `/memory` in `server.py`.

```
GET  /memory/health                   → { enabled, wiki_exists, page_count, last_ingest }
GET  /memory/index                    → { pages: WikiPageSummary[] }
GET  /memory/page          ?path=     → { path, frontmatter, body, backlinks[] }
GET  /memory/search        ?q=&limit= → { results: WikiSearchResult[] }
GET  /memory/log           ?limit=    → { entries: LogEntry[] }
GET  /memory/ingest/jobs              → { jobs: IngestJob[] }
POST /memory/ingest/session           body: { session_id }  → { job_id }
POST /memory/ingest/file              multipart: file + kind → { job_id }
POST /memory/ingest/:job_id/cancel    → { ok }
POST /memory/lint                     → { job_id }
```

Long-running ops spawn an `asyncio.Task`, return `{ job_id }` immediately, and stream `WsMemoryProgress` events over the active WebSocket connection. Job state is persisted to `state/ingest-queue.jsonl` so jobs survive sidecar restarts.

---

## 7.4 WebSocket protocol additions

One new message type is added to the existing `WsInboundMessage` union (update `src/shared/types.ts` and `src/shared/schemas.ts`):

```typescript
// Sidecar → Electron: ingest or lint progress
interface WsMemoryProgress {
  type: 'memory_progress';
  job_id: string;
  op: 'ingest' | 'lint';
  phase: 'extract' | 'summarize' | 'propose_update' | 'apply' | 'done' | 'error';
  subject?: string;    // e.g. "entities/Alan Turing.md"
  pct?: number;        // 0..1
  message?: string;    // human-readable status or error detail
}
```

No changes to the existing `token`, `structured`, `audio_*`, `done`, or `error` message shapes.

---

## 7.5 Shared types (TypeScript)

### src/shared/memoryTypes.ts (new file)

```typescript
export interface WikiPageSummary {
  path: string;
  kind: 'source' | 'entity' | 'concept';
  title: string;
  summary: string;
  tags: string[];
  sourceCount: number;
  updated: string;   // ISO date
}

export interface WikiSearchResult {
  path: string;
  title: string;
  snippet: string;
  tags: string[];
  score: number;
}

export interface WikiPage {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  backlinks: string[];
}

export interface IngestJob {
  jobId: string;
  op: 'ingest' | 'lint';
  subject: string;
  status: 'pending' | 'running' | 'done' | 'error';
  pct: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface LogEntry {
  timestamp: string;
  op: string;
  subject: string;
  detail: string;
}

export interface MemoryHealth {
  enabled: boolean;
  wikiExists: boolean;
  pageCount: number;
  lastIngest?: string;
}
```

### src/shared/memorySchemas.ts (new file)

Zod mirrors of every type above, used to validate IPC payloads in `memoryHandlers.ts`.

---

## 7.6 Electron main process

### src/main/memory/memoryClient.ts (new file)

Thin REST client wrapping `fetch()` calls to the sidecar `/memory/*` endpoints. Returns typed responses. Exposes:

```typescript
export const memoryClient = {
  health(): Promise<MemoryHealth>
  listIndex(): Promise<{ pages: WikiPageSummary[] }>
  getPage(path: string): Promise<WikiPage>
  search(query: string, limit?: number): Promise<{ results: WikiSearchResult[] }>
  getLog(limit?: number): Promise<{ entries: LogEntry[] }>
  listJobs(): Promise<{ jobs: IngestJob[] }>
  ingestSession(sessionId: string): Promise<{ jobId: string }>
  ingestFile(filePath: string): Promise<{ jobId: string }>
  cancelIngest(jobId: string): Promise<{ ok: boolean }>
  lint(): Promise<{ jobId: string }>
}
```

### src/main/memory/ingestQueue.ts (new file)

Tracks active ingest jobs. Receives `WsMemoryProgress` events from `wsClient.ts` and forwards them to the renderer via the `memory:progress` IPC channel. Exposes `cancelAll()` called during session stop and app quit.

### src/main/ipc/memoryHandlers.ts (new file)

Registers all `memory:*` IPC handlers. Every handler validates its payload with the corresponding Zod schema from `memorySchemas.ts`, delegates to `memoryClient`, and forwards errors to the renderer via `memory:error`.

```typescript
// Channels handled:
ipcMain.handle('memory:list', ...)
ipcMain.handle('memory:get-page', ...)
ipcMain.handle('memory:search', ...)
ipcMain.handle('memory:ingest-session', ...)
ipcMain.handle('memory:ingest-file', ...)
ipcMain.handle('memory:cancel-ingest', ...)
ipcMain.handle('memory:lint', ...)
ipcMain.handle('memory:get-log', ...)
```

### src/main/index.ts (modified)

- Call `registerMemoryHandlers()` alongside existing handler registrations.
- Ensure `MEMORY_DIR` exists on startup (create dirs, seed `AGENTS.md` from bundled template if not present).
- Wire `WsMemoryProgress` events from `wsClient` into `ingestQueue`.
- On session end (when `sessionHandlers.ts` fires session stop): if `MEMORY_AUTO_INGEST=true`, enqueue an ingest job for the completed session.

### src/preload/index.ts (modified)

Extend the `contextBridge` with a `memory` namespace:

```typescript
memory: {
  list: () => ipcRenderer.invoke('memory:list'),
  getPage: (path: string) => ipcRenderer.invoke('memory:get-page', { path }),
  search: (query: string, limit?: number) => ipcRenderer.invoke('memory:search', { query, limit }),
  ingestSession: (sessionId: string) => ipcRenderer.invoke('memory:ingest-session', { sessionId }),
  ingestFile: (filePath: string) => ipcRenderer.invoke('memory:ingest-file', { filePath }),
  cancelIngest: (jobId: string) => ipcRenderer.invoke('memory:cancel-ingest', { jobId }),
  lint: () => ipcRenderer.invoke('memory:lint'),
  getLog: (limit?: number) => ipcRenderer.invoke('memory:get-log', { limit }),
  onProgress: (cb: (p: WsMemoryProgress) => void) => {
    ipcRenderer.on('memory:progress', (_e, p) => cb(p))
  },
  onIndexChanged: (cb: () => void) => {
    ipcRenderer.on('memory:index-changed', cb)
  },
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
}
```

---

## 7.7 Renderer — Memory UI

### src/renderer/stores/memoryStore.ts (new file)

Zustand store. State:

```typescript
interface MemoryStore {
  pages: WikiPageSummary[]          // index catalogue
  currentPage: WikiPage | null      // open page in reader
  searchResults: WikiSearchResult[]
  jobs: IngestJob[]                 // active/recent ingest jobs
  lintReport: LintReport | null
  logEntries: LogEntry[]
  health: MemoryHealth | null
  // actions
  fetchIndex(): Promise<void>
  openPage(path: string): Promise<void>
  search(query: string): Promise<void>
  ingestSession(sessionId: string): Promise<void>
  dropFile(filePath: string): Promise<void>
  runLint(): Promise<void>
  fetchLog(): Promise<void>
  handleProgress(p: WsMemoryProgress): void
}
```

Registers `memory:progress` and `memory:index-changed` listeners in a single `useEffect`; cleans them up on unmount via `api.memory.removeAllListeners(channel)`.

### src/renderer/components/memory/MemoryView.tsx (new file)

Top-level view rendered when the overlay is in `"memory"` mode. Layout:

```
┌─────────────────────────────────────┐
│  🧠 Memory   [Search bar]  [Lint]   │  ← header with search + actions
├─────────────────────────────────────┤
│  Ingest jobs strip (if active)      │  ← IngestStatusCard
├─────────────────────────────────────┤
│  Page list (left) │ Reader (right)  │  ← WikiSearchBar + index list | WikiPageReader
│  ─ sources        │                 │
│  ─ entities       │  (markdown)     │
│  ─ concepts       │                 │
├─────────────────────────────────────┤
│  [Drop files here]  [Open folder]   │  ← FileDropZone + shell.openPath
└─────────────────────────────────────┘
```

### src/renderer/components/memory/WikiPageReader.tsx

Renders a `WikiPage` body using `markdown-it`. `[[wikilink]]` syntax is converted to in-app navigation calls (`memoryStore.openPage()`). External URLs open via `shell.openExternal`. Uses Tailwind prose classes.

### src/renderer/components/memory/IngestStatusCard.tsx

Displays running/pending ingest jobs. Each row shows: subject, phase label, progress bar (pct), and a cancel button. Disappears when `jobs` is empty. Updates via `handleProgress()` in `memoryStore`.

### src/renderer/components/memory/LintReportView.tsx

Renders `lintReport` when non-null: four deterministic sections (orphans, broken links, missing index, stale) plus a contradictions accordion. Each finding is a clickable link that opens the relevant page in the reader.

### src/renderer/components/memory/FileDropZone.tsx

An `onDrop` handler on a styled div. Accepts `.pdf`, `.txt`, `.md`, `.png`, `.jpg`. On drop:
1. Calls `window.api.memory.ingestFile(file.path)`.
2. Navigates to `IngestStatusCard` to show progress.

---

## 7.8 Integration points with existing code

### sidecar/server.py

- Import and mount `memory.router` at `/memory` in the lifespan-managed app.
- Pass `wiki_dir` (resolved from env at startup) and the engine reference to the router's dependency injection.
- During `ws_endpoint`, if `MEMORY_ENABLED=true`, append `SEARCH_WIKI_TOOL` and `READ_WIKI_PAGE_TOOL` to the tool list passed to the engine. Route `tool_call` events for these two tool names through `memory.tools.execute_tool()`.

### sidecar/prompts/presets.py

Add one paragraph to every preset system prompt (appended, does not replace existing text):

```
You have access to two tools: search_wiki and read_wiki_page.
Use search_wiki when the user asks about something that may appear in their personal knowledge wiki
(past sessions, topics they have studied, people or concepts they mentioned before).
Use read_wiki_page to read a full page after search_wiki identifies a relevant result.
Always cite the wiki page path when you use information from it.
```

### src/main/ipc/sessionHandlers.ts

After a session is persisted (the existing `session:stop` flow), if `MEMORY_AUTO_INGEST=true`:

```typescript
if (process.env.MEMORY_AUTO_INGEST === 'true') {
  await ingestQueue.enqueue(completedSession.id)
}
```

No change to the session stop response sent to the renderer — ingest is fire-and-forget from the renderer's perspective.

### src/renderer/App.tsx

Add `"memory"` to the overlay mode union and handle navigation to/from `MemoryView`. A memory icon button appears in the session view header (alongside existing controls), navigating to memory mode.

---

## 7.9 IPC channel table (additions to SPEC.md §IPC Channels)

| Direction | Channel | Payload |
|---|---|---|
| R→M | `memory:list` | — |
| R→M | `memory:get-page` | `{ path: string }` |
| R→M | `memory:search` | `{ query: string, limit?: number }` |
| R→M | `memory:ingest-session` | `{ sessionId: string }` |
| R→M | `memory:ingest-file` | `{ filePath: string }` |
| R→M | `memory:cancel-ingest` | `{ jobId: string }` |
| R→M | `memory:lint` | — |
| R→M | `memory:get-log` | `{ limit?: number }` |
| M→R | `memory:progress` | `WsMemoryProgress` |
| M→R | `memory:index-changed` | — |
| M→R | `memory:error` | `{ message: string }` |

---

## 7.10 Default AGENTS.md template

Seeded to `MEMORY_DIR/AGENTS.md` on first run if the file does not exist. Content describes:

- The three-layer structure (sources / entities / concepts) and what belongs in each.
- YAML frontmatter conventions and required fields.
- Wikilink format `[[Page Name]]`.
- Log entry format for manual entries.
- A note that the user may edit this file to change conventions; the sidecar re-reads it at the start of each ingest job.

---

## 7.11 Acceptance criteria

- `MEMORY_ENABLED=true` creates `~/.delfin/memory/` with `AGENTS.md`, `wiki/index.md`, and `wiki/log.md` on first startup.
- Completing a session with `MEMORY_AUTO_INGEST=true` causes: 1 source page, ≥1 entity/concept page, 1 log entry, and an updated `index.md` to appear within the latency bounds established by the M0 spike.
- Manually dropping a 10-page PDF into the FileDropZone produces comparable artefacts. Progress is visible in `IngestStatusCard`. Ingest can be cancelled mid-run.
- During a live voice or text turn, a question whose answer lives only in a prior session's wiki page causes the sidecar process log to show `search_wiki` + `read_wiki_page` tool calls, and the streamed answer references the page path.
- Lint surfaces at least one orphan and one broken-link finding when run against a deliberately corrupted fixture wiki.
- `WikiPageReader` renders wikilinks as clickable navigation; clicking them opens the target page without a full reload.
- All new IPC channels and WS types are validated with Zod (TS) / Pydantic (Python). No `any` types introduced.
- Zero regressions in the existing test suite (`npm test` and `pytest`).
- Unit tests cover: frontmatter round-trip, index upsert/search, log append format, each ingest schema validation path, tool execution against a fixture wiki, and lint orphan/broken-link detection.

---

## 7.12 Risks and open questions

| # | Risk / question | Mitigation |
|---|---|---|
| R1 | **E2B JSON reliability** | M0 spike explicitly measures this; feature is gated on go/no-go result. |
| R2 | **Ingest latency** (multiple turns × multiple entities) | Background job + progress UI. If too slow in practice, batch entity updates into one prompt as a fallback. |
| R3 | **Wiki noise from irrelevant captures** | `extract_entities` returns `relevant: bool`; low-relevance sources produce only a source page, skip entity/concept updates. |
| R4 | **Global wiki mixing unrelated topics** | Tag-based frontmatter + tag filter in the UI. Notebook scoping is a forward-compatible upgrade if real usage shows the need. |
| R5 | **Concurrent ingest + live turn both needing the engine** | Module-level `asyncio.Lock`; ingest yields between steps. |
| R6 | **PDF parse quality with pypdf** | Ships with a log warning; upgrade path to `pdfplumber` is a one-line swap. |
| Q1 | **Per-session privacy toggle** — should users be able to mark a session "do not ingest"? Recommended: yes, as an `ingest: boolean` flag on the session record with a toggle in the end-of-session view. | Confirm before M2. |
| Q2 | **Assets storage** — reference existing capture paths or copy thumbnails into `wiki/assets/`? Recommend reference (symlinks) to avoid doubling disk use. | Confirm before M2. |
| Q3 | **Prompt A/B** — should preset prompts with vs. without the wiki tool paragraph be compared during M0 to measure token and latency overhead? Recommended: yes. | Decide before M0 run. |

---

## Verification checklist

- [ ] M0 spike report committed; go/no-go decision recorded in PR description
- [ ] `sidecar/memory/` module passes `pytest sidecar/tests/test_memory_*.py` with fixture wiki
- [ ] `/memory/health` returns correct JSON when `MEMORY_ENABLED=false`
- [ ] `/memory/health` returns correct JSON when wiki directory does not yet exist
- [ ] `ingest_session` completes without error on a real stored session
- [ ] `ingest_session` is idempotent: running it twice produces no duplicate pages
- [ ] `search_wiki` tool returns results during a live inference turn (check sidecar log)
- [ ] `read_wiki_page` result is truncated to `VISION_TOKEN_BUDGET * 2` chars (check with large fixture page)
- [ ] `WsMemoryProgress` events reach the renderer `IngestStatusCard` (visible progress bar)
- [ ] Cancel ingest job mid-run: no partial page writes left on disk
- [ ] Lint detects orphans and broken links in fixture wiki
- [ ] `WikiPageReader` renders wikilinks as in-app navigation (not external links)
- [ ] FileDropZone accepts PDF, TXT, MD, PNG, JPG; rejects other types with inline error
- [ ] `MEMORY_AUTO_INGEST=false` disables automatic post-session ingest
- [ ] All existing phase 0-6 tests still pass
- [ ] `AGENTS.md` template seeded on first run; file not overwritten if already present
- [ ] `src/shared/memoryTypes.ts` — no `any` types
- [ ] `src/shared/memorySchemas.ts` — Zod schema covers all fields of every type
