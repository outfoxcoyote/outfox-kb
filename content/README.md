# Outfox KB — Pilot Content

This folder documents the content loaded into the Outfox KB pilot. Files themselves are not stored here (they may be sensitive); this file tracks what has been ingested and its status.

---

## Content Inventory

### Market Intelligence
| Title | doc_type | Format | Status |
|---|---|---|---|
| Outfox Market Intelligence: Queryable KB Landscape (March 2026) | market-intelligence | Markdown | — |

### Methodology
| Title | doc_type | Format | Status |
|---|---|---|---|
| *(add rows as docs are ingested)* | methodology | — | — |

### Case Studies
| Title | doc_type | Format | Status |
|---|---|---|---|
| *(add rows as docs are ingested)* | case-study | — | — |

### SOPs
| Title | doc_type | Format | Status |
|---|---|---|---|
| *(add rows as docs are ingested)* | sop | — | — |

### Transcripts
| Title | doc_type | Format | Status |
|---|---|---|---|
| *(add rows as docs are ingested)* | transcript | — | — |

---

## Ingestion Instructions

### Prerequisites
- Python 3.10+ installed
- `pipeline/requirements.txt` packages installed: `pip install -r pipeline/requirements.txt`
- `.env` file in project root with:
  ```
  OPENAI_API_KEY=sk-...
  SUPABASE_URL=https://[project-id].supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  ```

### Step 1 — Use the Intake Form
Open `intake/index.html` in a browser (or the Vercel production URL).
Fill in the form fields, upload or paste your document, choose processing mode, and download the handoff JSON.

### Step 2 — Run the Pipeline
```bash
python pipeline/ingest.py --input path/to/outfox-ingest-[slug]-[date].json
```

Watch the log output. A successful run ends with:
```
Ingestion complete: [title] — [N] chunks via [strategy], 0 errors
```

### Step 3 — Verify in Supabase
Open the Supabase dashboard → Table Editor → `documents`.
Filter by `title` to confirm rows are present with `embedding`, `chunk_strategy`, and `section_label` populated.

### Step 4 — Update This File
Add a row to the relevant table above with the document title, type, format, and status.

---

## Demo Query Suggestions

Use these questions when demonstrating the KB to a prospect:

- "What chunking strategy should we use for a real estate FAQ document?"
- "What was the pricing signal we found for real estate KB tools?"
- "How do we handle a client's PDF documents in the ingestion pipeline?"
- "What's the hub-and-spoke product model and why does it matter?"
- "What verticals should Outfox target first and why?"
- "What are the biggest risk factors in building a client KB?"

---

## Retrieval Quality Notes

*(Add notes here after Phase 3 validation — e.g., threshold adjustments, chunker tuning, content gaps discovered)*
