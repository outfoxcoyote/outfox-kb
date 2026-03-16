'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let inputMode     = 'text';  // 'text' | 'file'
let fileData      = null;    // { type: 'pdf'|'text', content: string, name: string }
let processedData = null;    // { text, b64, isDistilled, isPdf }

// ── Element refs ───────────────────────────────────────────────────────────
const titleEl       = document.getElementById('title');
const docTypeEl     = document.getElementById('doc_type');
const categoryEl    = document.getElementById('category');
const subcategoryEl = document.getElementById('subcategory');
const industryEl    = document.getElementById('industry');
const sourceEl      = document.getElementById('source');

const textArea     = document.getElementById('text_content');
const fileInput    = document.getElementById('file_input');
const fileDropZone = document.getElementById('file_drop_zone');
const fileStatusRow = document.getElementById('file_status_row');
const fileStatusEl  = document.getElementById('file_status');
const fileClearBtn  = document.getElementById('file_clear');

const distillNoteEl = document.getElementById('distill_note');
const distillRadio  = () => document.querySelector('[name="process_mode"][value="distill"]');
const getProcessMode = () => document.querySelector('[name="process_mode"]:checked')?.value;

const processBtn    = document.getElementById('process_btn');
const processStatus = document.getElementById('process_status');

const previewSection  = document.getElementById('preview_section');
const previewBadge    = document.getElementById('preview_badge');
const previewTextarea = document.getElementById('preview_text');
const pdfNotice       = document.getElementById('pdf_notice');
const downloadBtn     = document.getElementById('download_btn');

// ── Constants ──────────────────────────────────────────────────────────────
const ALLOWED_EXTS = ['.txt', '.md', '.pdf', '.csv'];
const MAX_BYTES    = 10 * 1024 * 1024; // 10 MB

const DISTILL_SYSTEM =
  'You are a knowledge management assistant for Outfox Consulting. Your task is to transform ' +
  'raw document input into a clean, well-structured document suitable for storage in a knowledge base.\n\n' +
  'Given the raw content, produce a restructured version that:\n' +
  '- Preserves all factual information, names, dates, decisions, and insights without omission or invention\n' +
  '- Organises the content with clear headings and logical sections\n' +
  '- Removes filler, repetition, and transcription artefacts\n' +
  '- Writes in clear, professional prose appropriate for a consulting knowledge base\n' +
  '- Does not add commentary, opinions, or information not present in the source\n\n' +
  'Return only the cleaned document. No preamble, no closing remarks.';

// ── Tabs ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const newMode = btn.dataset.tab;
    if (newMode === inputMode) return;
    inputMode = newMode;

    document.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === newMode);
      b.setAttribute('aria-selected', String(b.dataset.tab === newMode));
    });

    document.getElementById('text_pane').hidden = newMode !== 'text';
    document.getElementById('file_pane').hidden = newMode !== 'file';

    // Clear the opposite input when switching
    if (newMode === 'text') {
      clearFile();
    } else {
      textArea.value = '';
    }
    hidePreview();
  });
});

// ── File handling ──────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;

  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    setFileStatus(`"${ext}" files are not accepted. Use .txt, .md, .pdf, or .csv.`, 'error');
    return;
  }
  if (file.size > MAX_BYTES) {
    setFileStatus(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — exceeds the 10 MB limit.`, 'error');
    return;
  }

  const reader = new FileReader();

  if (ext === '.pdf') {
    reader.onload = e => {
      // Encode binary PDF to base64
      const bytes  = new Uint8Array(e.target.result);
      let   binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);

      fileData = { type: 'pdf', content: b64, name: file.name };
      setFileStatus(`${file.name}  (PDF · ${fmtSize(file.size)})`, 'ok');

      // Force Direct mode — PDF text extracted by Python pipeline, not browser
      document.querySelector('[name="process_mode"][value="direct"]').checked = true;
      distillRadio().disabled = true;
      distillNoteEl.textContent = 'PDF uploads are processed direct — text is extracted from the PDF during pipeline ingestion.';
      distillNoteEl.hidden = false;
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = e => {
      fileData = { type: 'text', content: e.target.result, name: file.name };
      setFileStatus(`${file.name}  (${fmtSize(file.size)})`, 'ok');
      distillRadio().disabled = false;
      distillNoteEl.hidden = true;
    };
    reader.readAsText(file, 'utf-8');
  }

  hidePreview();
}

function setFileStatus(msg, type) {
  fileStatusEl.textContent = msg;
  fileStatusEl.className   = `file-status-text ${type}`;
  fileStatusRow.hidden     = false;
}

function clearFile() {
  fileData = null;
  fileInput.value = '';
  fileStatusRow.hidden = true;
  distillRadio().disabled = false;
  distillNoteEl.hidden = true;
}

function fmtSize(bytes) {
  return bytes < 1024 * 1024
    ? Math.round(bytes / 1024) + ' KB'
    : (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// File input
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

// Drag and drop
fileDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  fileDropZone.classList.add('drag-over');
});
fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('drag-over'));
fileDropZone.addEventListener('drop', e => {
  e.preventDefault();
  fileDropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileDropZone.addEventListener('click', () => fileInput.click());

fileClearBtn.addEventListener('click', () => {
  clearFile();
  hidePreview();
});

// ── Process ────────────────────────────────────────────────────────────────
processBtn.addEventListener('click', async () => {
  hidePreview();
  setStatus('', '');

  const title = titleEl.value.trim();
  if (!title) {
    setStatus('Title is required.', 'error');
    return;
  }

  let rawText = null;
  let isPdf   = false;

  if (inputMode === 'text') {
    rawText = textArea.value.trim();
    if (!rawText) {
      setStatus('Paste some content, or switch to "Upload file".', 'error');
      return;
    }
  } else {
    if (!fileData) {
      setStatus('Upload a file first.', 'error');
      return;
    }
    if (fileData.type === 'pdf') {
      isPdf = true;
    } else {
      rawText = fileData.content;
    }
  }

  const processMode = getProcessMode();

  // ── Direct or PDF: no Claude call ──
  if (isPdf || processMode === 'direct') {
    processedData = {
      text:        rawText,
      b64:         isPdf ? fileData.content : null,
      isDistilled: false,
      isPdf,
    };
    showPreview(isPdf ? 'pdf' : 'direct', rawText);
    return;
  }

  // ── Distill First ──
  if (typeof CONFIG === 'undefined' || !CONFIG.ANTHROPIC_API_KEY) {
    setStatus('ANTHROPIC_API_KEY not found in config.js. Copy config.example.js → config.js and add your key.', 'error');
    return;
  }

  processBtn.disabled = true;
  setStatus('Distilling with Claude — this usually takes 10–30 seconds…', 'loading');

  try {
    const distilled = await callDistill(rawText);
    processedData = { text: distilled, b64: null, isDistilled: true, isPdf: false };
    showPreview('distill', distilled);
    setStatus('', '');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    processBtn.disabled = false;
  }
});

async function callDistill(text) {
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
      max_tokens: 4096,
      system:     DISTILL_SYSTEM,
      messages:   [{ role: 'user', content: text }],
    }),
  });

  if (resp.status === 429) throw new Error('Rate limit reached — wait a moment and try again.');
  if (!resp.ok)            throw new Error(`API error (${resp.status}) — check your Anthropic key and try again.`);

  const data = await resp.json();
  return data.content[0].text;
}

// ── Preview ────────────────────────────────────────────────────────────────
function showPreview(mode, text) {
  previewSection.hidden    = false;
  previewTextarea.hidden   = false;
  pdfNotice.hidden         = true;

  if (mode === 'distill') {
    previewBadge.textContent = 'Distilled by Claude';
    previewBadge.className   = 'badge badge-distill';
    previewTextarea.value    = text;
    previewTextarea.readOnly = false;
  } else if (mode === 'direct') {
    previewBadge.textContent = 'Direct — as submitted';
    previewBadge.className   = 'badge badge-direct';
    previewTextarea.value    = text;
    previewTextarea.readOnly = true;
  } else if (mode === 'pdf') {
    previewBadge.textContent = 'PDF — text extracted during ingestion';
    previewBadge.className   = 'badge badge-pdf';
    previewTextarea.hidden   = true;
    pdfNotice.hidden         = false;
  }

  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hidePreview() {
  previewSection.hidden = true;
  processedData = null;
}

// ── Download ───────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!processedData) return;

  const title = titleEl.value.trim();

  // For distilled content: use the (possibly user-edited) preview textarea value
  const finalText = processedData.isDistilled
    ? previewTextarea.value.trim()
    : processedData.text;

  const payload = {
    title,
    content:     processedData.isPdf ? null : finalText,
    pdf_b64:     processedData.isPdf ? processedData.b64 : null,
    doc_type:    docTypeEl.value          || null,
    category:    categoryEl.value.trim()  || null,
    subcategory: subcategoryEl.value.trim() || null,
    industry:    industryEl.value.trim()  || null,
    source:      sourceEl.value.trim()    || null,
    is_distilled: processedData.isDistilled,
  };

  const slug     = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const date     = new Date().toISOString().split('T')[0];
  const filename = `outfox-ingest-${slug}-${date}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  setStatus(`Downloaded: ${filename}`, 'success');
});

// ── Helpers ────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  processStatus.textContent = msg;
  processStatus.className   = type ? `status-msg ${type}` : 'status-msg';
}
