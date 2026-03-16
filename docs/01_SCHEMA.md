# 01_SCHEMA.md — Supabase Schema Specification
**Outfox KB — v2**
*Last updated: 2026-03-15*

---

## Supabase Project

- **Project name**: `outfox-kb`
- **Required extension**: `pgvector` (enable in Supabase dashboard → Database → Extensions)

---

## Table: `documents`

One row = one chunk of a parent document. Multiple rows share the same `title` (all chunks from the same ingested document).

### Schema DDL

```sql
CREATE TABLE documents (
  -- Core content
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text          NOT NULL,
  content         text          NOT NULL,
  embedding       vector(1536)  NOT NULL,

  -- Document classification
  doc_type        text,         -- controlled vocab: see below
  category        text,         -- freeform top-level grouping
  subcategory     text,         -- freeform subcategory
  industry        text,         -- industry context (for future client KBs)
  source          text,         -- provenance: URL, filename, or meeting ref

  -- Chunking metadata
  section_label   text,         -- heading or section name within parent doc
  chunk_index     integer,      -- sequential position of chunk within parent doc (0-based)
  chunk_strategy  text,         -- which chunker was applied: see controlled vocab below
  token_count     integer,      -- token count of this chunk (for auditing)

  -- Ingestion metadata
  is_distilled    boolean       DEFAULT false,
  client_id       text,         -- null for Outfox single-tenant; reserved for multi-tenant isolation

  -- Timestamps
  created_at      timestamptz   NOT NULL DEFAULT now()
);
```

### Field Reference

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | uuid | No (PK) | Auto-generated chunk identifier |
| `title` | text | No | Human-readable parent document title. All chunks from the same document share the same title. Used for deduplication (delete by title before re-ingesting). |
| `content` | text | No | The chunk text — typically 400–600 tokens depending on chunking strategy. Never mix distilled and raw content in the same document's rows. |
| `embedding` | vector(1536) | No | OpenAI `text-embedding-3-small` embedding of the `content` field. **Locked** — see constraints below. |
| `doc_type` | text | Yes | Controlled vocab — see below. |
| `category` | text | Yes | Freeform grouping (e.g., "Operations", "Client Work", "Research"). |
| `subcategory` | text | Yes | Freeform subcategory for further filtering. |
| `industry` | text | Yes | Industry context (e.g., "Real Estate", "Healthcare"). Relevant for future client KB reuse. |
| `source` | text | Yes | Provenance: a URL, a filename, or a meeting reference. Rendered as a link in citations if it starts with `http`. |
| `section_label` | text | Yes | The heading or section name the chunk falls under (populated by document-aware and recursive chunkers when headers are detected). |
| `chunk_index` | integer | Yes | 0-based sequential position of this chunk within its parent document. Used for ordering and auditing. |
| `chunk_strategy` | text | Yes | Which chunker produced this chunk — see controlled vocab below. |
| `token_count` | integer | Yes | Token count of the `content` field using tiktoken `cl100k_base`. Used for auditing chunk quality. |
| `is_distilled` | boolean | No | `true` if the content passed through Claude distillation before chunking. `false` if ingested directly. Default: `false`. |
| `client_id` | text | Yes | `null` for all Outfox single-tenant documents. Reserved for future multi-tenant deployments. Future spoke tools and RLS policies will filter on this column. No schema migration required to add multi-tenancy. |
| `created_at` | timestamptz | No | Auto-set to `now()` on insert. |

---

## Controlled Vocabularies

### `doc_type` values

| Value | Description |
|---|---|
| `methodology` | Outfox consulting frameworks, delivery approaches, engagement models |
| `market-intelligence` | Market analysis, stack decisions, vertical research, strategy notes |
| `case-study` | Past engagement outputs, learnings, anonymized deliverables |
| `sop` | Operational procedures, how Outfox runs engagements or delivers work |
| `transcript` | Meeting notes, call recordings, session transcripts |
| `reference` | External research, third-party frameworks, reference templates |

### `chunk_strategy` values

| Value | Description |
|---|---|
| `recursive` | Recursive + sentence chunker — general prose default |
| `document-aware` | Header-boundary aware — for structured documents with clear sections |
| `pair-preserving` | Q+A pair kept as atomic unit — for FAQ documents |
| `row-level` | One row or row-group per chunk — for CSV/tabular data |
| `speaker-turn` | Split at speaker-turn markers — for call transcripts |

---

## Index

```sql
CREATE INDEX ON documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

> **Note**: Verify `lists` parameter in the Supabase dashboard after index creation. For large document sets (>10,000 rows), increase `lists` proportionally (rule of thumb: `sqrt(row_count)`).

---

## RPC Function: `match_documents`

The core retrieval function. Designed as a stable, documented API callable by future spoke tools and n8n workflows without modification.

```sql
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding   vector(1536),
  match_count       int     DEFAULT 5,
  match_threshold   float   DEFAULT 0.3,
  filter_doc_type   text    DEFAULT NULL,
  filter_client_id  text    DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  title           text,
  content         text,
  category        text,
  doc_type        text,
  source          text,
  section_label   text,
  chunk_strategy  text,
  similarity      float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    title,
    content,
    category,
    doc_type,
    source,
    section_label,
    chunk_strategy,
    1 - (embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE
    1 - (embedding <=> query_embedding) > match_threshold
    AND (filter_doc_type  IS NULL OR doc_type  = filter_doc_type)
    AND (filter_client_id IS NULL OR client_id = filter_client_id)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### Parameters

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `query_embedding` | vector(1536) | Required | Embedded user question |
| `match_count` | int | 5 | Max chunks to return |
| `match_threshold` | float | 0.3 | Minimum cosine similarity (0–1). Raise to 0.4–0.5 if results are too noisy. |
| `filter_doc_type` | text | null | Optional: restrict to one doc_type (e.g., `'sop'`). Used by future spoke tools. |
| `filter_client_id` | text | null | Optional: restrict to one client's data. Used by future multi-tenant deployments. |

### Returns

Each row represents one matching chunk, ordered by similarity descending. The `similarity` column is `1 - cosine_distance` (range 0–1; higher = more similar).

---

## Row Level Security

```sql
-- Enable RLS on the documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Allow anon key to SELECT (chat app is read-only)
CREATE POLICY "Allow anon read"
  ON documents FOR SELECT
  TO anon
  USING (true);

-- Service role bypasses RLS by default (no additional policy needed)
-- The Python ingestion pipeline uses the service role key exclusively
```

> **Important**: The `SUPABASE_SERVICE_ROLE_KEY` is used only by the local Python pipeline. It must never appear in browser-facing code (`intake/config.js` or `chat/config.js`).

---

## Schema Constraints

### Locked (Do Not Change Without Re-Embedding Everything)

Changes to these invalidate all stored embeddings and require full re-ingestion:

| Element | Locked Value |
|---|---|
| `embedding` column type | `vector(1536)` |
| Embedding model | `text-embedding-3-small` |
| Index type | `ivfflat` with `vector_cosine_ops` |

### Extensible (Safe to Change at Any Time)

These changes do not require re-embedding:

| What | Examples |
|---|---|
| Adding metadata columns | New classification fields, tags, expiry dates |
| Adding CHECK constraints | Enforce `doc_type` controlled vocab |
| Adding RLS policies | Per-client isolation, write policies |
| Adding indexes | Full-text search index on `content` |
| Changing `lists` on ivfflat | Performance tuning only |

---

## Recommended Next Steps (Post-v1)

```sql
-- Add CHECK constraint to enforce doc_type vocab (after v1 content is loaded)
ALTER TABLE documents
  ADD CONSTRAINT doc_type_valid
  CHECK (doc_type IN (
    'methodology', 'market-intelligence', 'case-study',
    'sop', 'transcript', 'reference'
  ));

-- Add full-text index for hybrid search (v2 upgrade)
CREATE INDEX ON documents USING gin(to_tsvector('english', content));
```
