# 03_TASKS.md — Implementation Checklist
> Outfox Knowledge Base — master build checklist. Phases must be completed in order. Do not begin a phase until its GATE condition is verified. Commit to GitHub after completing each phase.

**Credential flag key:** 🔑 = requires a live API key or Supabase access to complete

---

## Phase Gate Policy

Each phase ends with a GATE. The GATE is a specific, verifiable test. The next phase does not begin until the GATE passes. If a GATE cannot be verified (e.g., missing credential), document the blocker and stop.

---

## Pre-Phase Setup

One-time setup tasks before any phase begins.

- [ ] Confirm Supabase project `outfox-kb` is accessible in the Supabase dashboard 🔑
- [ ] Confirm `vector` extension is enabled (`Database → Extensions → vector`)
- [ ] Confirm `documents` table exists with all fields matching [01_SCHEMA.md](01_SCHEMA.md)
- [ ] Confirm ivfflat index exists on the `embedding` column (`Database → Indexes`)
- [ ] ⚠️ Verify `embedding` column has NOT NULL constraint (see [01_SCHEMA.md](01_SCHEMA.md) flag)
- [ ] ⚠️ Record the actual `lists` value on the ivfflat index; update [01_SCHEMA.md](01_SCHEMA.md) if it differs from 100
- [ ] Create `.env` file in project root with all required secrets (do not commit)
- [ ] Confirm `.env` is present in `.gitignore`
- [ ] Create GitHub repository for the project
- [ ] Push initial commit (CLAUDE.md + PRD docs only)
- [ ] Read [01_SCHEMA.md](01_SCHEMA.md) and [02_ARCHITECTURE.md](02_ARCHITECTURE.md) in full before writing any code

---

## Phase 1 — Intake Form (Frontend)

No API calls. No credentials required.

**GATE:** Render the form in a browser. (1) All fields display. (2) Submit with no title → inline error appears. (3) Upload a `.txt` file → content is read and character count shown. (4) Upload a `.pdf` → accepted at the file input (no parsing yet). (5) Toggle between "Distill First" and "Direct" → state tracked in JS.

### Form Structure (intake/index.html)

- [ ] Create `intake/index.html`
- [ ] Add `title` field — text input, required, labeled "Document Title"
- [ ] Add `category` field — `<select>` dropdown, optional; include a blank placeholder option
- [ ] Add `subcategory` field — text input, optional
- [ ] Add `industry` field — text input, optional
- [ ] Add `doc_type` field — `<select>` with options: transcript, SOP, reference, case study; optional
- [ ] Add `source` field — text input, optional (URL or reference)
- [ ] Add content textarea — for text paste; labeled "Paste document text"
- [ ] Add file upload input — `accept=".txt,.md,.pdf"`
- [ ] Add distill toggle — two radio buttons or a toggle switch labeled "Distill First" / "Direct to Chunking"
- [ ] Add submit button — labeled "Process Document"

### Styling (intake/style.css)

- [ ] Create `intake/style.css`
- [ ] Basic layout: form centered, max-width ~700px, readable on desktop
- [ ] Style required field indicator on title
- [ ] Style submit button
- [ ] Style inline error messages (red, below field)

### Form Logic (intake/app.js)

- [ ] Create `intake/app.js`
- [ ] Validate title on submit — block and show inline error if empty
- [ ] Validate content on submit — block if both textarea and file upload are empty
- [ ] Validate file type on file selection — reject files not matching `.txt`, `.md`, `.pdf`; show inline error
- [ ] Validate file size on file selection — reject files over 10MB; show inline error
- [ ] FileReader logic — on `.txt`/`.md` file selection, read file as text and store in JS variable; display character count
- [ ] For `.pdf` uploads — read file as ArrayBuffer; convert to base64; store for handoff (no text extraction in browser)
- [ ] Mutual exclusion — disable textarea when a file is loaded; clear file input when textarea has content
- [ ] Track distill toggle state — store as `isDistill` boolean in JS

---

## Phase 2 — Distillation Pipeline (Claude API)

🔑 Requires `ANTHROPIC_API_KEY` accessible in the browser.

**GATE:** (1) Submit a paragraph of messy text with "Distill First" selected → a Claude API call is made (verify in browser network tab) → structured output appears in the preview textarea. (2) Submit the same text with "Direct" → no Claude call is made → JSON download triggers immediately.

### Distillation Prompt

- [ ] Draft the distillation system prompt — submit for approval before finalizing (per CLAUDE.md)
- [ ] Define the prompt as a named constant in `app.js` (or `intake/prompts.js`), clearly commented

### Claude API Call (intake/app.js)

- [ ] Implement `callClaude(rawContent)` async function
- [ ] Set headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- [ ] Build request body: model `claude-sonnet-4-6`, `max_tokens: 4096`, system prompt, user message with raw content
- [ ] Extract `response.content[0].text` from response
- [ ] Handle 429 — display: "Request limit reached, please try again in a moment"
- [ ] Handle 400/500 — display: "Claude API error ([status]), please try again"

### Handoff and Preview (intake/app.js)

- [ ] After distillation, display result in a readonly `<textarea>` labeled "Distilled Preview"
- [ ] Add "Download for Ingestion" button (enabled after distillation completes or on Direct path)
- [ ] On button click: assemble handoff JSON object per [02_ARCHITECTURE.md](02_ARCHITECTURE.md) spec
- [ ] Trigger JSON file download: `Blob` → `URL.createObjectURL` → `<a>` click → `revokeObjectURL`
- [ ] Filename convention: `outfox-ingest-[title-slug]-[timestamp].json`

### Path B (Direct)

- [ ] If toggle is "Direct": skip `callClaude()` entirely; set `is_distilled: false` in the JSON
- [ ] Assemble and download JSON immediately on submit (after validation passes)

---

## Phase 3 — Chunking and Embedding Pipeline (Python)

🔑 Requires `OPENAI_API_KEY` in `pipeline/.env`.

**GATE:** Run `python pipeline/ingest.py --input sample.json` where `sample.json` contains a text document of at least 600 tokens. (1) Chunks are printed to the terminal with token counts. (2) Each chunk produces a vector of exactly 1536 values (printed to terminal — first 5 values). (3) No Supabase rows are written.

### Environment Setup

- [ ] Create `pipeline/requirements.txt` — contents: `openai`, `supabase`, `python-dotenv`, `tiktoken`, `pypdf`
- [ ] Run `pip install -r pipeline/requirements.txt`
- [ ] Create `pipeline/.env` with `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Confirm `pipeline/.env` is covered by `.gitignore`

### chunker.py

- [ ] Create `pipeline/chunker.py`
- [ ] Import tiktoken; load `cl100k_base` encoding
- [ ] Implement `chunk_text(text, chunk_size=500, overlap=50) → list[str]`
- [ ] Encode full text to tokens; slice with sliding window; decode each slice back to string
- [ ] Log: `"Chunking complete: [N] chunks created"`
- [ ] Manual test: feed a known ~1,100-token text; confirm 3 chunks with correct overlap

### embedder.py

- [ ] Create `pipeline/embedder.py`
- [ ] Load `OPENAI_API_KEY` from environment
- [ ] Implement `embed_chunk(text) → list[float]`
- [ ] Call `client.embeddings.create(model="text-embedding-3-small", input=text)`
- [ ] Return `response.data[0].embedding` as a plain Python list
- [ ] Validate length == 1536 before returning; raise ValueError if not
- [ ] Implement retry on 429: wait 2s → 4s → 8s; raise after 3 failures
- [ ] Log: `"Embedding chunk [i+1]/[N]"`

### ingest.py (Phase 3 skeleton)

- [ ] Create `pipeline/ingest.py`
- [ ] Load `.env`
- [ ] Parse `--input` argument (path to JSON file); exit with message if missing
- [ ] Read and parse JSON file; validate `title` present and `content` or `pdf_b64` present
- [ ] If `pdf_b64`: decode base64, extract text via `pypdf.PdfReader`; assign to `content`
- [ ] Log: `"Starting ingestion: [title]"`
- [ ] Call `chunk_text(content)`; log chunk count
- [ ] For each chunk: call `embed_chunk(text)`; **print** chunk index and first 5 embedding values (no Supabase write yet)

---

## Phase 4 — Supabase Write Integration

🔑 Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `pipeline/.env`.

**GATE:** Run `ingest.py` on a real text document (at least 1,000 words). Open Supabase Table Editor. (1) Row count matches expected chunk count. (2) `embedding` column shows a populated vector (not null). (3) `title`, `content`, `created_at` are all correctly set. (4) Re-run the script on the same JSON — row count stays the same (deduplication working).

### supabase_client.py

- [ ] Create `pipeline/supabase_client.py`
- [ ] Load `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from environment
- [ ] Initialize Supabase client
- [ ] Implement `delete_by_title(title: str)` — deletes all rows where `title` matches; log count deleted
- [ ] Implement `insert_chunk(title, content, embedding, category, subcategory, industry, doc_type, source)` — builds row dict, inserts via `supabase.table('documents').insert(row).execute()`; returns True on success, False on failure; logs error on failure
- [ ] Omit None-valued optional fields from the row dict rather than passing explicit null (safest approach with Supabase REST)

### ingest.py (Phase 4 update)

- [ ] Import `delete_by_title` and `insert_chunk` from `supabase_client.py`
- [ ] Before inserting: call `delete_by_title(title)`
- [ ] Replace print-only embedding output with `insert_chunk(...)` calls
- [ ] Track error count; continue on individual chunk failure
- [ ] Final log: `"Ingestion complete: [title] — [N] chunks stored, [M] errors"`

---

## Phase 5 — Query Interface (Claude API + Similarity Search)

🔑 Requires all four secrets. Requires Supabase dashboard access to create the RPC function.

**GATE:** (1) Type a question about a document ingested in Phase 4 → answer appears in the chat UI that is clearly grounded in the ingested content. (2) Verify in browser network tab: OpenAI embedding call made, Supabase RPC call made, Claude call made.

### Supabase RPC Function

- [ ] Open Supabase SQL editor
- [ ] Create the `match_documents` function per [01_SCHEMA.md](01_SCHEMA.md) SQL definition 🔑
- [ ] Test the function directly in the SQL editor with a hardcoded `array_fill(0, ARRAY[1536])::vector` — confirm it returns rows without error

### RLS Setup

- [ ] Enable RLS on `documents` table: `ALTER TABLE documents ENABLE ROW LEVEL SECURITY;` 🔑
- [ ] Create anon read policy per [01_SCHEMA.md](01_SCHEMA.md) SQL definition
- [ ] Confirm the Python script (service role key) can still insert after RLS is enabled

### Chat App Structure

- [ ] Create `chat/index.html` — question input, submit button, answer display area, sources section placeholder
- [ ] Create `chat/style.css` — minimal layout; answer and sources visually distinct
- [ ] Create `chat/app.js`

### Query Embedding (chat/app.js)

- [ ] Implement `embedQuery(questionText) → float[]`
- [ ] Call OpenAI Embeddings API (`text-embedding-3-small`) per [02_ARCHITECTURE.md](02_ARCHITECTURE.md) Contract B
- [ ] Return 1536-dimension vector

### Similarity Search (chat/app.js)

- [ ] Initialize Supabase client with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- [ ] Implement `searchDocuments(queryEmbedding) → chunk[]`
- [ ] Call `supabase.rpc('match_documents', { query_embedding, match_count: 5, match_threshold: 0.3 })`
- [ ] Return array of chunk objects; return empty array on error

### Answer Generation (chat/app.js)

- [ ] Implement `generateAnswer(question, chunks) → string`
- [ ] Assemble context string from chunks' `content` fields
- [ ] Build Claude API request per [02_ARCHITECTURE.md](02_ARCHITECTURE.md) Contract E
- [ ] Return answer text

### Chat Flow Orchestration (chat/app.js)

- [ ] On submit: validate question is not empty
- [ ] Call `embedQuery` → `searchDocuments` → check results
- [ ] If zero results: display "No relevant documents found in the knowledge base" — stop
- [ ] If results: call `generateAnswer` → display answer
- [ ] Show loading indicator during API calls; hide on completion or error

---

## Phase 6 — Source Citation Rendering

**GATE:** (1) Submit a question that returns results → "Sources" section appears below the answer with at least one citation showing title, doc_type, and category. (2) Submit a nonsense question → "No relevant documents found" message appears; no sources section.

- [ ] Confirm `match_documents` RPC returns `title`, `doc_type`, `category`, `source` fields
- [ ] After answer is displayed: render a "Sources" section below the answer
- [ ] Deduplicate citations by `title` — if multiple chunks from the same document, show it once
- [ ] For each unique source: display `title`, `doc_type` (if not null), `category` (if not null)
- [ ] Style source block as visually distinct (smaller text, muted color, or bordered box)
- [ ] If `source` field contains a URL (starts with `http`): render as a clickable link
- [ ] Ensure "No relevant documents found" case shows no sources section

---

## Phase 7 — QA and Edge Case Hardening

**GATE:** Every item in the checklist below passes manual verification.

### Intake Form

- [ ] Submit with empty title → blocked; inline error shown
- [ ] Submit with no content and no file → blocked; inline error shown
- [ ] Upload a `.docx` or `.exe` file → rejected at selection; error shown
- [ ] Upload a file over 10MB → rejected; error shown
- [ ] Upload a valid `.pdf` → accepted; character count or "PDF loaded" indicator shown
- [ ] Paste 50,000 characters of text → no UI freeze; character count shown
- [ ] Submit with all optional fields empty → no errors; JSON downloads correctly with null values for optional fields

### Distillation (Path A)

- [ ] Submit already-clean structured content with "Distill First" → Claude returns reasonable output (not degraded)
- [ ] Submit a single sentence with "Distill First" → no crash; output returned
- [ ] Simulate 429 response (temporarily use an invalid API key, or disconnect network after call starts) → user sees rate limit message, not a crash or blank screen

### Python Script

- [ ] Run with a JSON file that has no `content` and no `pdf_b64` → script exits with clear error message
- [ ] Run without specifying `--input` → script exits with clear error message
- [ ] Run with `OPENAI_API_KEY` missing from `.env` → descriptive error printed, not an unhandled exception
- [ ] Ingest a document with exactly 550 tokens → produces 2 chunks (0–500 and 450–550)
- [ ] Ingest same document twice → second run deletes first set of rows and inserts fresh; final row count equals chunk count (not double)

### Query Interface

- [ ] Submit empty question → blocked; error or disabled state shown
- [ ] Submit a question about a topic not in the KB → "No relevant documents found" message
- [ ] Submit a very long question (1,000+ characters) → handled gracefully (embedded and searched without crash)
- [ ] Open chat app when zero documents are ingested → "No relevant documents found" for any question

---

## Phase 8 — Deploy

🔑 Requires all four secrets set in Vercel dashboard. Requires Vercel account and GitHub repo access.

**GATE:** Both apps are live on their Vercel URLs and pass a full end-to-end test: ingest a document via the production intake app → query about it via the production chat app → receive a correct answer with source citation.

### Pre-Deployment Checks

- [ ] Run `grep -r "ANTHROPIC_API_KEY\|OPENAI_API_KEY\|SERVICE_ROLE" intake/ chat/` — confirm no literal key values in source files
- [ ] Confirm `.env` is in `.gitignore` and not tracked by git (`git status` shows no `.env` files)
- [ ] Confirm all Phase 7 QA items are checked off
- [ ] Resolve the Vercel static site environment variable injection approach (see below)

> **Note on environment variables in static sites:** Vercel cannot inject env vars into plain HTML/JS at runtime without a build step. Options: (a) use a Vercel Edge Config that the JS reads at load time; (b) use a minimal `vercel.json` with a build command that substitutes env var placeholders in the JS; (c) hardcode non-sensitive values (like `SUPABASE_URL`) and use Vercel's `__NEXT_PUBLIC_`-style substitution if a minimal build is added. Decide and document the approach before executing deploy tasks.

### Intake App Deployment

- [ ] Create Vercel project connected to GitHub repo; root directory: `intake/`
- [ ] Set `ANTHROPIC_API_KEY` in Vercel project environment variables
- [ ] Deploy; confirm intake form loads at Vercel URL
- [ ] Test end-to-end: submit a document → JSON downloads → run Python script → rows appear in Supabase

### Chat App Deployment

- [ ] Create Vercel project connected to GitHub repo; root directory: `chat/`
- [ ] Set `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` in Vercel project env vars
- [ ] Deploy; confirm chat interface loads at Vercel URL
- [ ] Test: submit a question about a previously ingested document → answer returns with citations

### Post-Deploy

- [ ] Update CLAUDE.md Build Status section with both Vercel URLs
- [ ] Commit and push final state of repository

---

## Deferred / Post-MVP

Not in scope for this build. Tracked here for future planning.

- [ ] n8n automation spokes for batch or scheduled ingestion
- [ ] Tier 2 export — generate focused context documents from the KB for seeding Claude Projects
- [ ] Authentication layer for the intake form (currently open to anyone with the URL)
- [ ] Category/industry filter controls in the chat interface (hybrid filter + vector search)
- [ ] Admin interface — view, delete, or re-embed stored documents
- [ ] Batch ingest mode — Python script accepts a folder of JSON files
- [ ] OCR support for scanned PDF documents
- [ ] Similarity threshold UI control in the chat app
- [ ] Automatic `doc_type` detection (Claude infers doc type if not specified at intake)
