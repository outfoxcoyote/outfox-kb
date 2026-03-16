# 00_PRD.md — Product Requirements Document
**Outfox Knowledge Base (Outfox KB) — v2**
*Last updated: 2026-03-15*

---

## Product Purpose

Outfox KB is a production-grade, queryable knowledge base that serves two roles simultaneously:

1. **Primary working tool** — Outfox staff query it daily to retrieve methodology, frameworks, past engagement learnings, market intelligence, and SOPs without relying on memory, colleagues, or scattered files.
2. **Live demo and sales asset** — When pitching KB systems to real estate agents, SMBs, or other clients, this is the working demonstration: "We built this for ourselves using our own knowledge. We'll build one for your business."

These roles are not in conflict. An Outfox KB seeded with authentic, high-value Outfox content is both genuinely useful and genuinely demonstrable.

This project also functions as the **repeatable delivery template** for all future client KB engagements. Every architectural decision here is made with that replication in mind.

---

## Problem

Outfox's institutional knowledge is fragmented and person-dependent:
- Frameworks, approaches, and learnings live in email threads, Google Docs, personal notes, and memory
- Answering "how did we handle X in the Y engagement?" requires tracking down a person or sifting through files
- When pitching KB systems, there is no live, working demonstration — just descriptions
- Every new client engagement requires rebuilding the delivery process from scratch

---

## Users

| User | Role | Interface |
|---|---|---|
| Outfox operator | Adds documents to the KB | Intake form |
| Outfox staff | Queries the KB daily | Chat interface |
| Prospective client | Observes live demo queries during sales calls | Chat interface (read) |

All users are non-engineers. No technical knowledge required to operate the intake form or chat interface. The Python ingestion pipeline is operator-level (CLI with a .env file).

---

## Success Criteria

1. Outfox staff can retrieve any past engagement detail, framework, or SOP using natural language in under 15 seconds.
2. The system returns "No relevant documents found in the Outfox KB" on off-topic queries — zero hallucination.
3. A prospective client can watch a 5-minute live query demo and immediately articulate what value an equivalent system would provide their business.
4. A new client KB engagement can be set up using this project as the template without inventing anything from scratch.
5. The ingestion pipeline is repeatable: any operator can run `python pipeline/ingest.py --input <file.json>` on a clean machine and ingest a new document without additional setup beyond .env configuration.

---

## Content Categories (Outfox KB)

The following document types seed the Outfox KB pilot:

| doc_type | Description | Examples |
|---|---|---|
| `methodology` | Outfox consulting frameworks, delivery approaches, engagement models | Hub-and-spoke model, KB delivery SOP, client discovery framework |
| `market-intelligence` | Market analysis, stack decisions, vertical research, strategy notes | Market intelligence docs, competitive analysis, pricing research |
| `case-study` | Past engagement outputs, learnings, anonymized deliverables | Client KB builds, automation projects, outcome summaries |
| `sop` | How Outfox runs engagements, onboards clients, delivers work | Onboarding checklist, delivery sequence, handoff protocol |
| `transcript` | Meeting notes, call recordings, session transcripts | Discovery call notes, client Q&A sessions |
| `reference` | External research, third-party frameworks, templates | Vendor documentation, industry reports, reference templates |

---

## Functional Requirements

### Intake Form

| ID | Requirement |
|---|---|
| F-01 | Form accepts a document title (required, non-empty) |
| F-02 | Form accepts optional metadata: `category`, `subcategory`, `industry`, `doc_type` (select), `source` |
| F-03 | Form accepts content via text paste OR file upload — mutually exclusive; entering text disables file input and vice versa |
| F-04 | Accepted file types: `.txt`, `.md`, `.pdf`, `.csv` — reject all others with a clear error |
| F-05 | File size limit: 10 MB — reject larger files with a clear error |
| F-06 | Processing mode toggle: "Distill First" or "Direct to Chunking" (radio buttons) |
| F-07 | If "Distill First" selected with text content: call Claude distillation API; display cleaned output in a readonly preview textarea |
| F-08 | User can review and optionally edit the distilled preview before downloading |
| F-09 | "Download for Ingestion" button assembles and downloads a handoff JSON file |
| F-10 | Handoff JSON contains: `title`, `content` (text or null), `pdf_b64` (base64 string or null), `category`, `subcategory`, `industry`, `doc_type`, `source`, `is_distilled` (boolean) |
| F-11 | Handoff filename: `outfox-ingest-[title-slug]-[iso-date].json` |
| F-12 | PDF uploads: read as base64 (Python handles text extraction); automatically set processing mode to "Direct" |
| F-13 | CSV uploads: accepted as text; processing mode remains selectable |

### Ingestion Pipeline

| ID | Requirement |
|---|---|
| F-14 | CLI entry point: `python pipeline/ingest.py --input <file.json>` |
| F-15 | Pipeline validates JSON on load: `title` required; `content` or `pdf_b64` required |
| F-16 | If `pdf_b64` present: decode base64, extract text via `pypdf.PdfReader` |
| F-17 | `detector.py` determines document format from extension, MIME type, and content signature |
| F-18 | Format routing: PDF/structured docs → document-aware chunker |
| F-19 | Format routing: plain text / Markdown / prose → recursive + sentence chunker |
| F-20 | Format routing: FAQ / Q&A files (detected by Q: A: markers) → pair-preserving chunker |
| F-21 | Format routing: CSV / tabular → row-level chunker |
| F-22 | Format routing: transcripts (detected by speaker-turn markers) → speaker-turn chunker |
| F-23 | Each chunk produced includes: `text`, `section_label`, `chunk_index`, `chunk_strategy`, `token_count` |
| F-24 | Chunking uses ~10–15% token overlap at chunk seams (not fixed character overlap) |
| F-25 | Each chunk is embedded via OpenAI `text-embedding-3-small` (1536 dimensions) |
| F-26 | Embedding retries on 429: exponential backoff 2s → 4s → 8s (3 attempts) |
| F-27 | Deduplication: delete all existing rows with the same `title` before inserting new chunks |
| F-28 | Each inserted row includes all metadata: `title`, `content`, `embedding`, `doc_type`, `category`, `subcategory`, `industry`, `source`, `section_label`, `chunk_index`, `chunk_strategy`, `token_count`, `is_distilled`, `client_id` (null) |
| F-29 | Per-chunk errors are logged and skipped — pipeline does not abort on single chunk failure |
| F-30 | Final log line: `"Ingestion complete: [title] — [N] chunks via [strategy], [M] errors"` |

### Chat Interface

| ID | Requirement |
|---|---|
| F-31 | Text input field for natural language question |
| F-32 | On submit: embed question via OpenAI `text-embedding-3-small` |
| F-33 | Vector search via Supabase RPC `match_documents` (top 5 results, threshold 0.3) |
| F-34 | If zero results: display "No relevant documents found in the Outfox KB" — stop; no Claude call |
| F-35 | If results: assemble retrieved chunks as context; call Claude API for answer generation |
| F-36 | Answer is grounded only in retrieved context; Claude is instructed not to use outside knowledge |
| F-37 | Render answer in the chat interface |
| F-38 | Render "Sources" section below answer: one citation per unique `title`, deduplicated |
| F-39 | Each citation shows: `title`, `doc_type`, `category`; `section_label` if populated |
| F-40 | If `source` field is a URL: render as a clickable link |

---

## Out of Scope (v1)

| Item | Status | Notes |
|---|---|---|
| Authentication | Deferred | Intake protected by gitignored `config.js`; chat intentionally open for demos. Intake auth is the #1 Phase 2 hardening item when a second operator needs access. |
| Multi-tenancy | Deferred | Single-tenant (Outfox only). `client_id` column reserved in schema (null for now); future client KBs add it without migration. |
| Spoke tools | Deferred | Architecture is spoke-ready from day one. No spokes built in v1. Extension points documented in `02_ARCHITECTURE.md`. |
| Batch ingest | Deferred | One document per `ingest.py` run. Script can be called in a loop manually. |
| Admin interface | Deferred | Use Supabase dashboard for direct row management. |
| OCR for scanned PDFs | Deferred | `pypdf` extracts text from text-layer PDFs only. Scanned images require OCR preprocessing (e.g., Tesseract). |
| Hybrid search | Deferred | v1 uses vector similarity only. Keyword + reranking is a meaningful quality upgrade for v2. |
| Batch re-embedding | Deferred | Changing the embedding model invalidates all vectors and requires full re-ingestion. |

---

## Non-Functional Requirements

- **Query latency**: End-to-end answer generation (embed → search → generate) completes in ≤15 seconds
- **No backend server**: All API calls made directly from browser (intake, chat) or local Python script — no intermediate server required
- **Static deployment**: Intake and chat are plain HTML/CSS/JS deployed to Vercel with no build step
- **Portability**: The Python pipeline runs on any machine with Python 3.10+, the required packages, and a valid `.env` file
- **Repeatability**: The full pipeline (from raw document to queryable chunk in Supabase) is reproducible by any Outfox operator following the docs
