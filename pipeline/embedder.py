"""
embedder.py — OpenAI embedding calls for the Outfox KB pipeline.

Uses text-embedding-3-small (1536 dimensions).
Retries on 429 (rate limit) with exponential backoff.
"""

import time
import os
from openai import OpenAI, RateLimitError

_MODEL = 'text-embedding-3-small'
_DIMENSIONS = 1536


def embed_chunk(text: str) -> list[float]:
    """
    Embed a single text string using OpenAI text-embedding-3-small.
    Returns a list of 1536 floats.
    Retries up to 3 times on rate limit (429) with exponential backoff.
    Raises on all other errors.
    """
    client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    wait = 2

    for attempt in range(3):
        try:
            response = client.embeddings.create(
                model=_MODEL,
                input=text,
            )
            embedding = response.data[0].embedding
            if len(embedding) != _DIMENSIONS:
                raise ValueError(
                    f'Expected {_DIMENSIONS} dimensions, got {len(embedding)}'
                )
            return embedding
        except RateLimitError:
            if attempt == 2:
                raise
            print(f'  Rate limit hit — waiting {wait}s before retry...')
            time.sleep(wait)
            wait *= 2

    raise RuntimeError('embed_chunk: exhausted retries')
