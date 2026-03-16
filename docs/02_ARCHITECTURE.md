# 02_ARCHITECTURE.md — System Architecture
**Outfox KB — v2**
*Last updated: 2026-03-15*

---

## System Components

| Component | Purpose | Runs On |
|---|---|---|
| Intake App | Accept documents, optionally distill, download handoff JSON | Vercel (static) |
| Chat App | Ask questions, retrieve context, generate answers with citations | Vercel (static) |
| Python Pipeline | Read handoff JSON, detect format, chunk, embed, write to Supabase | Local machine |
| Supabase | pgvector database — single source of truth | Supabase cloud |
| Claude API | Document distillation (intake) + answer generation (chat) | Anthropic cloud |
| OpenAI API | Embeddings only — intake, chat, and pipeline | OpenAI cloud |

---

## File Structure

```
outfox-kb/
├── intake/
│   ├── index.html            # Intake form UI
│   ├── style.css             # Outfox brand styling, responsive
│   ├── app.js                # Validation, FileReader, Claude API, JSON download
│   ├── config.js             # Gitignored — copy from config.example.js
│   └── config.example.js     # Template: ANTHROPIC_API_KEY placeholder
│
├── chat/
│   ├── index.html            # Chat UI
│   ├── style.css             # Minimal layout, answer/sources distinct
│   ├── app.js                # Embed → search → generate → render
│   ├── config.js             # Gitignored — copy from config.example.js
│   └── config.example.js     # Template: all four browser-side keys
│
├── pipeline/
│   ├── ingest.py             # CLI entry point — orchestrates all steps
│   ├── detector.py           # Format detector — routes to chunker
│   ├── chunker.py            # Format router + all chunker functions
│   ├── embedder.py           # OpenAI embedding calls + retry logic
│   ├── supabase_client.py    # Supabase delete + insert operations
│   └── requirements.txt      # Python dependencies
│
├── content/
│   └── README.md             # Instructions for loading Outfox pilot content
│
├── docs/
│   ├── 00_PRD.md
│   ├── 01_SCHEMA.md
│   ├── 02_ARCHITECTURE.md    # This file
│   ├── 03_TASKS.md
│   └── 04_PITCH.md
│
├── # CLAUDE.md               # Project instructions for Claude Code
├── .env                      # Gitignored — Python pipeline secrets
├── .gitignore
└── outfox-kb-market-intelligence.md
```

---

## Dynamic Chunking Pipeline

The #1 quality decision in any KB build. Instead of applying one fixed strategy to all content, the pipeline routes incoming documents to the appropriate chunker based on format detection.

```
Incoming Document (via handoff JSON)
            ↓
     detector.py
     detect_format(text, filename)
     [reads: file extension, MIME type, content signature]
            ↓
     ┌──────── chunker.py router ──────────────────────────────┐
     │                                                          │
     ├── PDF / structured doc       → document_aware_chunk()   │
     │   (headers, sections, lists)                             │
     │                                                          │
     ├── Plain text / Markdown      → recursive_chunk()        │
     │   (prose, notes, reports)                                │
     │                                                          │
     ├── FAQ / Q&A pairs            → pair_preserving_chunk()  │
     │   (Q: A: markers detected)                               │
     │                                                          │
     ├── CSV / tabular              → row_level_chunk()        │
     │   (.csv extension)                                       │
     │                                                          │
     └── Transcript / speaker turns → speaker_turn_chunk()     │
         (Speaker: or [Name]: markers detected)                 │
            ↓
     embedder.py
     embed_chunk(text) → [1536 floats]
            ↓
     supabase_client.py
     delete_by_title(title) → insert_chunk(row)
```

### Chunker Specifications

| Strategy | Function | Target Size | Overlap | Split Logic |
|---|---|---|---|---|
| `recursive` | `recursive_chunk()` | ~500 tokens | ~75 tokens (15%) | Try paragraph → sentence → word boundaries in order |
| `document-aware` | `document_aware_chunk()` | Variable | ~75 tokens at boundaries | Split at `#` / `##` headers; recursive within each section |
| `pair-preserving` | `pair_preserving_chunk()` | 1 Q+A pair | None | Each Q: A: block is one atomic chunk — never split |
| `row-level` | `row_level_chunk()` | 1–5 rows | None | One row per chunk (or small row groups for narrow tables) |
| `speaker-turn` | `speaker_turn_chunk()` | ~300 tokens | None | Split at speaker markers; merge short consecutive turns |

**All chunkers produce a list of dicts:**
```python
{
    'text': str,           # The chunk content
    'section_label': str,  # Header or section name (None if not applicable)
    'chunk_index': int,    # 0-based position within parent doc
    'chunk_strategy': str, # e.g. 'recursive', 'pair-preserving'
    'token_count': int,    # Token count via tiktoken cl100k_base
}
```

---

## API Contracts

### Contract A — Claude Distillation (intake/app.js)

```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: CONFIG.ANTHROPIC_API_KEY
  anthropic-version: 2023-06-01
  anthropic-dangerous-direct-browser-access: true
  content-type: application/json

Body:
  {
    "model": "claude-sonnet-4-6",
    "max_tokens": 4096,
    "system": "[distillation prompt — see below]",
    "messages": [{ "role": "user", "content": rawText }]
  }

Response: response.content[0].text
Errors:
  429 → display "Rate limit reached — wait a moment and try again"
  4xx/5xx → display "API error ([status]) — check your key and try again"
```

**Distillation prompt** (approved — do not modify without explicit review):
```
You are a knowledge management assistant for Outfox Consulting. Your task is to transform
raw document input into a clean, well-structured document suitable for storage in a knowledge base.

Given the raw content, produce a restructured version that:
- Preserves all factual information, names, dates, decisions, and insights without omission or invention
- Organises the content with clear headings and logical sections
- Removes filler, repetition, and transcription artefacts
- Writes in clear, professional prose appropriate for a consulting knowledge base
- Does not add commentary, opinions, or information not present in the source

Return only the cleaned document. No preamble, no closing remarks.
```

---

### Contract B — OpenAI Embeddings (embedder.py + chat/app.js)

```
POST https://api.openai.com/v1/embeddings
Headers:
  Authorization: Bearer OPENAI_API_KEY
  content-type: application/json

Body:
  {
    "model": "text-embedding-3-small",
    "input": "text string to embed"
  }

Response: response.data[0].embedding  →  list of 1536 floats
Retry on 429: exponential backoff 2s → 4s → 8s (3 attempts max)
```

> **Locked**: `text-embedding-3-small` at 1536 dimensions. Changing this model invalidates all stored embeddings and requires full re-ingestion. Do not change without planning a complete KB rebuild.

---

### Contract C — Supabase RPC (chat/app.js)

```javascript
const { data, error } = await supabase.rpc('match_documents', {
  query_embedding: queryVector,   // Float32Array or number[] of length 1536
  match_count: 5,
  match_threshold: 0.3,
  filter_doc_type: null,          // Future: 'sop' | 'case-study' | etc.
  filter_client_id: null          // Future: 'client-abc' for multi-tenant
});

// Returns: array of {
//   id, title, content, category, doc_type, source,
//   section_label, chunk_strategy, similarity
// }
// Ordered by similarity descending. Empty array if no matches above threshold.
```

---

### Contract D — Supabase Delete + Insert (supabase_client.py)

```python
# Deduplication: always delete before re-inserting
supabase.table('documents').delete().eq('title', title).execute()

# Insert one chunk row
row = {
    'title':          title,
    'content':        chunk['text'],
    'embedding':      embedding_vector,   # list of 1536 floats
    'doc_type':       doc_type,
    'category':       category,
    'subcategory':    subcategory,
    'industry':       industry,
    'source':         source,
    'section_label':  chunk['section_label'],
    'chunk_index':    chunk['chunk_index'],
    'chunk_strategy': chunk['chunk_strategy'],
    'token_count':    chunk['token_count'],
    'is_distilled':   is_distilled,
    'client_id':      None,               # Always null for Outfox single-tenant
}
supabase.table('documents').insert(row).execute()

# Error handling: log error, increment error counter, continue — never abort
```

---

### Contract E — Claude Answer Generation (chat/app.js)

```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: CONFIG.ANTHROPIC_API_KEY
  anthropic-version: 2023-06-01
  anthropic-dangerous-direct-browser-access: true

Body:
  {
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "system": "You are the Outfox KB assistant. Answer using only the context provided.
               If the context does not contain the answer, say so clearly.
               Do not use outside knowledge.",
    "messages": [{
      "role": "user",
      "content": "[assembled chunks as context]\n\nQuestion: [user question]"
    }]
  }

Response: response.content[0].text
```

---

## Data Flows

### Path A — Distill First

```
1.  User opens intake/index.html, fills form fields
2.  User selects "Distill First" + pastes text content
3.  User clicks "Process Document"
4.  Browser validates: title required, content required
5.  Browser calls Claude API (Contract A) with raw text
6.  Claude returns cleaned, structured document text
7.  Browser shows cleaned text in readonly preview textarea
    Badge: "Distilled by Claude"
8.  User reviews (optionally edits), clicks "Download for Ingestion"
9.  Browser builds handoff JSON: { title, content: distilledText, is_distilled: true, ...metadata }
10. Browser triggers JSON file download:
    outfox-ingest-[slug]-[date].json

--- User runs locally ---

11. python pipeline/ingest.py --input outfox-ingest-*.json
12. ingest.py reads + validates JSON
13. detector.py detects format from content signature
14. chunker.py produces chunks via appropriate strategy
15. For each chunk:
    a. embedder.py embeds text → 1536-dim vector
    b. supabase_client.py inserts row with all metadata
16. Log: "Ingestion complete: [title] — [N] chunks via [strategy], [M] errors"
```

### Path B — Direct to Chunking

Steps 1–4 same as Path A.
```
5.  User selects "Direct to Chunking"
    [No Claude call]
6.  Browser shows preview with raw content
    Badge: "Direct — as submitted"
7.  User clicks "Download for Ingestion"
8.  Browser builds handoff JSON: { content: rawText, is_distilled: false, ...metadata }
    [Steps 10–16 identical to Path A]
```

### Path C — PDF Upload

```
1–3. User opens intake, fills form, uploads .pdf file
4.   Browser detects .pdf → reads as base64 ArrayBuffer
5.   Processing mode automatically set to "Direct" (browser cannot extract PDF text)
     Badge: "PDF — text extracted during ingestion"
6.   User clicks "Download for Ingestion"
7.   Browser builds handoff JSON: { pdf_b64: base64String, content: null, is_distilled: false }
8.   ingest.py reads pdf_b64 → pypdf.PdfReader extracts text
9.   Pipeline continues with extracted text (detector → chunker → embedder → supabase)
```

### Query Flow

```
1.  User opens chat/index.html, types question
2.  Browser calls OpenAI Embeddings API (Contract B) on question text
3.  OpenAI returns 1536-dim vector
4.  Browser calls Supabase RPC match_documents (Contract C)
5.  Supabase returns up to 5 chunks (similarity > 0.3), ordered descending
6.  IF zero results:
      Display: "No relevant documents found in the Outfox KB"
      Stop — no Claude call
7.  IF results:
      Assemble prompt: chunks as context + question
      Call Claude API (Contract E) for answer
8.  Render answer text in chat interface
9.  Render "Sources" section:
      - Deduplicate by title
      - Per source: title, doc_type, category, section_label (if populated)
      - If source field is URL: render as clickable link
```

---

## Environment Variables

| Variable | Used By | Security Level |
|---|---|---|
| `ANTHROPIC_API_KEY` | Intake `config.js`, Chat `config.js` | Browser-exposed (distillation + answer generation). Acceptable for internal tool. |
| `OPENAI_API_KEY` | Chat `config.js`, Pipeline `.env` | Browser-exposed in chat. Never log or display. |
| `SUPABASE_URL` | Chat `config.js`, Pipeline `.env` | Browser-safe (not a secret). |
| `SUPABASE_ANON_KEY` | Chat `config.js` | Browser-exposed. RLS limits it to read-only SELECT. |
| `SUPABASE_SERVICE_ROLE_KEY` | Pipeline `.env` only | **Never in browser code.** Full write access bypasses RLS. |

### Browser Config Files

Both `intake/` and `chat/` use a gitignored `config.js`:

```javascript
// config.example.js (committed) — copy to config.js and fill in values
const CONFIG = {
  ANTHROPIC_API_KEY: 'sk-ant-api03-...',
  OPENAI_API_KEY: 'sk-...',
  SUPABASE_URL: 'https://[project-id].supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
};
```

Intake `config.js` requires only `ANTHROPIC_API_KEY`. Chat `config.js` requires all four keys.

---

## Extension Points (Spoke-Ready Design)

The architecture is designed so that future spoke tools can be added without any changes to the core schema, RPC, or ingestion pipeline.

| Future Spoke | How It Connects | Schema Change Required |
|---|---|---|
| SOP assistant | Calls `match_documents` with `filter_doc_type: 'sop'` | None |
| Case study browser | Calls `match_documents` with `filter_doc_type: 'case-study'` | None |
| Client-specific tool | Calls `match_documents` with `filter_client_id: 'client-abc'` | None (client_id already in schema) |
| n8n workflow trigger | Calls Supabase RPC via HTTP API — same function signature | None |
| Doc generator | Reads retrieved chunks; passes to Claude with a different prompt | None |
| Client-facing FAQ bot | Separate chat interface pointing at same Supabase; scoped by client_id | None |

**The `match_documents` RPC is the stable spoke interface.** Its signature is versioned. Adding optional parameters (defaulting to `null`) is backward-compatible; changing existing parameter names or return column names is not.

---

## Deployment

| Component | Host | Method | Notes |
|---|---|---|---|
| Intake App | Vercel | Connect GitHub repo, set root: `intake/`, no build step | Set `ANTHROPIC_API_KEY` as Vercel env var (injected via build substitution or Edge Config) |
| Chat App | Vercel | Connect GitHub repo, set root: `chat/`, no build step | Set all four browser-side keys as Vercel env vars |
| Python Pipeline | Local machine | Manual: `python pipeline/ingest.py --input <file.json>` | Requires Python 3.10+, `.env` file, packages from `requirements.txt` |
| Supabase | Cloud | Already live | Run schema DDL from `01_SCHEMA.md` in Supabase SQL editor |

> **Note on Vercel env var injection**: Plain HTML/JS files cannot read Vercel environment variables at runtime. Resolve this by either (a) using a minimal `vercel.json` build step that substitutes placeholders, or (b) using Vercel Edge Config with a lightweight fetch at page load. Document the chosen approach in `03_TASKS.md` during Phase 9.
