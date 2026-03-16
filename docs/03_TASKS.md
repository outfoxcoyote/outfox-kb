# 03_TASKS.md — Implementation Task List
**Outfox KB — v2**
*Last updated: 2026-03-15*

---

## Pre-Phase Checklist

Before beginning any phase:

- [ ] Supabase `outfox-kb` project exists and is accessible
- [ ] pgvector extension enabled (Supabase dashboard → Database → Extensions)
- [ ] GitHub repository initialized
- [ ] Python 3.10+ available on local machine
- [ ] `.env` file created with all required secrets (see `02_ARCHITECTURE.md`)

---

## Phase 0 — Teardown + Schema Setup

**Goal**: Clean repo state. Supabase schema matches `01_SCHEMA.md` exactly.

### Teardown
- [ ] Delete `intake/index.html`, `intake/style.css`, `intake/app.js`, `intake/config.js`, `intake/config.example.js` (full codebase teardown — v1 intake is deprecated)
- [ ] Delete existing root-level docs: `00_PRD.md`, `01_SCHEMA.md`, `02_ARCHITECTURE.md`, `03_TASKS.md` (replaced by `docs/` versions)
- [ ] Create `docs/` folder (done when new docs are written)
- [ ] Create `content/README.md` with pilot content loading instructions

### Supabase Schema
- [ ] Run schema DDL from `01_SCHEMA.md` in Supabase SQL editor (add all new columns: `section_label`, `chunk_index`, `chunk_strategy`, `token_count`, `is_distilled`, `client_id`)
- [ ] If `documents` table already exists with v1 schema: add new columns via `ALTER TABLE` (preserves existing rows)
- [ ] Verify ivfflat index exists on `embedding` column
- [ ] Confirm all column types match `01_SCHEMA.md`

**GATE**: Supabase `documents` table schema exactly matches `01_SCHEMA.md`. All new columns present. Index confirmed in Supabase dashboard.

---

## Phase 1 — Dynamic Chunking Pipeline

**Goal**: A working format detector and all chunker functions producing correctly labeled chunks.
**No API keys required for this phase** — chunker is pure Python.

### detector.py
- [ ] `detect_format(filename: str, text: str | None) -> str`
  - Check file extension: `.csv` → `'csv'`; `.pdf` → `'pdf'`
  - Check content for Q&A markers (`Q:`, `A:`, `Question:`, `Answer:`) → `'faq'`
  - Check content for speaker-turn markers (`Speaker:`, `[Name]:`, regex `^[A-Z][a-z]+:`) → `'transcript'`
  - Check content for Markdown headers (`# `, `## `) → `'markdown'`
  - Default (plain prose) → `'plaintext'`

### chunker.py
- [ ] `route_and_chunk(text: str, format: str, title: str) -> list[dict]` — main router function
- [ ] `recursive_chunk(text, chunk_size=500, overlap=75)` — tiktoken `cl100k_base`; try paragraph → sentence boundaries; produces `chunk_strategy: 'recursive'`
- [ ] `document_aware_chunk(text)` — split at `# ` / `## ` headers; store header as `section_label`; recursive within each section; produces `chunk_strategy: 'document-aware'`
- [ ] `pair_preserving_chunk(text)` — detect Q/A pairs; each pair is one atomic chunk; produces `chunk_strategy: 'pair-preserving'`
- [ ] `row_level_chunk(csv_text)` — parse with `pandas`; one row per chunk (stringify all fields); produces `chunk_strategy: 'row-level'`
- [ ] `speaker_turn_chunk(text)` — split at speaker markers; merge consecutive turns under 100 tokens; produces `chunk_strategy: 'speaker-turn'`
- [ ] All functions output list of: `{text, section_label, chunk_index, chunk_strategy, token_count}`

**GATE**: Write a test script that processes one sample file of each format (plaintext, markdown, faq, csv, transcript). Print each chunk with its `chunk_index`, `chunk_strategy`, `section_label`, and `token_count`. Verify:
- Correct strategy assigned per format
- No chunks over ~600 tokens
- FAQ chunks contain both Q and A
- CSV chunks contain stringified row data
- Transcript chunks do not split mid-speaker-turn

---

## Phase 2 — Embedding + Supabase Write

**Goal**: Full ingestion pipeline running end-to-end from JSON handoff to Supabase rows.
**Requires**: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### pipeline/requirements.txt
- [ ] Create with: `openai`, `supabase`, `python-dotenv`, `tiktoken`, `pypdf`, `pandas`

### embedder.py
- [ ] `embed_chunk(text: str) -> list[float]`
  - POST to OpenAI Embeddings API (`text-embedding-3-small`, 1536 dims)
  - Retry on 429: exponential backoff 2s → 4s → 8s (max 3 attempts)
  - Raise on non-429 errors after logging

### supabase_client.py
- [ ] `delete_by_title(title: str)` — delete all rows where `title = title` (deduplication)
- [ ] `insert_chunk(row: dict)` — insert one chunk row; raise on error

### ingest.py
- [ ] `load_dotenv()` — load `.env`
- [ ] Parse `--input` argument (path to handoff JSON)
- [ ] Read and validate JSON: `title` required; `content` or `pdf_b64` required
- [ ] If `pdf_b64`: decode base64 → `pypdf.PdfReader` → extract text
- [ ] Log: `"Starting ingestion: [title]"`
- [ ] Call `detect_format(filename, text)` to get format string
- [ ] Call `route_and_chunk(text, format, title)` → list of chunk dicts
- [ ] Log: `"Chunking complete: [title] — [N] chunks via [strategy]"`
- [ ] Call `delete_by_title(title)` (deduplication)
- [ ] For each chunk:
  - Call `embed_chunk(text)` → embedding vector
  - Build full row dict with all metadata fields (including `client_id: None`)
  - Call `insert_chunk(row)`
  - Log: `"Stored chunk [i+1]/[N]: [title]"`
  - On error: log error, increment error counter, continue
- [ ] Final log: `"Ingestion complete: [title] — [N] chunks via [strategy], [M] errors"`

**GATE**: Run `python pipeline/ingest.py --input sample.json` on a 1,000+ word document. Verify:
- Row count in Supabase matches expected chunk count
- `embedding` column is populated (not null) on all rows
- `chunk_strategy`, `section_label`, `chunk_index`, `token_count` columns populated
- Re-run same document → same row count (deduplication works)

---

## Phase 3 — Pipeline Validation on Real Content

**Goal**: Confirm retrieval quality on actual Outfox content before building any UI.
**Requires**: All Phase 2 keys + Supabase dashboard access

- [ ] Identify 3–5 real Outfox documents covering at least 3 different formats (PDF, Markdown/text, FAQ or transcript, optional CSV)
- [ ] Ingest each via `ingest.py`; inspect resulting rows in Supabase dashboard
  - Verify `section_label` populated for structured docs
  - Verify `chunk_strategy` is correct per format
  - Verify no chunks are obviously malformed (truncated sentences, encoding artifacts)
- [ ] Write 5 representative test questions that a user would actually ask:
  - Example: "What is our recommended chunking strategy for FAQ documents?"
  - Example: "How have we priced past real estate KB engagements?"
  - Example: "What was the outcome of the [X] case study?"
- [ ] For each test question: manually embed + query via Supabase SQL editor (`SELECT` with RPC call); inspect which chunks are returned and their similarity scores
- [ ] Adjust if retrieval quality is poor:
  - If wrong chunks return: examine `chunk_strategy` — may need detector tuning
  - If threshold is too strict (no results): lower `match_threshold` to 0.2 and retest
  - If chunks are too large (answer diluted): reduce `chunk_size` in recursive chunker

**GATE**: At least 4 of 5 test questions return the expected chunk as the top-1 or top-3 result. No test question returns a clearly irrelevant chunk as the top result.

> **Do not proceed to UI phases until this gate passes.** Chunking quality determines everything downstream.

---

## Phase 4 — Intake Form (Rebuilt)

**Goal**: Working intake form with Outfox POC fields, Claude distillation, and handoff JSON download.
**Requires**: `ANTHROPIC_API_KEY` (via `intake/config.js`)

### intake/config.example.js
- [ ] Create template with `ANTHROPIC_API_KEY` placeholder and clear comment

### intake/index.html
- [ ] Sticky header: Outfox logo + "Knowledge Base — Document Intake"
- [ ] **Document section**: `title` (required text input)
- [ ] **Metadata section**: `doc_type` (select — all 6 values from `01_SCHEMA.md`), `category`, `subcategory`, `industry`, `source` (all optional)
- [ ] **Content section**: textarea (paste) + file upload zone (`.txt`, `.md`, `.pdf`, `.csv`, max 10MB) — mutually exclusive
- [ ] **Processing mode**: "Distill First" / "Direct to Chunking" radio toggle
- [ ] **Preview section** (hidden until submit): readonly textarea + badge + "Back" + "Download for Ingestion" buttons

### intake/style.css
- [ ] Outfox brand colors: primary `#e87722` (amber), header `#1a1f2e` (deep navy)
- [ ] Centered form, max-width 700px
- [ ] Responsive (mobile at 540px)
- [ ] Error states: red border + message
- [ ] File upload zone with drag-and-drop styling
- [ ] Mode toggle as two-card grid (selected: amber border + light orange background)
- [ ] Loading state: spinner on submit button

### intake/app.js
- [ ] State: `{ fileData: {name, type, text|b64}, isDistill: bool, distilledText: str }`
- [ ] Validation: title required; content required (textarea XOR file)
- [ ] File handling: `.txt`/`.md`/`.csv` → FileReader as text; `.pdf` → FileReader as ArrayBuffer → base64; auto-set Direct mode for PDF
- [ ] Mutual exclusion: typing in textarea disables file input; loading file disables textarea
- [ ] Character count display for textarea
- [ ] `callClaude(rawContent)` → POST to Anthropic (Contract A); handle 429 + 4xx/5xx
- [ ] Loading state on submit (disable button, show spinner)
- [ ] Preview display: show content in readonly textarea + badge ("Distilled by Claude" or "Direct — as submitted" or "PDF — text extracted during ingestion")
- [ ] `buildHandoffPayload(content)` → assemble JSON with all metadata fields, `is_distilled` bool, `client_id: null`
- [ ] `downloadHandoff(payload)` → Blob download with correct filename pattern
- [ ] Form submit orchestration:
  - If Direct or PDF: skip Claude, show preview
  - If Distill + text: call Claude → show preview
  - In both cases: "Download for Ingestion" button triggers download

**GATE**: Form renders. Validation works (title required, content required). PDF handled as base64 + auto-Direct. CSV accepted. Distill path calls Claude + shows preview. Direct path skips Claude. Download produces valid JSON matching expected schema.

---

## Phase 5 — Chat Interface + RAG

**Goal**: Working question-answer interface backed by Supabase + Claude.
**Requires**: All four browser-side keys

### Supabase: RPC + RLS Setup
- [ ] Run `match_documents` function DDL from `01_SCHEMA.md` in Supabase SQL editor
- [ ] Enable RLS on `documents` table
- [ ] Create anon SELECT policy (see `01_SCHEMA.md`)

### chat/config.example.js
- [ ] Create template with all four key placeholders

### chat/index.html
- [ ] Header: Outfox branding
- [ ] Question input (textarea or text input) + submit button
- [ ] Loading state indicator
- [ ] Answer display area
- [ ] Sources display area (hidden until results exist)

### chat/style.css
- [ ] Consistent with intake branding
- [ ] Answer and Sources sections visually distinct
- [ ] Responsive

### chat/app.js
- [ ] `embedQuery(question: string) -> Float32Array` — OpenAI Embeddings API (Contract B)
- [ ] `searchDocuments(embedding) -> chunk[]` — Supabase RPC (Contract C); handle empty array
- [ ] `generateAnswer(question: string, chunks: chunk[]) -> string` — Claude API (Contract E)
- [ ] **Orchestration**:
  1. Validate: non-empty question
  2. Show loading state
  3. `embedQuery` → vector
  4. `searchDocuments` → chunks
  5. If `chunks.length === 0`: display "No relevant documents found in the Outfox KB" → stop
  6. `generateAnswer` → answer text
  7. Render answer
  8. Render sources (see Phase 6)
  9. Hide loading state

**GATE**: Ask a question about an ingested document → answer appears, grounded in retrieved chunks. Ask an off-topic question → "No relevant documents found in the Outfox KB". No errors in browser console.

---

## Phase 6 — Source Citations

**Goal**: Accurate, well-formatted source citations below every answer.
**No new credentials required.**

- [ ] Deduplicate citations by `title` (multiple chunks from same doc → one citation)
- [ ] Per citation: `title` (bold), `doc_type`, `category`, `section_label` (if populated)
- [ ] If `source` field starts with `http`: render `title` as clickable `<a>` link to that URL
- [ ] "No relevant documents found" case shows no sources section
- [ ] Citations appear after the answer, clearly labeled "Sources"

**GATE**: Ask a question that retrieves multiple chunks from 2 different documents → 2 citations (not 4+). Ask nonsense question → "No relevant documents found", no sources section.

---

## Phase 7 — Load All Pilot Content

**Goal**: Outfox KB seeded with the full set of pilot demo content. Ready to query across all content types.

- [ ] Review `content/README.md` for current content inventory
- [ ] Ingest all Outfox demo documents:
  - [ ] Market intelligence doc(s) (`doc_type: 'market-intelligence'`)
  - [ ] Methodology / framework docs (`doc_type: 'methodology'`)
  - [ ] Case studies, anonymized as needed (`doc_type: 'case-study'`)
  - [ ] SOPs (`doc_type: 'sop'`)
  - [ ] Any relevant transcripts (`doc_type: 'transcript'`)
- [ ] For each document: confirm rows appear in Supabase with correct metadata
- [ ] Run 10 representative queries across all content types:
  - At least 2 per `doc_type`
  - At least 1 cross-document query (answer spans multiple docs)
  - At least 1 edge case (very specific question, very broad question)
- [ ] Note any retrieval gaps — adjust metadata, re-ingest, or tune `match_threshold` as needed

**GATE**: All content types represented in Supabase. 8 of 10 test queries return relevant results. Cross-document query works. KB is ready for a live demo.

---

## Phase 8 — QA + Demo Polish

**Goal**: All edge cases pass. Demo flow is clean and presentable in 5 minutes.

### Intake Edge Cases
- [ ] Empty title → error shown, form not submitted
- [ ] No content (no text, no file) → error shown
- [ ] Invalid file type (e.g., `.docx`) → error shown with allowed types listed
- [ ] File over 10 MB → error shown with size limit
- [ ] Optional metadata fields all empty → form submits, JSON `null` for optional fields
- [ ] 50,000+ character paste → handles without crash

### Pipeline Edge Cases
- [ ] Missing `--input` argument → helpful error message
- [ ] JSON missing `title` → validation error
- [ ] JSON missing both `content` and `pdf_b64` → validation error
- [ ] Missing `OPENAI_API_KEY` in `.env` → clear error, not a stack trace
- [ ] Re-ingesting same document → row count unchanged (deduplication)

### Chat Edge Cases
- [ ] Empty question → submit disabled or error shown
- [ ] Question about topic not in KB → "No relevant documents found in the Outfox KB"
- [ ] Very long question (500+ chars) → handles without error

### Demo Polish
- [ ] Intake form: smooth experience top to bottom; no UI jank
- [ ] Chat: clean, professional presentation; answer renders clearly
- [ ] Test the full live demo flow: ingest a doc → query it → show source citation → explain the process

**GATE**: All edge cases pass manual verification. Full demo flow runs cleanly in under 5 minutes.

---

## Phase 9 — Deploy

**Goal**: Both apps live on Vercel. End-to-end test passes on production URLs.
**Requires**: Vercel account, GitHub repo connected

### Pre-Deploy Checklist
- [ ] `grep -r "sk-" intake/ chat/` → zero hits (no hardcoded API keys)
- [ ] Confirm `.env` and `config.js` are in `.gitignore`
- [ ] Phase 8 gate passed

### Intake App
- [ ] Create Vercel project, connect GitHub repo, set root directory: `intake/`
- [ ] No build step required
- [ ] Resolve Vercel env var injection for `ANTHROPIC_API_KEY`:
  - Option A: Build-time substitution via `vercel.json` (document chosen approach)
  - Option B: Vercel Edge Config fetch at page load
- [ ] Deploy → verify intake form loads and functions correctly on production URL

### Chat App
- [ ] Create Vercel project, connect GitHub repo, set root directory: `chat/`
- [ ] No build step required
- [ ] Set all four env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- [ ] Deploy → verify chat loads and queries return results on production URL

### End-to-End Test
- [ ] Ingest a new document via production intake URL
- [ ] Query for content from that document via production chat URL
- [ ] Confirm answer appears with source citation
- [ ] Confirm `intake/config.js` was not committed to git

**GATE**: Both apps live on Vercel production URLs. E2E test passes. No secrets committed.

---

## Post-MVP (Deferred — Phase 2+)

| Item | When to Add |
|---|---|
| Intake form authentication | When a second operator needs access or URL becomes less private |
| Hybrid search (vector + keyword) | When retrieval quality misses verbatim queries |
| Reranking / diversity filters | When retrieval returns redundant chunks |
| Batch ingest | When adding large volumes of content |
| OCR for scanned PDFs | When scanned documents are in the content inventory |
| n8n spoke integrations | After hub is stable and delivering daily value |
| Multi-tenant client_id isolation | Before first client KB deployment |
| `doc_type` CHECK constraint | After pilot content is fully loaded and vocab is stable |
| Full-text search index | As a complement to vector search |
