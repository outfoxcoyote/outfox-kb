# 02_ARCHITECTURE.md — System Architecture
> Outfox Knowledge Base — authoritative architecture reference. All data flow decisions, file structure conventions, API contracts, and deployment targets are defined here. Any deviation requires approval and an update to this document.

---

## System Overview

The Outfox Knowledge Base consists of two independent web apps and one local Python script, all backed by a shared Supabase pgvector database.

| Component | What It Does | Where It Runs |
|---|---|---|
| **Intake App** | Accepts documents, optionally distills via Claude, downloads handoff JSON | Vercel (static HTML/JS) |
| **Chat App** | Accepts questions, searches KB, generates answers with source citations | Vercel (static HTML/JS) |
| **Python Script** | Reads handoff JSON, chunks text, embeds via OpenAI, writes to Supabase | Local machine (run manually) |
| **Supabase** | pgvector database — single source of truth for all embedded knowledge | Supabase cloud (already live) |
| **Claude API** | Two roles: document distillation (intake) and answer generation (chat) | Anthropic cloud |
| **OpenAI API** | Embeddings only — used by both the Python script and the chat app | OpenAI cloud |

### Component Relationships

| From | To | Direction | Protocol | Key Used |
|---|---|---|---|---|
| Intake App (browser) | Claude API | Direct fetch POST | HTTPS | `ANTHROPIC_API_KEY` |
| Python script | OpenAI API | Direct HTTPS | HTTPS | `OPENAI_API_KEY` |
| Python script | Supabase | Direct REST | HTTPS | `SUPABASE_SERVICE_ROLE_KEY` |
| Chat App (browser) | OpenAI API | Direct fetch POST | HTTPS | `OPENAI_API_KEY` |
| Chat App (browser) | Supabase RPC | Direct fetch POST | HTTPS | `SUPABASE_ANON_KEY` |
| Chat App (browser) | Claude API | Direct fetch POST | HTTPS | `ANTHROPIC_API_KEY` |

> **Security note:** API keys are called directly from the browser. This is acceptable for an internal tool with a private URL. Keys are set as Vercel environment variables and referenced in the JS at runtime. They will be visible in browser network requests — do not share the app URLs publicly.

---

## Tier Context

This system is **Tier 1 — Global Interface**. It stores all Outfox consulting knowledge and answers broad queries.

**Tier 2 — Claude Projects** are seeded by focused context documents exported from Tier 1. Tier 2 is not part of this build. However, the schema and architecture are designed to make a future export mechanism possible (e.g., export top-N chunks by category to a text file for Claude Project seeding).

---

## Ingestion Data Flow

### Path A — Distill First

For raw, messy input: meeting transcripts, unstructured notes, voice-to-text output.

```
1. User opens intake/index.html in browser
2. User fills in form fields (title required; others optional)
3. User pastes text OR uploads a file (.txt, .md, .pdf)
4. User sets toggle to "Distill First"
5. User clicks Submit
6. Browser JS validates: title present, content present, file type allowed, file size within limit
7. If file upload: browser reads .txt/.md via FileReader API
                   browser includes raw .pdf as base64 blob (Python will extract text)
8. Browser POSTs to Claude API (claude-sonnet-4-6) with distillation system prompt + raw content
9. Claude returns structured, cleaned document text
10. Browser displays distilled content in a readonly preview textarea
11. User reviews distilled output; clicks "Download for Ingestion"
12. Browser packages {title, content (distilled), category, subcategory, industry,
    doc_type, source, is_distilled: true} as a .json file and triggers download
13. User runs: python pipeline/ingest.py --input <downloaded_file.json>
14. Python chunks content (~500 tokens, 50-token overlap via tiktoken)
15. Python embeds each chunk via OpenAI text-embedding-3-small
16. Python deletes any existing rows in Supabase with matching title (deduplication)
17. Python inserts each chunk row into Supabase documents table
18. Python logs progress and final summary
```

### Path B — Direct to Chunking

For clean, well-structured content: SOPs, reference documents, edited case studies.

```
1–7.  Same as Path A
8.    (Skip Claude API call entirely)
9.    Browser packages {title, content (raw), category, subcategory, industry,
      doc_type, source, is_distilled: false} as a .json file and triggers download
10–18. Same as Path A steps 13–18
```

### Handoff File Format

The downloaded JSON file passed to the Python script:

```json
{
  "title": "string (required)",
  "content": "string (required — distilled or raw text; OR omitted if pdf_b64 is present)",
  "pdf_b64": "string (optional — base64-encoded PDF bytes, only when original upload was PDF)",
  "category": "string or null",
  "subcategory": "string or null",
  "industry": "string or null",
  "doc_type": "string or null",
  "source": "string or null",
  "is_distilled": "boolean"
}
```

> When `pdf_b64` is present, the Python script uses `pypdf` to extract the text before chunking. The `content` field is empty in this case.

---

## Query Data Flow

```
1.  User opens chat/index.html in browser
2.  User types a natural language question and submits
3.  Browser calls OpenAI Embeddings API (text-embedding-3-small) with the question text
4.  OpenAI returns a 1536-dimension vector
5.  Browser calls Supabase RPC function match_documents(query_embedding, match_count=5, match_threshold=0.3)
6.  Supabase performs cosine similarity search via ivfflat index
7.  Supabase returns up to 5 rows where similarity > 0.3, ordered by score DESC
    Fields returned: id, title, content, category, doc_type, source, similarity
8.  If zero rows returned: browser displays "No relevant documents found" — no Claude call is made
9.  Browser assembles a prompt: system instructions + retrieved chunks as context + original question
10. Browser POSTs to Claude API (claude-sonnet-4-6) for answer generation
11. Claude returns grounded answer text
12. Browser renders answer in chat UI
13. Browser renders a "Sources" section below the answer:
    - One citation per unique title among the retrieved chunks
    - Displays: title, doc_type, category
```

---

## File and Folder Structure

```
outfox-kb/
├── intake/
│   ├── index.html          Form UI — all fields, distill toggle, file upload, submit
│   ├── style.css           Minimal layout, no framework
│   └── app.js              Validation, FileReader, Claude API call, JSON download
│
├── chat/
│   ├── index.html          Chat UI — question input, answer display, citation block
│   ├── style.css           Minimal layout
│   └── app.js              Query embed, Supabase RPC, Claude API call, citation render
│
├── pipeline/
│   ├── ingest.py           Main script — CLI entry point, orchestrates all steps
│   ├── chunker.py          Chunking logic (tiktoken, 500 tokens, 50-token overlap)
│   ├── embedder.py         OpenAI embedding calls (text-embedding-3-small)
│   ├── supabase_client.py  Supabase delete-by-title and insert-chunk operations
│   └── requirements.txt    openai, supabase, python-dotenv, tiktoken, pypdf
│
├── .env                    Gitignored — all four secrets (see Section 8)
├── .gitignore
├── CLAUDE.md
├── 01_SCHEMA.md
├── 02_ARCHITECTURE.md
└── 03_TASKS.md
```

> Both `intake/` and `chat/` are deployed as separate Vercel projects from the same repository.

---

## API Contracts

### A — Claude API: Distillation (intake/app.js)

```
POST https://api.anthropic.com/v1/messages

Headers:
  x-api-key: <ANTHROPIC_API_KEY>
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "system": "<distillation system prompt — see note below>",
  "messages": [
    {
      "role": "user",
      "content": "<raw document text>"
    }
  ]
}

Response (extract):
  response.content[0].text  →  distilled document string

Error cases to handle:
  400 — invalid input (log, show user error)
  429 — rate limit (show user: "Request limit reached, try again shortly")
  500 — server error (show user: "Claude API error, try again")
```

> **Note:** The distillation system prompt must be approved before it is finalized (per CLAUDE.md rule). A placeholder prompt will be used during development. The prompt is defined as a constant in `app.js` or a separate `prompts.js`, clearly commented.

---

### B — OpenAI Embeddings API (pipeline/embedder.py and chat/app.js)

The same call is used in both places — the model must be identical.

```
POST https://api.openai.com/v1/embeddings

Headers:
  Authorization: Bearer <OPENAI_API_KEY>
  Content-Type: application/json

Body:
{
  "model": "text-embedding-3-small",
  "input": "<text to embed>"
}

Response (extract):
  response.data[0].embedding  →  list of 1536 floats

Error cases:
  429 — rate limit; Python script: exponential backoff retry (3 attempts)
  400 — input too long (chunk is over token limit); log and skip
```

---

### C — Supabase RPC: Similarity Search (chat/app.js)

```javascript
const { data, error } = await supabase.rpc('match_documents', {
  query_embedding: queryVector,   // array of 1536 numbers
  match_count: 5,
  match_threshold: 0.3
});

// data is an array of objects:
// { id, title, content, category, doc_type, source, similarity }

// If data.length === 0: display "No relevant documents found", skip Claude call
```

See [01_SCHEMA.md](01_SCHEMA.md) for the full SQL function definition.

---

### D — Supabase Delete + Insert (pipeline/supabase_client.py)

**Delete existing chunks by title (deduplication):**

```python
supabase.table('documents').delete().eq('title', title).execute()
# Logs: "Deleted existing rows for title: [title]"
# If no rows existed, this is a no-op — not an error
```

**Insert a chunk row:**

```python
row = {
    'title': title,
    'content': chunk_text,
    'embedding': embedding_vector,   # list of 1536 floats
    'category': category or None,
    'subcategory': subcategory or None,
    'industry': industry or None,
    'doc_type': doc_type or None,
    'source': source or None
    # id and created_at are set by Supabase automatically
}
supabase.table('documents').insert(row).execute()
```

On insert failure: log `"ERROR: chunk [i] of [title] — [error message]"`, continue to next chunk. Do not abort the entire batch.

---

### E — Claude API: Answer Generation (chat/app.js)

```
POST https://api.anthropic.com/v1/messages

Headers: (same as Contract A)

Body:
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "system": "You are a helpful knowledge base assistant for Outfox Consulting.
             Answer the user's question using only the context provided.
             If the answer is not in the context, say so clearly.
             Do not speculate or use information outside the provided context.",
  "messages": [
    {
      "role": "user",
      "content": "Context:\n\n[chunk 1 content]\n\n[chunk 2 content]\n...\n\nQuestion: [user question]"
    }
  ]
}

Response (extract):
  response.content[0].text  →  answer string
```

> Token budget: 5 chunks × ~500 tokens = ~2,500 tokens of context + system prompt + question + answer ≈ well within Claude's context window.

---

## Environment Variables

| Variable | Used By | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Intake app (browser), Chat app (browser) | Claude distillation + answer generation |
| `OPENAI_API_KEY` | Chat app (browser), Python script | Embeddings only |
| `SUPABASE_URL` | Chat app (browser), Python script | Project endpoint URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Python script only | Full write access; never put in browser |
| `SUPABASE_ANON_KEY` | Chat app (browser) | Read-only access via RLS policy |

**In `.env` (Python script — never committed):**
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**In Vercel dashboard — Intake App:**
```
ANTHROPIC_API_KEY=sk-ant-...
```

**In Vercel dashboard — Chat App:**
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
```

> Vercel injects these as `window.__ENV__` or via a build-time substitution depending on configuration. For a no-build-step static site, they must be referenced as literal values injected via Vercel's environment variable substitution or read from a Vercel Edge Config. See the Phase 8 deploy task for the implementation approach.

---

## Deployment Targets

| Component | Host | Deploy Method | Notes |
|---|---|---|---|
| Intake App | Vercel | Connect GitHub repo, root dir `intake/`, no build command | Separate Vercel project |
| Chat App | Vercel | Connect GitHub repo, root dir `chat/`, no build command | Separate Vercel project |
| Python Script | Local machine | Not deployed — run manually | `python pipeline/ingest.py --input <file.json>` |
| Supabase | Supabase cloud | Already live — no deployment steps needed | Project: `outfox-kb` |

---

## Python Script: Detailed Workflow

### CLI Interface

```bash
python pipeline/ingest.py --input <path_to_handoff.json>
```

The script reads all metadata from the JSON file. No additional CLI flags needed — everything is in the handoff file.

### Step-by-Step Execution

```
1.  Load .env via python-dotenv
2.  Parse --input argument; exit with clear error if missing
3.  Read and parse the JSON handoff file
4.  Validate: title present; either content or pdf_b64 present; exit with error if not
5.  If pdf_b64 present: decode base64, extract text via pypdf; assign to content variable
6.  Log: "Starting ingestion: [title]"
7.  Call chunk_text(content, chunk_size=500, overlap=50) from chunker.py
8.  Log: "Chunking complete: [title] — [N] chunks"
9.  Delete existing Supabase rows matching title (deduplication)
10. Log: "Cleared existing rows for: [title]" (or "No existing rows found")
11. For each chunk (index i, text t):
      a. Call embed_chunk(t) from embedder.py
      b. Build row dict with all metadata fields
      c. Call insert_chunk(...) from supabase_client.py
      d. Log: "Stored chunk [i+1]/[N]: [title]"
      e. On error: log "ERROR chunk [i+1]: [message]", increment error counter, continue
12. Log: "Ingestion complete: [title] — [N] chunks stored, [M] errors"
```

### chunker.py: Token-Based Chunking

- Uses `tiktoken` with `cl100k_base` encoding (matches OpenAI's tokenizer)
- Sliding window: encode full text, slice into 500-token windows with 50-token overlap
- Return list of decoded strings (one string per chunk)
- A document with 1,100 tokens produces chunks at: [0–500], [450–950], [900–1100]

### embedder.py: Retry Logic

- On OpenAI 429 (rate limit): wait 2s, retry; wait 4s, retry; wait 8s, retry; then raise
- On success: return `response.data[0].embedding` as a Python list (not numpy array)
- Validate length is exactly 1536 before returning
