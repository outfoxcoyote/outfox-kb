/* ─────────────────────────────────────────────────────────────
   Outfox Knowledge Base — Intake Form Logic (Phase 2)
   Responsibilities:
     - Form validation (title required, content required)
     - File type and size validation
     - FileReader: .txt/.md → plain text, .pdf → base64
     - Mutual exclusion: textarea vs. file upload
     - Distill toggle state tracking
     - Phase 2: Claude API distillation call (Path A)
     - Phase 2: Direct-to-download (Path B)
     - Phase 2: Distilled preview + Download for Ingestion
   ───────────────────────────────────────────────────────────── */

'use strict';

// ── Distillation Prompt ───────────────────────────────────────
// Approved prompt — do not modify without explicit sign-off (see CLAUDE.md)

const DISTILLATION_PROMPT = `You are a knowledge management assistant for Outfox Consulting. \
Your task is to transform raw document input into a clean, well-structured document suitable \
for storage in a knowledge base.

Given the raw content, produce a restructured version that:
- Preserves all factual information, names, dates, decisions, and insights — do not omit or invent anything
- Organises the content with clear headings and logical sections
- Removes filler, repetition, and transcription artefacts (e.g. "um", "you know", crosstalk)
- Writes in clear, professional prose appropriate for a consulting knowledge base
- Does not add commentary, opinions, or information not present in the source

Return only the cleaned document. No preamble, no explanation, no metadata.`;

// ── Constants ─────────────────────────────────────────────────

const MAX_FILE_BYTES     = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf'];
const CLAUDE_MODEL       = 'claude-sonnet-4-6';
const CLAUDE_API_URL     = 'https://api.anthropic.com/v1/messages';

// ── State ─────────────────────────────────────────────────────

const state = {
  fileData:       null,   // { name, type, text|b64, isPdf }
  isDistill:      true,   // mirrors the radio button selection
  distilledText:  null,   // Claude's output after distillation
};

// ── DOM References ────────────────────────────────────────────

const form           = document.getElementById('intake-form');
const titleInput     = document.getElementById('title');
const contentArea    = document.getElementById('content-text');
const charCount      = document.getElementById('char-count');
const fileInput      = document.getElementById('file-upload');
const uploadZone     = document.getElementById('upload-zone');
const uploadPrompt   = document.getElementById('upload-prompt');
const fileStatus     = document.getElementById('file-status');
const fileStatusTxt  = document.getElementById('file-status-text');
const removeFileBtn  = document.getElementById('remove-file');
const modeRadios     = document.querySelectorAll('input[name="processing_mode"]');
const submitBtn      = document.getElementById('submit-btn');

// Preview section
const previewSection = document.getElementById('preview-section');
const previewBadge   = document.getElementById('preview-badge');
const previewHint    = document.getElementById('preview-hint');
const previewText    = document.getElementById('preview-text');
const backBtn        = document.getElementById('back-btn');
const downloadBtn    = document.getElementById('download-btn');

// ── Error Helpers ─────────────────────────────────────────────

function showError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) field.classList.add('has-error');
  if (error) error.textContent = message;
}

function clearError(fieldId, errorId) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) field.classList.remove('has-error');
  if (error) error.textContent = '';
}

function clearAllErrors() {
  clearError('field-title',   'error-title');
  clearError('field-content', 'error-content');
  clearError('field-upload',  'error-file');
}

// ── Char Count ────────────────────────────────────────────────

contentArea.addEventListener('input', () => {
  const len = contentArea.value.length;
  charCount.textContent = len > 0 ? `${len.toLocaleString()} characters` : '';

  // If user types in textarea, release any loaded file
  if (len > 0 && state.fileData) {
    clearFileState();
  }

  clearError('field-content', 'error-content');
});

// ── File Upload Handling ──────────────────────────────────────

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  // Extension check
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    showError('field-upload', 'error-file',
      `Unsupported file type "${ext}". Accepted: .txt, .md, .pdf`);
    fileInput.value = '';
    return;
  }

  // Size check
  if (file.size > MAX_FILE_BYTES) {
    showError('field-upload', 'error-file',
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
    fileInput.value = '';
    return;
  }

  clearError('field-upload', 'error-file');
  clearError('field-content', 'error-content');

  if (ext === '.pdf') {
    readFileAsBase64(file);
  } else {
    readFileAsText(file);
  }
});

function readFileAsText(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    state.fileData = { name: file.name, isPdf: false, text };
    setFileLoaded(file.name, `${text.length.toLocaleString()} characters`);
    disableTextarea();
  };
  reader.onerror = () => {
    showError('field-upload', 'error-file', 'Could not read file. Please try again.');
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * Read a .pdf file as base64. Text extraction is handled by the Python
 * script via pypdf — the browser cannot extract PDF text without a library.
 * PDFs must use "Direct" mode since there is no text to pass to Claude.
 */
function readFileAsBase64(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const bytes  = new Uint8Array(e.target.result);
    const binary = bytes.reduce((acc, b) => acc + String.fromCharCode(b), '');
    const b64    = btoa(binary);
    state.fileData = { name: file.name, isPdf: true, b64 };
    setFileLoaded(file.name, `PDF — ${(file.size / 1024).toFixed(0)} KB · Direct mode only`);
    disableTextarea();

    // PDFs cannot be distilled in the browser — switch to Direct automatically
    const directRadio = document.querySelector('input[value="direct"]');
    if (directRadio) {
      directRadio.checked = true;
      state.isDistill = false;
    }
  };
  reader.onerror = () => {
    showError('field-upload', 'error-file', 'Could not read PDF. Please try again.');
  };
  reader.readAsArrayBuffer(file);
}

function setFileLoaded(name, detail) {
  uploadPrompt.hidden = true;
  fileStatus.hidden   = false;
  fileStatusTxt.textContent = `${name} — ${detail}`;
}

function disableTextarea() {
  contentArea.disabled  = true;
  contentArea.value     = '';
  charCount.textContent = '';
}

function clearFileState() {
  state.fileData        = null;
  fileInput.value       = '';
  uploadPrompt.hidden   = false;
  fileStatus.hidden     = true;
  fileStatusTxt.textContent = '';
  contentArea.disabled  = false;
  clearError('field-upload', 'error-file');
}

removeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  e.preventDefault();
  clearFileState();
});

// ── Drag and Drop ─────────────────────────────────────────────

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change'));
});

// ── Processing Mode Tracking ──────────────────────────────────

modeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    state.isDistill = radio.value === 'distill';
  });
});

// ── Form Validation ───────────────────────────────────────────

function validate() {
  let valid = true;
  clearAllErrors();

  if (!titleInput.value.trim()) {
    showError('field-title', 'error-title', 'Document title is required.');
    valid = false;
  }

  const hasText = contentArea.value.trim().length > 0;
  const hasFile = state.fileData !== null;

  if (!hasText && !hasFile) {
    showError('field-content', 'error-content',
      'Please paste document text or upload a file.');
    valid = false;
  }

  return valid;
}

// ── Handoff JSON Builder ──────────────────────────────────────

/**
 * Build the payload object that the Python script will consume.
 * @param {string|null} distilledContent - Claude's output, or null for direct path
 */
function buildHandoffPayload(distilledContent = null) {
  const payload = {
    title:        titleInput.value.trim(),
    category:     document.getElementById('category').value         || null,
    subcategory:  document.getElementById('subcategory').value.trim() || null,
    industry:     document.getElementById('industry').value.trim()    || null,
    doc_type:     document.getElementById('doc_type').value          || null,
    source:       document.getElementById('source').value.trim()     || null,
    is_distilled: state.isDistill && distilledContent !== null,
  };

  if (state.fileData?.isPdf) {
    // PDF: Python extracts text via pypdf
    payload.content = null;
    payload.pdf_b64 = state.fileData.b64;
  } else if (distilledContent !== null) {
    // Distilled path: use Claude's output
    payload.content = distilledContent;
    payload.pdf_b64 = null;
  } else {
    // Direct path: raw text or loaded .txt/.md content
    payload.content = state.fileData?.text ?? contentArea.value.trim();
    payload.pdf_b64 = null;
  }

  return payload;
}

/**
 * Trigger a JSON file download in the browser.
 */
function downloadHandoff(payload) {
  const slug     = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `outfox-ingest-${slug}-${date}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Claude API — Distillation ─────────────────────────────────

/**
 * Call the Claude API with the raw document text.
 * Returns the distilled string, or throws on failure.
 */
async function callClaude(rawContent) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key':         CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
      // Required for browser-based requests to the Anthropic API
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 4096,
      system:     DISTILLATION_PROMPT,
      messages: [
        { role: 'user', content: rawContent }
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) {
      throw new Error('rate_limit');
    }
    throw new Error(`api_error:${response.status}:${body?.error?.message ?? 'Unknown error'}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── Submit Button Loading State ───────────────────────────────

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  if (isLoading) {
    submitBtn.classList.add('loading');
    submitBtn.textContent = 'Distilling';
  } else {
    submitBtn.classList.remove('loading');
    submitBtn.textContent = 'Process Document';
  }
}

// ── Preview Section ───────────────────────────────────────────

/**
 * Show the preview section with the given content.
 * @param {string} content   - Text to display
 * @param {boolean} isDistilled - True if this came from Claude
 */
function showPreview(content, isDistilled) {
  state.distilledText = isDistilled ? content : null;

  previewText.value    = content;
  previewBadge.textContent = isDistilled ? 'Distilled by Claude' : 'Direct — as submitted';
  previewHint.textContent  = isDistilled
    ? 'Review Claude\'s output. When satisfied, click Download to generate the ingestion file.'
    : 'Content will be chunked and embedded as-is. Click Download to generate the ingestion file.';

  form.hidden           = true;
  previewSection.hidden = false;
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Back button — restore the form
backBtn.addEventListener('click', () => {
  previewSection.hidden = true;
  form.hidden           = false;
  state.distilledText   = null;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Download button — build payload and trigger download
downloadBtn.addEventListener('click', () => {
  const payload = buildHandoffPayload(state.distilledText);
  downloadHandoff(payload);

  // Brief feedback on the button
  downloadBtn.textContent = 'Downloaded ✓';
  downloadBtn.disabled    = true;
  setTimeout(() => {
    downloadBtn.textContent = 'Download for Ingestion';
    downloadBtn.disabled    = false;
  }, 3000);
});

// ── Form Submit ───────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!validate()) {
    const firstError = form.querySelector('.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // ── Path B: Direct ───────────────────────────────────────────
  // PDFs always go direct (no browser-side text extraction).
  // Text/md files go direct when toggle is set to Direct.
  if (!state.isDistill || state.fileData?.isPdf) {
    const content = state.fileData?.text ?? contentArea.value.trim();
    showPreview(content, false);
    return;
  }

  // ── Path A: Distill First ────────────────────────────────────
  const rawContent = state.fileData?.text ?? contentArea.value.trim();

  setLoading(true);
  try {
    const distilled = await callClaude(rawContent);
    showPreview(distilled, true);
  } catch (err) {
    if (err.message === 'rate_limit') {
      showError('field-content', 'error-content',
        'Claude API rate limit reached. Please wait a moment and try again.');
    } else {
      const detail = err.message.startsWith('api_error:')
        ? err.message.split(':').slice(2).join(':')
        : err.message;
      showError('field-content', 'error-content',
        `Claude API error: ${detail}. Please try again.`);
    }
    const firstError = form.querySelector('.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    setLoading(false);
  }
});
