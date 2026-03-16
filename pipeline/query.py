"""
query.py — CLI retrieval test for the Outfox KB.

Usage:
    py pipeline/query.py --question "What is the recommended chunking strategy?"
    py pipeline/query.py --question "What does Outfox charge for real estate?" --top_k 5
    py pipeline/query.py --question "What goes in a real estate KB?" --doc_type market-intelligence

What it does:
    1. Embeds the question via OpenAI text-embedding-3-small
    2. Calls the match_documents RPC on Supabase
    3. Prints the top matching chunks with similarity scores and metadata

Prerequisites:
    - match_documents RPC must exist in Supabase (see docs/01_SCHEMA.md for SQL)
    - .env must have OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

import httpx
from embedder import embed_chunk


DOC_TYPES = [
    'methodology',
    'market-intelligence',
    'case-study',
    'sop',
    'transcript',
    'reference',
]


def search(question: str, top_k: int = 5, doc_type: str | None = None) -> list[dict]:
    """Embed the question and call match_documents RPC on Supabase."""
    print('Embedding question...')
    embedding = embed_chunk(question)

    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    headers = {
        'apikey':          key,
        'Authorization':   f'Bearer {key}',
        'Content-Type':    'application/json',
    }

    body: dict = {
        'query_embedding': embedding,
        'match_count':     top_k,
    }
    if doc_type:
        body['filter_doc_type'] = doc_type

    print('Searching KB...')
    response = httpx.post(
        f'{url}/rest/v1/rpc/match_documents',
        json=body,
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def main() -> None:
    parser = argparse.ArgumentParser(description='Query the Outfox KB via semantic search')
    parser.add_argument('--question', required=True, help='Natural language question')
    parser.add_argument('--top_k',    type=int, default=5, help='Number of results (default: 5)')
    parser.add_argument('--doc_type', default=None, choices=DOC_TYPES,
                        help='Filter by document type (optional)')
    args = parser.parse_args()

    print(f'\nQuestion: {args.question}')
    print('─' * 60)

    results = search(args.question, args.top_k, args.doc_type)

    if not results:
        print('\nNo results returned. Is the KB empty? Has match_documents RPC been created?')
        return

    for i, r in enumerate(results, 1):
        similarity = r.get('similarity', 0)
        title      = r.get('title', '(no title)')
        section    = r.get('section_label') or '—'
        strategy   = r.get('chunk_strategy', '—')
        content    = r.get('content', '')

        print(f'\n{"─" * 60}')
        print(f'Result {i}  |  similarity: {similarity:.4f}')
        print(f'  Title:    {title}')
        print(f'  Section:  {section}')
        print(f'  Strategy: {strategy}')
        print(f'\n  Chunk text:')
        for line in content.split('\n'):
            print(f'    {line}')

    print(f'\n{"─" * 60}')
    print(f'{len(results)} result(s) returned.')


if __name__ == '__main__':
    main()
