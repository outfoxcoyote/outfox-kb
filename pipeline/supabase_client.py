"""
supabase_client.py — Supabase REST API client for the Outfox KB pipeline.

Uses httpx directly to talk to the Supabase PostgREST REST API.
No supabase-py package required — avoids its pyiceberg/pyroaring build dependencies.

Operations:
  delete_by_title(title)  — remove all existing chunks for a document (deduplication)
  insert_chunk(row)        — insert one chunk row with all metadata
"""

import os
import httpx


def _client() -> tuple[str, dict]:
    """Return (base_url, headers) for Supabase REST API calls."""
    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    return f'{url}/rest/v1', headers


def delete_by_title(title: str) -> None:
    """
    Delete all rows in `documents` where title matches.
    This is the deduplication step — always called before re-ingesting a document.
    """
    base_url, headers = _client()
    response = httpx.delete(
        f'{base_url}/documents',
        params={'title': f'eq.{title}'},
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()


def insert_chunk(row: dict) -> None:
    """
    Insert one chunk row into the `documents` table.
    The row dict must include all required fields: title, content, embedding.
    Raises httpx.HTTPStatusError on failure.
    """
    base_url, headers = _client()
    response = httpx.post(
        f'{base_url}/documents',
        json=row,
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()
