# 00_PRD.md — Product Requirements Document
> Outfox Knowledge Base — Global Interface (Tier 1)
> Status: Pre-build. This document governs all subsequent design and implementation decisions.

---

## 1. Product Purpose

Outfox Consulting's knowledge — engagement methodology, client work history, industry expertise, reference frameworks — currently lives in people's heads and scattered files. There is no central place to query it. Finding an answer means knowing who to ask, searching through drives, or reconstructing context from memory.

The Outfox Knowledge Base solves this by providing a single, queryable store of institutional knowledge. Documents are ingested, processed, and stored as searchable embeddings. Staff can ask natural language questions and receive answers grounded in Outfox's actual documented knowledge, with citations to the source material.

**This system is the foundation of Outfox's internal AI capability.** It is the first layer of a two-tier architecture: the Global Interface (Tier 1, this system) stores all consulting knowledge and answers broad queries. Focused context packages exported from here seed Claude Projects (Tier 2), which are purpose-built assistants for specific engagements or domains.

---

## 2. Problem Statement

| Problem | Current State | Impact |
|---|---|---|
| Knowledge is fragmented | Insights live in emails, meeting notes, personal drives, and people's memories | Staff spend time searching or re-deriving knowledge that already exists |
| Knowledge is person-dependent | Specific colleagues hold context about past clients, methods, and domain expertise | Knowledge transfer is slow; departures or absences create gaps |
| No queryable record of past work | Case studies and engagement notes are written and filed but rarely consulted | Outfox cannot efficiently learn from or build on its own history |

---

## 3. Users

Outfox Knowledge Base has a single primary user type at launch.

### Outfox Staff (Intake + Query)

The same person both ingests documents and queries the knowledge base. This is a small team of consulting professionals — not dedicated knowledge managers or engineers.

**Intake use:** An Outfox staff member has a document (meeting transcript, case study, reference material) they want to make queryable. They open the intake form, fill in metadata, paste or upload the document, choose whether to distill it first, and download the handoff file. They then run the Python script to embed and store it.

**Query use:** The same staff member (or a colleague) opens the chat interface, asks a natural language question, and reads the answer with source citations.

**Technical comfort level:** Not engineers. The intake form and chat interface must require no technical knowledge. The Python script is an operator task — the person running it is expected to be comfortable with a terminal.

---

## 4. Scope

### In Scope — Launch (v1)

| Feature | Description |
|---|---|
| Document intake form | Web form accepting text paste, .txt, .md, .pdf uploads |
| Optional distillation | Claude-powered cleaning and structuring of raw/messy documents before ingestion |
| Embedding pipeline | Python script: tiktoken chunking, OpenAI embedding, Supabase write |
| Knowledge base storage | Supabase pgvector; `documents` table; ivfflat cosine similarity index |
| Chat interface | Natural language question → vector search → Claude-generated answer |
| Source citations | Every answer shows the title, doc_type, and category of retrieved source chunks |
| Deduplication | Re-ingesting a document by the same title replaces the previous version |

### Out of Scope — v1

| Feature | Reason deferred |
|---|---|
| User authentication | Internal tool with private URL; auth adds complexity without proportionate security gain at this stage |
| Category/industry filtering in chat | Useful future enhancement; not needed for initial retrieval quality |
| n8n automation spokes | Post-launch workflow automation |
| Tier 2 export mechanism | Will be designed once Tier 1 is stable |
| Admin interface | Documents can be managed directly in the Supabase dashboard for now |
| Batch ingest | Single-document ingest is sufficient for v1 volume |
| OCR for scanned PDFs | Only text-based PDFs supported; scanned documents require separate OCR step |
| Access control by content type | All ingested content treated as equally accessible to all Outfox staff |

---

## 5. Content Scope

The following document types are in scope for ingestion at launch:

| Type | `doc_type` value | Description |
|---|---|---|
| Client engagement notes / transcripts | `transcript` | Notes or recordings from client meetings, workshops, discovery sessions |
| Case studies | `case study` | Outputs and learnings from completed client engagements |
| Reference material / frameworks | `reference` | Industry frameworks, research, templates, or external material Outfox consults regularly |

> **Not in scope at launch:** Internal SOPs and operational procedures. These may be added in a later phase.

**Expected volume:** Under 100 documents at launch. Long-term ceiling estimated at ~500 documents. The current ivfflat index configuration (`lists = 100`) is appropriate for this scale.

---

## 6. Functional Requirements

### Intake Form

| ID | Requirement |
|---|---|
| F-01 | The form shall accept a document title (required) and optional metadata: category, subcategory, industry, doc_type, source |
| F-02 | The form shall accept document content via text paste or file upload (.txt, .md, .pdf) |
| F-03 | The form shall reject file uploads that are not .txt, .md, or .pdf |
| F-04 | The form shall reject file uploads over 10MB |
| F-05 | The form shall prevent submission if title is empty |
| F-06 | The form shall prevent submission if both the text area and file upload are empty |
| F-07 | The form shall offer a toggle to select "Distill First" or "Direct to Chunking" |
| F-08 | When "Distill First" is selected, the form shall call the Claude API and display the distilled output before download |
| F-09 | When "Direct to Chunking" is selected, the form shall skip the Claude API call |
| F-10 | The form shall package document content and metadata into a downloadable JSON file for handoff to the Python script |
| F-11 | For PDF uploads, the form shall include the raw PDF as base64 in the handoff JSON; text extraction shall be performed by the Python script |

### Embedding Pipeline (Python Script)

| ID | Requirement |
|---|---|
| F-12 | The script shall accept a JSON handoff file as input via `--input` argument |
| F-13 | The script shall extract text from PDF input using `pypdf` |
| F-14 | The script shall chunk input text into segments of approximately 500 tokens with 50-token overlap |
| F-15 | The script shall embed each chunk using OpenAI `text-embedding-3-small` (1536 dimensions) |
| F-16 | Before inserting, the script shall delete all existing rows in Supabase with the same `title` (deduplication) |
| F-17 | The script shall insert each chunk as a separate row in the Supabase `documents` table |
| F-18 | The script shall log progress (chunk count, embed status, insert status) and a final summary |
| F-19 | The script shall continue processing remaining chunks if a single chunk fails to insert |

### Chat Interface

| ID | Requirement |
|---|---|
| F-20 | The chat interface shall accept a natural language question |
| F-21 | The interface shall embed the question using OpenAI `text-embedding-3-small` |
| F-22 | The interface shall retrieve the top 5 most semantically similar document chunks from Supabase |
| F-23 | Chunks with a cosine similarity score below 0.3 shall be excluded from results |
| F-24 | If no chunks meet the threshold, the interface shall display "No relevant documents found" and shall not call the Claude API |
| F-25 | The interface shall pass retrieved chunks as context to the Claude API and display the generated answer |
| F-26 | The answer shall be grounded in the retrieved context; Claude shall not speculate beyond the provided material |
| F-27 | The interface shall display source citations below every answer: title, doc_type, and category for each unique source document retrieved |
| F-28 | If the source field contains a URL, it shall be rendered as a clickable link in the citation |

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Reliability** | The system shall complete queries without timing out under normal conditions |
| **Browser support** | The intake form and chat app shall function in current versions of Chrome and Edge (primary internal browsers) |
| **Security** | No API keys or credentials shall be committed to the repository |
| **Security** | The Supabase `documents` table shall have Row Level Security enabled; the chat app shall use the anon key with a read-only policy |
| **Data integrity** | The embedding model (`text-embedding-3-small`, 1536 dimensions) shall not be changed without re-embedding all stored documents |
| **Portability** | The Python script shall run on macOS and Windows with standard Python 3.10+ |
| **Observability** | The Python script shall log all chunking, embedding, and write operations with document title and chunk count |
| **Scale** | The system shall support up to 500 documents (~5,000–15,000 chunk rows) without architectural changes |

---

## 8. Primary Use Cases

These are the specific questions the system must be able to answer well at launch. They define what "good retrieval" means for acceptance testing.

### UC-01: Domain and Topic Knowledge
> "What does Outfox know about organisational change in manufacturing?"

The system retrieves relevant chunks from reference material and case studies. Claude synthesises a response drawing on Outfox's documented expertise. Sources cite the contributing documents.

### UC-02: Past Engagement Recall
> "What happened on the [client name] project? What were the key findings?"

The system retrieves chunks from ingested engagement transcripts or case studies matching that client. Claude summarises the documented outcomes and context.

### UC-03: Methodology Questions
> "How does Outfox approach stakeholder mapping in a transformation engagement?"

The system retrieves relevant methodology and process content from reference documents and past work. Claude describes the approach as documented, with citations.

---

## 9. Two-Tier Architecture Context

This system is **Tier 1 — Global Interface**. It stores all Outfox knowledge and answers general queries.

**Tier 2 — Claude Projects** are purpose-built assistants seeded with focused document sets exported from Tier 1. A Tier 2 project might be a dedicated assistant for a specific client engagement, loaded with all transcripts and case studies relevant to that client's industry.

Tier 2 is not in scope for this build. However, the schema, chunking strategy, and document metadata (category, industry, doc_type) are designed to support a future export mechanism without architectural changes.

---

## 10. Success Criteria

The system is considered successful at launch when:

1. **Retrieval accuracy:** For each of the three primary use cases (UC-01, UC-02, UC-03), a staff member can ask a representative question and receive an answer that is correct, grounded in the ingested documents, and accompanied by accurate source citations.

2. **Speed:** Queries complete reliably without timeout. There is no hard target, but a response within 10–15 seconds under normal API conditions is expected.

3. **Knowledge resilience:** A staff member with no prior knowledge of a past project can ask about it and receive a useful answer from the KB — without needing to ask a colleague.

4. **Zero hallucination on empty KB:** When asked about a topic with no relevant ingested documents, the system returns "No relevant documents found" rather than fabricating an answer.

5. **Ingestion is repeatable:** The Python script can be run by any Outfox operator on a standard machine, producing consistent results, with clear terminal output confirming what was stored.

---

## 11. Assumptions and Dependencies

| Item | Assumption |
|---|---|
| Supabase | Project `outfox-kb` exists and pgvector is enabled. Schema is complete as documented in [01_SCHEMA.md](01_SCHEMA.md). |
| OpenAI API | `text-embedding-3-small` is available and the API key has sufficient quota for development and production use. |
| Anthropic API | Claude API key is active with access to `claude-sonnet-4-6`. |
| Vercel | A Vercel account is available for deploying two separate static projects. |
| Python | Operators running the ingestion script have Python 3.10+ installed and can run `pip install`. |
| Content quality | Documents ingested via "Distill First" path are expected to produce better retrieval quality than raw unstructured content. |
| PDF content | PDFs ingested are text-based (not scanned images). Scanned PDFs will not produce useful text. |

---

## 12. Open Questions (Post-v1)

These questions are deferred and do not block the v1 build.

| Question | Notes |
|---|---|
| Will client-confidential content ever need to be restricted from certain users? | Currently all content is treated as equally accessible. If client-specific access control is needed, it would require RLS policy changes and a user identity mechanism — significant scope addition. |
| What is the export format for Tier 2 seeding? | To be designed once Tier 1 is stable and in use. |
| Should the KB surface a confidence signal to the user alongside the answer? | E.g., "Based on 3 sources with high relevance" vs. "Based on 1 source with moderate relevance." |
| Is there a retention or archival policy for ingested documents? | Currently documents stay in Supabase indefinitely. |
