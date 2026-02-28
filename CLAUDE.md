# CLAUDE.md — Outfox Knowledge Base
> Agent operating instructions. Read this file before doing anything else.

---

## Identity of This Project
This is the Outfox Consulting internal AI-powered knowledge base. A web form accepts raw documents (text paste, PDF, markdown, txt), processes them through optional Claude distillation, chunks and embeds them via OpenAI, and stores them in Supabase pgvector. A Claude API-powered chat interface queries the knowledge base and returns answers with source citations. This is the **Global Interface — Tier 1** of a two-tier system. Claude Projects (Tier 2) are seeded by focused context documents exported from here.

---

## Read These First
Before writing any code, read and internalize:
1. `01_SCHEMA.md` — Supabase table structure, vector index, field definitions
2. `02_ARCHITECTURE.md` — data flow, chunking strategy, embedding model, API contracts
3. `03_TASKS.md` — feature list and implementation checklist

If these files do not exist, stop and ask before proceeding.

---

## System Architecture

| Layer | Tool |
|---|---|
| Web form (file upload + text paste) | HTML/JS frontend |
| Distillation (optional) | Claude API |
| Chunking + Embedding | Python — OpenAI `text-embedding-3-small` |
| Storage | Supabase pgvector |
| Query + Response | Claude API |
| Automation spokes (later) | n8n |

---

## Supabase — Current State
- Project: `outfox-kb`
- pgvector: enabled
- Table: `documents`
- Fields: `id, title, content, embedding (vector 1536), category, subcategory, industry, doc_type, source, created_at`
- Index: `ivfflat` on embedding column, cosine ops
- Status: **Complete**

---

## Core Rules

### Never Do Without Approval
- Do NOT alter the `documents` table schema without explicit instruction — downstream embeddings and queries depend on it
- Do NOT switch embedding models — `text-embedding-3-small` (1536 dimensions) is locked; changing it invalidates all stored vectors
- Do NOT change the chunking strategy mid-build without re-embedding all existing documents
- Do NOT store API keys, Supabase URLs, or service_role keys in any committed file
- Do NOT modify the distillation prompt without approval — output quality directly affects retrieval accuracy
- Do NOT add authentication layers not specified in the task document
- Do NOT mix distilled and raw content in the same document record — each record is one or the other

### Always Do
- Load credentials exclusively from environment variables or a gitignored `.env` file
- Validate file type and size before processing — reject unsupported formats early
- Log chunking and embedding operations with document title and chunk count
- Comment all chunking, embedding, and query logic clearly
- Read all available PRD docs before touching any file
- Follow the task checklist — complete each phase before starting the next
- Commit to GitHub after completing each phase

### Secrets and Credentials
Required at runtime — never commit:
- `OPENAI_API_KEY` — used for embeddings
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — write access to `documents` table
- `ANTHROPIC_API_KEY` — used for distillation and chat query

All secrets live in `.env` — gitignored. Never move into any committed file.

---

## Ingestion Pipeline

### Two Paths

**Path A — Distill First (raw transcripts, messy input)**
1. User pastes or uploads raw content
2. Claude API reads it, structures and summarizes into clean document
3. Distilled output is chunked → embedded → stored

**Path B — Direct (clean content)**
1. User pastes or uploads clean content
2. Skip distillation
3. Content is chunked → embedded → stored directly

User selects path via toggle on the intake form.

### Form Fields
- `title` (required, text)
- `category` (optional, dropdown)
- `subcategory` (optional, text)
- `industry` (optional, text)
- `doc_type` (optional, dropdown — e.g., transcript, SOP, reference, case study)
- `source` (optional, text)
- Content input: text paste window OR file upload (PDF, markdown, txt)
- Distill toggle: Distill First / Direct to Chunking

---

## Query Interface
- User submits a natural language question
- System generates embedding of the query via OpenAI
- Cosine similarity search against `documents.embedding` in Supabase
- Top N chunks returned as context
- Claude API generates answer grounded in retrieved context
- Response includes source citations (title, doc_type, category)

---

## Chunking Strategy
- Default: ~500 tokens per chunk, 50-token overlap
- Do NOT change without re-embedding all stored documents
- Each chunk stored as its own row in `documents`
- Parent document identity preserved via `title` + `source` fields

---

## Error Handling Protocol
1. Identify file, function, and line number
2. One-sentence cause
3. Propose fix
4. Ask approval if fix touches schema, chunking logic, or embedding pipeline
5. Comment the correction in code
6. Add to Known Issues Resolved if recurring

---

## Known Issues Resolved
*(Populate as issues are encountered and resolved)*

---

## Build Status
- [x] Supabase schema and pgvector index — Complete
- [ ] Phase 1 — Intake form (frontend)
- [ ] Phase 2 — Distillation pipeline (Claude API)
- [ ] Phase 3 — Chunking + embedding pipeline (Python + OpenAI)
- [ ] Phase 4 — Supabase write integration
- [ ] Phase 5 — Query interface (Claude API + similarity search)
- [ ] Phase 6 — Source citation rendering
- [ ] Phase 7 — QA and edge case hardening
- [ ] Phase 8 — Deploy
