"""
chunker.py — Dynamic chunking pipeline for the Outfox KB ingestion pipeline.

Routes documents to the appropriate chunking strategy based on detected format,
then returns a list of chunk dicts ready for embedding and storage.

Each chunk dict contains:
  text           str   — the chunk content
  section_label  str|None — heading/section the chunk belongs to
  chunk_index    int   — 0-based position within the parent document
  chunk_strategy str   — which chunker produced this chunk
  token_count    int   — token count via tiktoken cl100k_base
"""

import io
import re

import tiktoken

_enc = tiktoken.get_encoding('cl100k_base')


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def route_and_chunk(text: str, fmt: str) -> list[dict]:
    """
    Route text to the appropriate chunker based on detected format.

    Args:
        text: Full document text (already extracted if PDF).
        fmt:  Format string from detector.detect_format().

    Returns:
        List of chunk dicts.
    """
    if fmt == 'markdown':
        return document_aware_chunk(text)
    if fmt == 'faq':
        return pair_preserving_chunk(text)
    if fmt == 'csv':
        return row_level_chunk(text)
    if fmt == 'transcript':
        return speaker_turn_chunk(text)
    # plaintext, pdf (after extraction), or unknown
    return recursive_chunk(text)


# ---------------------------------------------------------------------------
# Chunkers
# ---------------------------------------------------------------------------

def recursive_chunk(text: str, chunk_size: int = 500, overlap: int = 75) -> list[dict]:
    """
    General-purpose chunker. Splits at paragraph boundaries, falls back to
    sentence boundaries for oversized paragraphs. Applies token overlap at
    chunk seams.
    """
    units = _semantic_units(text, chunk_size)
    raw_chunks = _sliding_window(units, chunk_size, overlap)
    return _format_chunks(raw_chunks, 'recursive', section_label=None)


def document_aware_chunk(text: str, chunk_size: int = 500, overlap: int = 75) -> list[dict]:
    """
    Splits at Markdown headers (# / ## / ###), stores the header as
    section_label, then recursively chunks within each section.
    Falls back to recursive_chunk if no headers are found.
    """
    header_re = re.compile(r'^(#{1,3})\s+(.+)$', re.MULTILINE)
    sections = _split_by_headers(text, header_re)

    if not sections:
        return recursive_chunk(text, chunk_size, overlap)

    all_chunks: list[dict] = []
    for label, section_text in sections:
        units = _semantic_units(section_text, chunk_size)
        raw_chunks = _sliding_window(units, chunk_size, overlap)
        all_chunks.extend(_format_chunks(raw_chunks, 'document-aware', section_label=label))

    # Re-index across all sections
    for i, chunk in enumerate(all_chunks):
        chunk['chunk_index'] = i

    return all_chunks


def pair_preserving_chunk(text: str) -> list[dict]:
    """
    Keeps each Q+A pair as a single atomic chunk.
    Detects Q:/Q1./Question: ... A:/Answer: patterns.
    Falls back to recursive_chunk if no pairs are found.
    """
    qa_re = re.compile(
        r'((?:Q:|Q\d+[.)]|Question:)[ \t]*[^\n]+(?:\n(?!(?:Q:|Q\d+[.)]|Question:|A:|Answer:))[^\n]*)*)'
        r'\s*'
        r'((?:A:|Answer:)[ \t]*[^\n]+(?:\n(?!(?:Q:|Q\d+[.)]|Question:|A:|Answer:))[^\n]*)*)',
        re.IGNORECASE | re.MULTILINE,
    )

    pairs = qa_re.findall(text)
    if not pairs:
        return recursive_chunk(text)

    raw_chunks = [f"{q.strip()}\n{a.strip()}" for q, a in pairs]
    return _format_chunks(raw_chunks, 'pair-preserving', section_label=None)


def row_level_chunk(csv_text: str) -> list[dict]:
    """
    One row per chunk for CSV/tabular data.
    Stringifies each row as "column: value | column: value ...".
    Falls back to recursive_chunk if pandas cannot parse the input.
    """
    try:
        import pandas as pd
        df = pd.read_csv(io.StringIO(csv_text))
    except Exception:
        return recursive_chunk(csv_text)

    raw_chunks = []
    for _, row in df.iterrows():
        parts = [f"{col}: {val}" for col, val in row.items() if _notna(val)]
        if parts:
            raw_chunks.append(' | '.join(parts))

    if not raw_chunks:
        return recursive_chunk(csv_text)

    return _format_chunks(raw_chunks, 'row-level', section_label=None)


def speaker_turn_chunk(text: str, max_tokens: int = 300) -> list[dict]:
    """
    Splits at speaker-turn markers ("Name: ..."), merges short consecutive
    turns up to max_tokens. Falls back to recursive_chunk if no turns found.
    """
    turn_re = re.compile(r'^(?=[A-Z][a-zA-Z ]{1,30}:\s+\S)', re.MULTILINE)
    segments = [s.strip() for s in turn_re.split(text) if s.strip()]

    if len(segments) < 2:
        return recursive_chunk(text)

    # Merge short consecutive turns
    merged: list[str] = []
    buffer: list[str] = []
    buffer_tokens = 0

    for seg in segments:
        seg_tokens = _count_tokens(seg)
        if buffer_tokens + seg_tokens <= max_tokens:
            buffer.append(seg)
            buffer_tokens += seg_tokens
        else:
            if buffer:
                merged.append('\n'.join(buffer))
            buffer = [seg]
            buffer_tokens = seg_tokens

    if buffer:
        merged.append('\n'.join(buffer))

    return _format_chunks(merged, 'speaker-turn', section_label=None)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def _semantic_units(text: str, chunk_size: int) -> list[str]:
    """
    Split text into semantic units: paragraphs, with large paragraphs
    further split into sentences.
    """
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    units: list[str] = []
    for para in paragraphs:
        if _count_tokens(para) > chunk_size * 0.6:
            # Large paragraph: split into sentences
            sentences = re.split(r'(?<=[.!?])\s+', para)
            units.extend(s.strip() for s in sentences if s.strip())
        else:
            units.append(para)
    return units


def _sliding_window(units: list[str], chunk_size: int, overlap: int) -> list[str]:
    """
    Accumulate units into chunks of up to chunk_size tokens.
    Prepends overlap tokens from the previous chunk at each boundary.
    """
    if not units:
        return []

    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for unit in units:
        unit_tokens = _count_tokens(unit)

        if current_tokens + unit_tokens > chunk_size and current:
            chunk_text = '\n\n'.join(current)
            chunks.append(chunk_text)

            # Overlap: last N tokens of the completed chunk
            overlap_text = _tail_tokens(chunk_text, overlap)
            if overlap_text:
                current = [overlap_text, unit]
                current_tokens = _count_tokens(overlap_text) + unit_tokens
            else:
                current = [unit]
                current_tokens = unit_tokens
        else:
            current.append(unit)
            current_tokens += unit_tokens

    if current:
        chunks.append('\n\n'.join(current))

    return chunks


def _tail_tokens(text: str, n: int) -> str:
    """Return the last n tokens of text decoded back to a string."""
    tokens = _enc.encode(text)
    if len(tokens) <= n:
        return text
    return _enc.decode(tokens[-n:])


def _split_by_headers(text: str, header_re: re.Pattern) -> list[tuple[str | None, str]]:
    """
    Split text on Markdown headers. Returns list of (label, content) pairs.
    Content before the first header is captured with label=None.
    """
    sections: list[tuple[str | None, str]] = []
    last_end = 0
    current_label: str | None = None

    for match in header_re.finditer(text):
        content = text[last_end:match.start()].strip()
        if content:
            sections.append((current_label, content))
        current_label = match.group(2).strip()
        last_end = match.end()

    remaining = text[last_end:].strip()
    if remaining:
        sections.append((current_label, remaining))

    return sections


def _format_chunks(
    texts: list[str],
    strategy: str,
    section_label: str | None,
) -> list[dict]:
    """Convert a list of text strings into chunk dicts."""
    chunks = []
    for i, text in enumerate(texts):
        text = text.strip()
        if not text:
            continue
        chunks.append({
            'text': text,
            'section_label': section_label,
            'chunk_index': i,
            'chunk_strategy': strategy,
            'token_count': _count_tokens(text),
        })
    return chunks


def _notna(val) -> bool:
    """Return True if val is not NaN/None/empty."""
    import math
    if val is None:
        return False
    try:
        if math.isnan(float(val)):
            return False
    except (TypeError, ValueError):
        pass
    return str(val).strip() != ''
