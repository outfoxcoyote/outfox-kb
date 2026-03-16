"""
detector.py — Format detector for the Outfox KB ingestion pipeline.

Determines document format from filename extension and content signature.
Returns one of: 'csv', 'pdf', 'faq', 'transcript', 'markdown', 'plaintext'
"""

import os
import re


def detect_format(filename: str, text: str | None = None) -> str:
    """
    Detect document format from filename extension and content signature.

    Priority order:
    1. Extension-based (.csv, .pdf) — unambiguous
    2. Content signature (FAQ markers, speaker turns, markdown headers)
    3. Extension fallback (.md → markdown)
    4. Default: plaintext
    """
    ext = os.path.splitext(filename)[1].lower() if filename else ''

    # Extension-based — highest confidence, no content needed
    if ext == '.csv':
        return 'csv'
    if ext == '.pdf':
        return 'pdf'

    # Content-based — requires text
    if text and text.strip():
        # FAQ: look for Q:/Question: patterns appearing at least twice
        faq_pattern = re.compile(
            r'^(Q:|Q\d+[.)]|Question:)',
            re.MULTILINE | re.IGNORECASE
        )
        if len(faq_pattern.findall(text)) >= 2:
            return 'faq'

        # Transcript: multiple distinct speakers with "Name:" at line start
        # Require at least 2 unique speakers and 4 total turns to avoid false positives
        speaker_pattern = re.compile(r'^([A-Z][a-zA-Z ]{1,30}):\s+\S', re.MULTILINE)
        speaker_matches = speaker_pattern.findall(text)
        unique_speakers = set(speaker_matches)
        if len(unique_speakers) >= 2 and len(speaker_matches) >= 4:
            return 'transcript'

        # Markdown: has at least one ATX header (# / ## / ###)
        if re.search(r'^#{1,3}\s+\S', text, re.MULTILINE):
            return 'markdown'

    # Extension fallback for markdown files with no content signal
    if ext in ('.md', '.markdown'):
        return 'markdown'

    return 'plaintext'
