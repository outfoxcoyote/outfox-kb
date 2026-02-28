/* ─────────────────────────────────────────────────────────────
   Outfox Knowledge Base — Intake Form Logic (Phase 1)
   Responsibilities:
     - Form validation (title required, content required)
     - File type and size validation
     - FileReader: .txt/.md → plain text, .pdf → base64
     - Mutual exclusion: textarea vs. file upload
     - Distill toggle state tracking
     - JSON handoff download (wired up but Claude call is Phase 2)
   ───────────────────────────────────────────────────────────── */

'use strict';

// ── Constants ─────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf'];

// ── State ─────────────────────────────────────────────────────

const state = {
  fileData: null,      // { name, type, text|b64, isPdf }
  isDistill: true,     // mirrors the radio button selection
};

// ── DOM References ────────────────────────────────────────────

const form          = document.getElementById('intake-form');
const titleInput    = document.getElementById('title');
const contentArea   = document.getElementById('content-text');
const charCount     = document.getElementById('char-count');
const fileInput     = document.getElementById('file-upload');
const uploadZone    = document.getElementById('upload-zone');
const uploadPrompt  = document.getElementById('upload-prompt');
const fileStatus    = document.getElementById('file-status');
const fileStatusTxt = document.getElementById('file-status-text');
const removeFileBtn = document.getElementById('remove-file');
const modeRadios    = document.querySelectorAll('input[name="processing_mode"]');
const submitBtn     = document.getElementById('submit-btn');

// ── Error Helpers ─────────────────────────────────────────────

/**
 * Show an inline error message beneath a field.
 * @param {string} fieldId  - The wrapping .field element id
 * @param {string} errorId  - The .field-error span id
 * @param {string} message  - Error text to display
 */
function showError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) field.classList.add('has-error');
  if (error) error.textContent = message;
}

/**
 * Clear an inline error message.
 */
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

  // If user is typing in textarea, release any loaded file
  if (len > 0 && state.fileData) {
    clearFileState();
  }

  clearError('field-content', 'error-content');
});

// ── File Upload Handling ──────────────────────────────────────

/**
 * Validate extension and size, then read the file.
 * .txt and .md are read as plain text.
 * .pdf is read as ArrayBuffer and converted to base64 (Python extracts text).
 */
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

/**
 * Read a .txt or .md file as plain text.
 */
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
 * Read a .pdf file as ArrayBuffer and convert to base64.
 * Text extraction is handled later by the Python script via pypdf.
 */
function readFileAsBase64(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    // Convert ArrayBuffer → base64 string
    const bytes  = new Uint8Array(e.target.result);
    const binary = bytes.reduce((acc, b) => acc + String.fromCharCode(b), '');
    const b64    = btoa(binary);
    state.fileData = { name: file.name, isPdf: true, b64 };
    setFileLoaded(file.name, `PDF — ${(file.size / 1024).toFixed(0)} KB`);
    disableTextarea();
  };
  reader.onerror = () => {
    showError('field-upload', 'error-file', 'Could not read PDF. Please try again.');
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Show the file loaded state in the upload zone.
 */
function setFileLoaded(name, detail) {
  uploadPrompt.hidden = true;
  fileStatus.hidden   = false;
  fileStatusTxt.textContent = `${name} — ${detail}`;
}

/**
 * Disable textarea and update its visual state.
 */
function disableTextarea() {
  contentArea.disabled    = true;
  contentArea.value       = '';
  charCount.textContent   = '';
}

/**
 * Reset all file state and re-enable textarea.
 */
function clearFileState() {
  state.fileData          = null;
  fileInput.value         = '';
  uploadPrompt.hidden     = false;
  fileStatus.hidden       = true;
  fileStatusTxt.textContent = '';
  contentArea.disabled    = false;
  clearError('field-upload', 'error-file');
}

// Remove file button
removeFileBtn.addEventListener('click', (e) => {
  // Stop the click bubbling up to the invisible file input overlay
  e.stopPropagation();
  e.preventDefault();
  clearFileState();
});

// ── Drag and Drop on Upload Zone ──────────────────────────────

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
  // Simulate a file input change by assigning to the input (not possible directly)
  // Instead, create a synthetic DataTransfer and assign
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

/**
 * Validate all required fields.
 * Returns true if valid, false if any errors are set.
 */
function validate() {
  let valid = true;
  clearAllErrors();

  // Title is required
  if (!titleInput.value.trim()) {
    showError('field-title', 'error-title', 'Document title is required.');
    valid = false;
  }

  // Content: either textarea or a loaded file must be present
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
 * Assemble the handoff payload that will be passed to the Python
 * ingestion script. In Phase 1 this is built but not yet used —
 * the download is triggered in Phase 2 after optional distillation.
 */
function buildHandoffPayload(distilledContent = null) {
  const payload = {
    title:       titleInput.value.trim(),
    category:    document.getElementById('category').value   || null,
    subcategory: document.getElementById('subcategory').value.trim() || null,
    industry:    document.getElementById('industry').value.trim()    || null,
    doc_type:    document.getElementById('doc_type').value   || null,
    source:      document.getElementById('source').value.trim()      || null,
    is_distilled: state.isDistill && distilledContent !== null,
  };

  if (state.fileData?.isPdf) {
    // PDF: include raw base64 — Python script extracts text via pypdf
    payload.content = null;
    payload.pdf_b64 = state.fileData.b64;
  } else if (distilledContent !== null) {
    // Distilled path: use Claude's output
    payload.content = distilledContent;
    payload.pdf_b64 = null;
  } else {
    // Direct path (text or loaded txt/md file)
    payload.content = state.fileData?.text ?? contentArea.value.trim();
    payload.pdf_b64 = null;
  }

  return payload;
}

/**
 * Trigger a JSON file download in the browser.
 * @param {object} payload  - The handoff object
 * @param {string} title    - Used to generate the filename
 */
function downloadHandoff(payload, title) {
  const slug      = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename  = `outfox-ingest-${slug}-${timestamp}.json`;

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

// ── Form Submit ───────────────────────────────────────────────

form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!validate()) {
    // Scroll first error into view
    const firstError = form.querySelector('.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  /*
   * Phase 1 ends here — validation and file reading are complete.
   *
   * Phase 2 will extend this handler:
   *   - If state.isDistill: call Claude API with raw content,
   *     display distilled preview, then trigger download.
   *   - If !state.isDistill: call downloadHandoff() directly.
   *
   * For now, log the assembled payload to the console so the
   * Phase 1 gate can be verified.
   */
  const payload = buildHandoffPayload();
  console.log('[Outfox KB] Handoff payload ready:', payload);
  console.log('[Outfox KB] Processing mode:', state.isDistill ? 'Distill First' : 'Direct');

  // Temporary Phase 1 feedback — will be replaced by Phase 2 UI
  submitBtn.textContent = 'Ready — Phase 2 will trigger download';
  submitBtn.disabled = true;
  setTimeout(() => {
    submitBtn.textContent = 'Process Document';
    submitBtn.disabled = false;
  }, 3000);
});
