/**
 * Shared grounding upload format helpers (extensions, MIME, accept attribute).
 * Keep client + server lists in sync via this module where possible.
 */

export const MAX_GROUNDING_FILE_BYTES = 25 * 1024 * 1024;

/** Plain-text formats decoded locally (no Gemini). */
export const PLAIN_TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'html',
  'htm',
  'xml',
  'log',
]);

/** Open XML formats — text extracted from the zip package. */
export const OPEN_XML_EXTENSIONS = new Set(['docx', 'pptx']);

/** Raster images sent to Gemini vision. */
export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'heic',
  'heif',
  'gif',
  'bmp',
]);

/** Document vision (PDF) via Gemini. */
export const PDF_EXTENSIONS = new Set(['pdf']);

/** Legacy binary Office — not reliably supported; ask for modern format. */
export const LEGACY_OFFICE_EXTENSIONS = new Set(['doc', 'ppt']);

export const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  log: 'text/plain',
};

/** MIME types Gemini vision / document APIs accept reliably. */
export const GEMINI_SAFE_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const GROUNDING_FILE_ACCEPT =
  '.pdf,.pptx,.docx,.txt,.md,.markdown,.json,.csv,.tsv,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.bmp,.html,.htm,.xml,.ppt,.doc';

export type GroundingExtractKind =
  | 'plain'
  | 'openxml'
  | 'pdf'
  | 'image'
  | 'legacy-office'
  | 'unsupported';

export function extensionOf(filename: string): string {
  const parts = (filename || '').split('.');
  return parts.length > 1 ? (parts.pop() || '').toLowerCase() : '';
}

export function resolveGroundingMimeType(
  filename: string,
  providedMime?: string | null
): string {
  const fromName = MIME_BY_EXT[extensionOf(filename)];
  if (fromName) return fromName;
  if (providedMime && providedMime !== 'application/octet-stream') return providedMime;
  return 'application/octet-stream';
}

export function classifyGroundingFile(
  filename: string,
  mimeType?: string | null
): GroundingExtractKind {
  const ext = extensionOf(filename);
  const mime = resolveGroundingMimeType(filename, mimeType);

  if (
    PLAIN_TEXT_EXTENSIONS.has(ext) ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml'
  ) {
    return 'plain';
  }
  if (OPEN_XML_EXTENSIONS.has(ext) || mime.includes('openxmlformats')) {
    return 'openxml';
  }
  if (PDF_EXTENSIONS.has(ext) || mime === 'application/pdf') {
    return 'pdf';
  }
  if (IMAGE_EXTENSIONS.has(ext) || mime.startsWith('image/')) {
    return 'image';
  }
  if (LEGACY_OFFICE_EXTENSIONS.has(ext) || mime === 'application/msword' || mime === 'application/vnd.ms-powerpoint') {
    return 'legacy-office';
  }
  return 'unsupported';
}

export function assertSupportedGroundingUpload(
  filename: string,
  sizeBytes: number,
  mimeType?: string | null
): void {
  if (!filename?.trim()) {
    throw new Error('No file selected');
  }
  if (sizeBytes > MAX_GROUNDING_FILE_BYTES) {
    throw new Error(
      `File is too large (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB). Max allowed size is 25MB.`
    );
  }
  const kind = classifyGroundingFile(filename, mimeType);
  if (kind === 'unsupported') {
    throw new Error(
      `Unsupported file type for grounding. Use PDF, PPTX, DOCX, TXT, MD, JSON, CSV, or image (PNG/JPG/WEBP).`
    );
  }
  if (kind === 'legacy-office') {
    throw new Error(
      `Legacy .doc/.ppt files are not supported. Re-save as .docx or .pptx and upload again.`
    );
  }
}

/** Prefer Gemini-safe image MIME; map jpeg aliases; leave gif/bmp as-is for best-effort. */
export function normalizeGeminiInlineMime(mimeType: string, kind: GroundingExtractKind): string {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'image') {
    if (mimeType === 'image/jpg') return 'image/jpeg';
    if (GEMINI_SAFE_IMAGE_MIMES.has(mimeType)) return mimeType;
    // Best-effort for gif/bmp — API may reject; caller surfaces a clear error.
    return mimeType.startsWith('image/') ? mimeType : 'image/png';
  }
  return mimeType;
}
