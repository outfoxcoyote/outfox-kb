# Outfox Market Intelligence: Queryable Knowledge Base Landscape (March 2026)

> **Usage note:** This file is a living intelligence document. Attach it to any Claude project or conversation where KB architecture, market strategy, or client delivery is in scope. Update it after every significant design decision, build session, or market learning.

---

## Business Model Context

Outfox Consulting delivers done-for-you AI automation and knowledge base systems, primarily for real estate agents and small business owners. The core architecture is **KB as hub, derivative tools as spokes** — a private, queryable knowledge base is the central deliverable, with automation workflows, client-facing tools, and reporting layered on top.

**Not pursuing:** Direct CRM-based offerings. KB-first only.

---

## Market Signal Summary

The X/builder community has converged on the same model Outfox is building toward: **vertical AI "employees" that own repeatable business outputs using private knowledge bases.** This is not speculative — it is actively being built and sold in 2025–2026.

Key validated signals:
- Real estate is explicitly named as a live, active buyer vertical — not a future one
- SMBs now have dedicated AI budgets and executive mandates to purchase
- The market is shifting from generic chatbots to narrow, high-value, embedded tools
- Winners are defined by owning the **finished artifact the customer cares about**, not the underlying chat interface

---

## Validated Target Verticals (Relevant to Outfox)

### Primary: Real Estate Agents
- Property listings, market analyses, FAQs, and location guides loaded into vector stores for semantic Q&A
- Agents and their clients can query the KB in natural language
- Automatable deliverables: listing packages, market reports, buyer/seller FAQ systems
- Active builders and buyers already in this space — not a cold sell
- **KB contents:** Listing scripts, objection handlers, market stats, neighborhood FAQs, past client Q&A, transaction checklists, MLS explanations
- **Spoke tools:** Chat assistant for agent queries, auto-draft listing descriptions, team onboarding KB for brokerages
- **Pricing signal:** $200–500/mo. Agents are accustomed to paying for tools. Position as "the brain that never forgets a script."

### Secondary (Later Stage)

**Small Business Owners (Service-Based)**
- KB contents: SOPs, employee training docs, customer FAQs, product/service descriptions, pricing rationale, vendor contacts
- Spoke tools: Internal staff assistant, customer-facing chat widget, new hire onboarding doc generator
- Pricing signal: $150–300/mo. Sell time savings — one less hour of owner Q&A per day justifies the cost.

**Medical / Dental Practices**
- KB contents: Insurance FAQs, procedure explanations, pre/post care instructions, staff protocols, billing codes in plain language
- Spoke tools: Patient pre-appointment FAQ bot, staff policy assistant, consent form explainer
- Pricing signal: $300–600/mo. High compliance value. Less front desk call volume.

**Contractors / Trades**
- KB contents: Bid templates, jurisdiction-specific code requirements, material specs, subcontractor contacts, project checklists
- Spoke tools: Bid assistant, mobile-friendly job site reference tool, client FAQ generator
- Pricing signal: $150–250/mo. Underserved, low tech adoption = lower resistance to entry pricing.

### Avoid for Now
- HNWI / family offices: Real demand, but long sales cycles, high trust bar, bespoke requirements. Year 2+ play after case studies exist.
- Healthcare / legal / manufacturing at scale: Compliance overhead is disproportionate until core process is proven in simpler verticals.

---

## How a Knowledge Base Works (Foundational Theory)

Understanding this is essential for build quality decisions and client communication.

A knowledge base converts documents into **embeddings** — numerical representations of meaning — stored in a vector database. When a user asks a question, the question is also converted to a number, and the system finds the stored chunks whose numbers are most similar (cosine similarity). Those chunks are assembled and passed to an LLM (Claude) as context for generating the answer.

```
User Question
     ↓
Query Embedding (question → numbers)
     ↓
Vector Search (find closest chunks in Supabase/pgvector)
     ↓
Context Assembly (pull retrieved chunks together)
     ↓
LLM Generation (Claude reads chunks + answers)
     ↓
Answer
```

**Key principle:** The KB never "reads" documents the way a human does. It retrieves fragments. The quality of those fragments — how they were cut, labeled, and stored — determines everything downstream.

---

## Chunking: The #1 Build Quality Bottleneck

### Why It Matters

Before any document enters the knowledge base, it must be split into pieces called **chunks**. Each chunk is independently embedded and stored. Retrieval pulls back chunks, not whole documents.

Bad chunking breaks retrieval regardless of how good the embeddings or LLM are. It is the highest-leverage decision in any KB build.

**The core tension:**

| Chunk Too Large | Chunk Too Small |
|---|---|
| Retrieves too much irrelevant text | Loses surrounding context |
| Expensive — more tokens sent to LLM | Answer is incomplete or misleading |
| Dilutes the signal | Like reading one sentence out of context |

**Compounding failure modes:**
- Naive splitters (e.g., "every 500 characters") destroy logical document boundaries
- A topic spanning 3 paragraphs gets split across 3 unrelated chunks
- Retrieval returns fragment A and fragment C, misses fragment B — answer falls apart
- Overlap between chunks (10–15% shared content at seams) is required to prevent context loss at boundaries

### Chunking Strategy Reference

| Strategy | How It Works | Best For |
|---|---|---|
| Fixed-size | Split every N tokens | Simple docs, low stakes only |
| Sentence-based | Split at sentence boundaries | Clean prose content |
| Semantic | Split when topic shifts | Mixed-topic documents |
| Recursive / hierarchical | Try paragraph → sentence → word in order | General purpose — reliable default |
| Document-aware | Respect headers, sections, list items | Structured docs: SOPs, contracts, FAQs |
| Speaker-turn | Split at speaker/pause markers | Call transcripts (Whisper output) |
| Row-level | One row or row-group per chunk | CSVs, tables, structured data |
| Pair-preserving | Keep Q+A as one atomic unit | FAQ documents — never split question from answer |

**Outfox default:** Recursive + document-aware, with 10–15% overlap at chunk seams.

---

## Dynamic Chunking Pipeline (Outfox Architecture Standard)

Rather than applying one fixed strategy to all content, the ingestion pipeline should **route incoming documents to the appropriate chunking method based on format detection.** This is a preprocessing step before embedding.

```
Incoming Document
       ↓
  Format Detector (extension, MIME type, content signature)
       ↓
  ┌────┴─────────────────────────────────────────────┐
  │                    Router                        │
  └────┬────────────────────────────────────────────┘
       ├── PDF / structured doc    → Document-aware chunker
       ├── Plain text / transcript → Recursive + sentence
       ├── FAQ / Q&A pairs         → Pair-preserving chunker
       ├── Table / CSV             → Row-level chunker
       └── Call recording output  → Speaker-turn chunker
       ↓
  Chunk + Embed + Store (Supabase/pgvector)
```

**Why this matters for Outfox:** Client data is messy and multi-format. Real estate agents have PDFs, call transcripts, FAQs, spreadsheets, and freeform notes. Without a router, every format is treated identically and retrieval quality suffers inconsistently. A format-aware pipeline produces clean chunks from the start and eliminates manual cleanup on each client engagement.

**Metadata per chunk (required):** Source file name, document type, section label, timestamp, client ID (for RLS filtering). Metadata enables filtering at retrieval time — not just semantic similarity matching.

### Build Note
This pipeline is a **Claude Code job** — a Python preprocessing script with a format detector, per-format splitter functions, and Supabase write logic. Build this before the first client delivery. It becomes the reusable ingestion SOP.

---

## Production RAG Architecture (What Actually Works)

The community has converged on a consistent, production-viable stack:

1. **Chunking strategy** — #1 bottleneck. Bad chunking kills retrieval regardless of everything else. See above.
2. **Embeddings** — OpenAI or Gemini. Local models available but add maintenance complexity.
3. **Vector store + metadata** — Supabase pgvector is the community standard for SMB deployments.
4. **Hybrid search** — vector + keyword + reranking, time weighting, diversity filters.
5. **LLM generation** — Claude or OpenAI. Claude preferred for reasoning-heavy outputs.
6. **Observability** — eval/monitoring layer matters for production reliability at scale.

---

## Recommended Stack for Outfox

### Core (Build On This)

| Layer | Tool | Why |
|---|---|---|
| Vector store + backend | Supabase (pgvector) | Managed, secure, n8n-compatible, community standard |
| Automation / orchestration | Claude Code (primary), n8n (secondary) | Claude Code for ingestion pipelines and logic; n8n for triggers and routing |
| LLM | Claude (primary) / OpenAI | Claude for reasoning; OpenAI for cost-sensitive tasks |
| Document intake | JotForm + n8n | Already in stack; triggers ingestion workflows |
| Auth / access control | Supabase RLS | Row-Level Security keeps client data isolated per account |

### Monitor But Don't Build On Yet
- **OpenClaw** — local-first AI agent, viral (26k+ users in one week). Strong privacy angle. Relevant for future HNWI pitch. Too early/maintenance-heavy for client deployments now.
- **LangGraph** — multi-agent orchestration. Valid for complex workflows; overkill for initial builds.

---

## The Hub-and-Spoke Product Model

```
         [Knowledge Base — Supabase/pgvector]
                        |
     ┌──────────────────┼──────────────────┐
     ↓                  ↓                  ↓
Chat Interface    Doc Generator      Alert/Trigger
(Ask anything)   (Draft from KB)    (Flag when KB
                                     doesn't know)
```

Every market uses this same engine. Differentiation is in what content gets loaded, how queries are surfaced, and what interface sits on top. The KB is always built first. Spokes are added after the hub is stable — not before.

**Each spoke added increases client switching cost.** This is the moat mechanism.

---

## Positioning Intelligence

### What Creates a Moat
- Embedding into client workflows so the KB becomes **infrastructure**, not a tool
- Starting with **one painful, repeatable output** (listing package, buyer FAQ, market report)
- Expanding spoke tools off the KB hub over time — each spoke increases switching cost

### Pricing Signal
- AI-native startups hitting $5M ARR in ~9 months (validates buyer urgency and budget availability)
- Enterprises and SMBs have **dedicated AI budgets** — no longer an education sell

### Key Framing for Prospects
> "A private knowledge base built from your listings, data, and content — so you or your clients can ask it anything and get a real answer instantly. It replaces the manual lookup, the copy-paste, and the delayed response."

---

## Risk Factors

| Risk | Mitigation |
|---|---|
| Chunking quality kills retrieval | Build dynamic chunking pipeline before first client delivery; test on real content |
| Naive splitter used on mixed-format content | Format router eliminates this — standardize the pipeline, don't improvise per client |
| Token bloat / context overload | Use RAG memory layers; don't pass full documents to the LLM |
| Non-devs can't maintain custom tools | Build on Supabase managed infra; minimize custom code in client-facing layer |
| Scope creep into adjacent tools | KB is the hub — no spokes until hub is stable and delivering |
| Regulatory complexity in healthcare/legal | Stay in real estate and general SMB until process is proven |
| Metadata gaps at ingestion | Define metadata schema before first build; retrofitting is expensive |

---

## Sequencing: What to Build First

1. **Build the dynamic chunking pipeline** (Claude Code — Python script with format router)
2. **Set up Supabase schema** — chunks table with embedding column, metadata columns, RLS policies
3. **Test ingestion** on real content from a real estate use case (listing docs, FAQs, scripts)
4. **Validate retrieval quality** — ask representative questions; inspect what chunks are returned
5. **Wire in Claude** for answer generation on top of retrieved chunks
6. **Document the full pipeline** as the repeatable delivery SOP
7. **That working system is the sales asset, the case study, and the template for all future work**

---

## Bottom Line for Outfox

The market has validated the architecture. The vertical (real estate) is active. The stack (Supabase + Claude Code + Claude) is proven and within current skill trajectory.

The single highest-leverage build decision is chunking strategy. Everything else in the pipeline depends on getting chunks right. The dynamic routing approach described above is the production-quality standard — not a nice-to-have.

**Immediate priority:** Build and deploy one complete ingestion pipeline → vector store → query → output workflow for a real estate use case, using the dynamic chunking architecture as the foundation.
