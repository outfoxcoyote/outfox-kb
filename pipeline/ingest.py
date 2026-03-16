"""
ingest.py — CLI entry point for the Outfox KB ingestion pipeline.

Usage:
    python pipeline/ingest.py --input path/to/outfox-ingest-*.json

What it does:
    1. Loads secrets from .env
    2. Reads and validates the handoff JSON from the intake form
    3. Extracts text (or decodes PDF base64 and extracts with pypdf)
    4. Detects document format and routes to the appropriate chunker
    5. Embeds each chunk via OpenAI
    6. Deletes existing rows by title (deduplication)
    7. Inserts all chunk rows into Supabase
"""

import argparse
import base64
import io
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (one level up from pipeline/)
load_dotenv(Path(__file__).parent.parent / '.env')

from detector import detect_format
from chunker import route_and_chunk
from embedder import embed_chunk
from supabase_client import delete_by_title, insert_chunk


def extract_pdf_text(b64_string: str) -> str:
    """Decode base64 PDF and extract plain text via pypdf."""
    from pypdf import PdfReader
    pdf_bytes = base64.b64decode(b64_string)
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = [page.extract_text() or '' for page in reader.pages]
    return '\n\n'.join(p for p in pages if p.strip())


def load_and_validate(input_path: str) -> dict:
    """Read handoff JSON and validate required fields."""
    path = Path(input_path)
    if not path.exists():
        print(f'Error: file not found: {input_path}')
        sys.exit(1)

    with open(path, 'r', encoding='utf-8') as f:
        payload = json.load(f)

    if not payload.get('title', '').strip():
        print('Error: handoff JSON is missing a non-empty "title" field.')
        sys.exit(1)

    if not payload.get('content') and not payload.get('pdf_b64'):
        print('Error: handoff JSON must contain either "content" or "pdf_b64".')
        sys.exit(1)

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description='Outfox KB ingestion pipeline')
    parser.add_argument('--input', required=True, help='Path to handoff JSON file')
    args = parser.parse_args()

    payload = load_and_validate(args.input)

    title        = payload['title'].strip()
    is_distilled = payload.get('is_distilled', False)
    doc_type     = payload.get('doc_type')
    category     = payload.get('category')
    subcategory  = payload.get('subcategory')
    industry     = payload.get('industry')
    source       = payload.get('source')

    # --- Extract text ---
    if payload.get('pdf_b64'):
        print(f'Extracting text from PDF: {title}')
        text = extract_pdf_text(payload['pdf_b64'])
        filename = title + '.pdf'
    else:
        text = payload['content']
        filename = title + '.txt'

    if not text.strip():
        print('Error: document text is empty after extraction.')
        sys.exit(1)

    print(f'Starting ingestion: {title}')

    # --- Detect format and chunk ---
    fmt = detect_format(filename, text)
    chunks = route_and_chunk(text, fmt)

    print(f'Chunking complete: {title} — {len(chunks)} chunks via {fmt}')

    # --- Embed and store ---
    delete_by_title(title)

    errors = 0
    for i, chunk in enumerate(chunks):
        try:
            embedding = embed_chunk(chunk['text'])
            row = {
                'title':          title,
                'content':        chunk['text'],
                'embedding':      embedding,
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
                'client_id':      None,
            }
            insert_chunk(row)
            print(f'  Stored chunk {i + 1}/{len(chunks)}: {title}')
        except Exception as e:
            print(f'  Error on chunk {i + 1}: {e}')
            errors += 1

    strategy = chunks[0]['chunk_strategy'] if chunks else fmt
    print(f'Ingestion complete: {title} — {len(chunks)} chunks via {strategy}, {errors} errors')


if __name__ == '__main__':
    main()
