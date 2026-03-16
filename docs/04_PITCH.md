# 04_PITCH.md — Client-Facing Pitch Reference
**Outfox Consulting — Queryable Knowledge Base**
*Internal use: sales calls, discovery meetings, follow-up decks*
*Last updated: 2026-03-15*

---

## What It Is

A private, queryable knowledge base built from your documents, content, and institutional knowledge — so you or your team can ask it anything in plain English and get a sourced, accurate answer instantly. No more digging through folders, forwarding emails, or waiting for a colleague to remember. Your knowledge works for you on demand.

---

## How It Works

```
    STEP 1: INGEST           STEP 2: STORE            STEP 3: QUERY
    ─────────────────        ────────────────          ─────────────────
    Your documents     →     Processed into      →     Ask in plain
    (PDFs, notes,            searchable pieces          English. Get a
    scripts, FAQs,           in a private,              sourced answer
    spreadsheets)            hosted database            in seconds.
```

Every answer comes with citations — you always know exactly which document it came from.

---

## What Goes In

The knowledge base is only as good as the content you put in it. Here's what works by vertical:

### Real Estate Agents
- Listing scripts and objection handlers
- Neighborhood and market FAQs
- Transaction checklists and MLS explanations
- Past client Q&A sessions
- Market reports and stats
- Agent-to-client communication templates

### Small Business Owners
- Standard operating procedures (SOPs)
- Employee training and onboarding materials
- Customer FAQs and service descriptions
- Pricing rationale and policy docs
- Vendor contacts and product specs

### Medical and Dental Practices
- Insurance FAQs and billing explanations (in plain language)
- Pre- and post-care instructions
- Staff protocols and consent form summaries
- Front-desk call scripts

### Contractors and Trades
- Bid templates and jurisdiction-specific requirements
- Material specs and subcontractor contacts
- Project checklists and safety protocols
- Client FAQ generators

---

## What You Get

**Core Deliverable — The Knowledge Base:**
- A private, hosted database of your content — not shared with any public AI
- A clean web interface to query it from any device, any browser
- Source citations with every answer so you know exactly where it came from
- An ingestion process for adding new documents as your content grows

**Optional Add-Ons (Spoke Tools):**
Once the knowledge base is built and stable, additional tools can be layered on:

| Spoke | What It Does |
|---|---|
| Client-facing FAQ bot | Let your clients query a curated subset of your KB directly |
| Document generator | Draft listing packages, reports, or proposals from KB content |
| Staff onboarding assistant | New team members get answers from your SOPs and playbooks |
| Trigger / alert system | Flag when a query returns "I don't know" — identifies gaps |

Each spoke increases the value of the KB and raises the switching cost.

---

## The Hub-and-Spoke Model

```
              ┌─────────────────────────────┐
              │     Knowledge Base (Hub)    │
              │   Your private vector store  │
              └────────────┬────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ↓                ↓                ↓
     Chat Interface    Doc Generator    Client FAQ Bot
     (Ask anything)   (Draft from KB)  (Filtered view)
```

The KB is always built first. Spokes are added after the hub is stable — not before. Every spoke added increases your ROI and reduces the likelihood a client switches away.

---

## Pricing

Pricing is based on complexity, content volume, and which spokes are included.

| Vertical | Monthly Range | Notes |
|---|---|---|
| Real Estate Agents | $200–500/mo | Agents are accustomed to paying for tools. Position as "the brain that never forgets a script or a deal." |
| Small Business Owners | $150–300/mo | Sell time savings — one less hour of owner Q&A per day justifies the cost. |
| Medical / Dental Practices | $300–600/mo | High compliance value. Less front desk call volume. Position around staff efficiency. |
| Contractors / Trades | $150–250/mo | Underserved vertical, low tech adoption = lower resistance to entry pricing. |

**What's included in the monthly fee:**
- Hosting (Vercel + Supabase)
- API usage costs (embedded in fee — no surprise bills)
- Ongoing content additions (up to agreed volume per month)
- Minor updates and tuning

**Setup fee (recommended):** One-time $500–1,500 depending on content volume and complexity. Covers content audit, ingestion, and initial quality validation.

---

## Getting Started

A typical engagement runs 2–4 weeks from kickoff to a live, queryable KB.

**Week 1 — Content Audit**
- 30-minute call to identify your highest-value documents
- We tell you what's worth loading and in what order
- You provide the files; we handle the rest

**Weeks 1–2 — Build and Ingest**
- Documents are processed, chunked, and loaded into your private KB
- You can query it as content goes in — no waiting for "all or nothing"

**Week 3 — Demo and Handoff**
- We run a live demo of your KB together
- You and your team can start querying immediately
- Additional documents can be added on an ongoing basis

---

## Common Questions

**Is my data private?**
Yes. Your knowledge base is isolated and completely private. Your content is not used to train any AI model and is not visible to anyone else. You own it.

**What if my content changes?**
Re-ingest the updated document. The old version is automatically replaced. No data stacks up or gets stale.

**Can my clients use it?**
Yes — with a client-facing spoke. You control exactly what they can see and ask. It's a separate, filtered interface connected to the same KB.

**What happens if the AI doesn't know the answer?**
It says so. The system is designed to return "No relevant documents found" rather than guess or hallucinate. This is a feature — not a bug.

**Do I need to be technical to use it?**
No. Querying the KB is as simple as typing a question. Adding documents uses a simple web form — no code required. The technical work is done once during setup.

**What does it cost to run after setup?**
Hosting and API costs are covered in the monthly fee. There are no separate bills from OpenAI or Supabase. One predictable number.

**Can you build this for my industry even if it's not on your list?**
Almost certainly. The KB architecture works for any business that has documents, SOPs, FAQs, or institutional knowledge they want to make queryable. The setup process is the same.

---

## The Live Demo

> "Rather than describe it, let me show you. This is the knowledge base we built for Outfox — loaded with our own methodology, case studies, and market research. Ask it anything."

**Suggested live demo questions:**
- "What chunking strategy should we use for a real estate FAQ document?"
- "What was the pricing signal we found for real estate KB tools?"
- "How do we handle a client's PDF documents in the ingestion pipeline?"
- "What's the hub-and-spoke product model?"

The demo is the proof. The Outfox KB is a working, live system — not a slide deck.

---

*This document is an internal sales reference. It is not a formal proposal or contract. Pricing and scope are discussed during discovery.*
