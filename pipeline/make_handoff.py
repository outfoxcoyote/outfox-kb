"""
make_handoff.py — Convert a local file to an Outfox KB handoff JSON.

Usage:
    py pipeline/make_handoff.py \\
        --input outfox-kb-market-intelligence.md \\
        --title "Outfox Market Intelligence: Queryable Knowledge Base Landscape" \\
        --doc_type market-intelligence \\
        --category Strategy \\
        --subcategory "Market Research" \\
        --output pipeline/content/outfox-market-intelligence.json

Supports: .md, .txt (content field), .pdf (pdf_b64 field)
"""

import argparse
import base64
import json
from pathlib import Path


DOC_TYPES = [
    'methodology',
    'market-intelligence',
    'case-study',
    'sop',
    'transcript',
    'reference',
]


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Create Outfox KB handoff JSON from a local file'
    )
    parser.add_argument('--input',       required=True,  help='Path to source file (.md, .txt, or .pdf)')
    parser.add_argument('--title',       required=True,  help='Document title (used as deduplication key in Supabase)')
    parser.add_argument('--doc_type',    required=True,  choices=DOC_TYPES, help='Document type')
    parser.add_argument('--category',    default=None,   help='Category label (optional)')
    parser.add_argument('--subcategory', default=None,   help='Subcategory label (optional)')
    parser.add_argument('--industry',    default=None,   help='Target industry (optional)')
    parser.add_argument('--output',      required=True,  help='Output path for handoff JSON')
    parser.add_argument('--distilled',   action='store_true', help='Mark document as pre-distilled content')
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f'Error: file not found: {args.input}')
        raise SystemExit(1)

    suffix = input_path.suffix.lower()

    if suffix == '.pdf':
        with open(input_path, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')
        payload = {
            'title':   args.title,
            'content': None,
            'pdf_b64': b64,
        }
    else:
        text = input_path.read_text(encoding='utf-8')
        payload = {
            'title':   args.title,
            'content': text,
            'pdf_b64': None,
        }

    payload.update({
        'doc_type':    args.doc_type,
        'category':    args.category,
        'subcategory': args.subcategory,
        'industry':    args.industry,
        'source':      input_path.name,
        'is_distilled': args.distilled,
    })

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f'Handoff JSON written: {output_path}')
    print(f'  Title:    {args.title}')
    print(f'  Doc type: {args.doc_type}')
    print(f'  Source:   {input_path.name}')
    print(f'  PDF mode: {suffix == ".pdf"}')


if __name__ == '__main__':
    main()
