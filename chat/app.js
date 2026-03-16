'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let isLoading = false;

// ── Element refs ───────────────────────────────────────────────────────────
const questionEl     = document.getElementById('question');
const askBtn         = document.getElementById('ask_btn');
const queryStatus    = document.getElementById('query_status');
const answerSection  = document.getElementById('answer_section');
const answerContent  = document.getElementById('answer_content');
const sourcesSection = document.getElementById('sources_section');
const sourcesList    = document.getElementById('sources_list');
const noResults      = document.getElementById('no_results');

// ── Submit handlers ────────────────────────────────────────────────────────
askBtn.addEventListener('click', handleQuery);
questionEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleQuery();
});

// ── Main flow ──────────────────────────────────────────────────────────────
async function handleQuery() {
  if (isLoading) return;

  const question = questionEl.value.trim();
  if (!question) {
    setStatus('Enter a question first.', 'error');
    return;
  }

  // Validate config
  if (typeof CONFIG === 'undefined') {
    setStatus('config.js not found. Copy config.example.js → config.js and fill in your keys.', 'error');
    return;
  }
  const missing = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']
    .filter(k => !CONFIG[k]);
  if (missing.length) {
    setStatus(`Missing in config.js: ${missing.join(', ')}`, 'error');
    return;
  }

  // Reset UI
  answerSection.hidden = true;
  noResults.hidden     = true;
  setStatus('', '');

  isLoading       = true;
  askBtn.disabled = true;

  try {
    // 1. Embed
    setStatus('Embedding question…', 'loading');
    const embedding = await embedQuestion(question);

    // 2. Search
    setStatus('Searching knowledge base…', 'loading');
    const chunks = await searchKB(embedding);

    if (!chunks || chunks.length === 0) {
      noResults.hidden = false;
      setStatus('', '');
      return;
    }

    // 3. Generate
    setStatus('Generating answer…', 'loading');
    const answer = await generateAnswer(question, chunks);

    // 4. Render
    renderAnswer(answer, chunks);
    setStatus('', '');

  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    isLoading       = false;
    askBtn.disabled = false;
  }
}

// ── Step 1: Embed question ─────────────────────────────────────────────────
async function embedQuestion(text) {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI error (${resp.status}) — check your OPENAI_API_KEY.`);
  const data = await resp.json();
  return data.data[0].embedding;
}

// ── Step 2: Search KB ──────────────────────────────────────────────────────
async function searchKB(embedding) {
  const url = CONFIG.SUPABASE_URL.replace(/\/$/, '');
  const key = CONFIG.SUPABASE_ANON_KEY;

  const resp = await fetch(`${url}/rest/v1/rpc/match_documents`, {
    method: 'POST',
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      query_embedding:  embedding,
      match_count:      5,
      match_threshold:  0.3,
      filter_doc_type:  null,
      filter_client_id: null,
    }),
  });

  if (!resp.ok) throw new Error(`Supabase error (${resp.status}) — check your SUPABASE_URL and SUPABASE_ANON_KEY.`);
  return resp.json();
}

// ── Step 3: Generate answer ────────────────────────────────────────────────
async function generateAnswer(question, chunks) {
  // Format retrieved chunks as numbered context blocks
  const context = chunks.map((c, i) => {
    const label = [c.title, c.section_label].filter(Boolean).join(' › ');
    return `[${i + 1}] ${label}\n${c.content}`;
  }).join('\n\n---\n\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':                               CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version':                       '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type':                            'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are the Outfox KB assistant. Answer the question using only the context provided. ' +
        'If the context does not contain enough information to answer fully, say so clearly. ' +
        'Do not use knowledge outside of what is provided in the context.',
      messages: [{
        role:    'user',
        content: `Context from the Outfox Knowledge Base:\n\n${context}\n\nQuestion: ${question}`,
      }],
    }),
  });

  if (resp.status === 429) throw new Error('Rate limit reached — wait a moment and try again.');
  if (!resp.ok)            throw new Error(`Claude error (${resp.status}) — check your ANTHROPIC_API_KEY.`);

  const data = await resp.json();
  return data.content[0].text;
}

// ── Step 4: Render ─────────────────────────────────────────────────────────
function renderAnswer(answer, chunks) {
  answerContent.innerHTML = renderMarkdown(answer);

  // Build sources — deduplicate by title, collect section labels per doc
  const seen = new Map(); // title → { doc_type, category, source, sections[] }
  for (const c of chunks) {
    if (!seen.has(c.title)) {
      seen.set(c.title, { doc_type: c.doc_type, category: c.category, source: c.source, sections: [] });
    }
    if (c.section_label && !seen.get(c.title).sections.includes(c.section_label)) {
      seen.get(c.title).sections.push(c.section_label);
    }
  }

  sourcesList.innerHTML = '';
  for (const [title, meta] of seen) {
    const li = document.createElement('li');
    li.className = 'source-item';

    // Title (link if source is a URL)
    const titleEl = document.createElement('span');
    titleEl.className = 'source-title';
    const isUrl = meta.source && /^https?:\/\//.test(meta.source);
    if (isUrl) {
      const a = document.createElement('a');
      a.href = meta.source;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = title;
      titleEl.appendChild(a);
    } else {
      titleEl.textContent = title;
    }
    li.appendChild(titleEl);

    // doc_type · category
    const metaParts = [meta.doc_type, meta.category].filter(Boolean);
    if (metaParts.length) {
      const metaEl = document.createElement('span');
      metaEl.className = 'source-meta';
      metaEl.textContent = metaParts.join(' · ');
      li.appendChild(metaEl);
    }

    // Section labels
    if (meta.sections.length) {
      const sectEl = document.createElement('span');
      sectEl.className = 'source-sections';
      sectEl.textContent = 'Sections: ' + meta.sections.join(', ');
      li.appendChild(sectEl);
    }

    sourcesList.appendChild(li);
  }

  sourcesSection.hidden = seen.size === 0;
  answerSection.hidden  = false;

  answerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Markdown renderer ──────────────────────────────────────────────────────
// Covers the subset Claude typically produces: headers, bold, italic,
// inline code, bullet lists, and paragraphs.
function renderMarkdown(text) {
  // Escape HTML entities first
  let html = text
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h2>$1</h2>');

  // Inline: bold, italic, code
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  html = html.replace(/`(.+?)`/g,       '<code>$1</code>');

  // Bullet list items
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> blocks in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphs — split on blank lines
  const blocks = html.split(/\n{2,}/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-6]|ul|ol|li|blockquote)/.test(block)) return block;
    return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  return html;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  queryStatus.textContent = msg;
  queryStatus.className   = type ? `status-msg ${type}` : 'status-msg';
}
