/** Shared grounding document extraction (plain text locally, Gemini OCR for binaries/images). */

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const PLAIN_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'html', 'htm', 'xml', 'log']);

const MIME_BY_EXT: Record<string, string> = {
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
};

export const GROUNDING_FILE_ACCEPT =
  '.pdf,.pptx,.ppt,.txt,.md,.markdown,.docx,.doc,.json,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp';

function extensionOf(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts.pop() || '').toLowerCase() : '';
}

export function resolveClientMimeType(file: File): string {
  const fromName = MIME_BY_EXT[extensionOf(file.name)];
  if (fromName) return fromName;
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return 'application/octet-stream';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file as data URL'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Error reading file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function extractGroundingTextFromFile(file: File): Promise<{
  text: string;
  method: 'plain' | 'gemini-ocr';
  charCount: number;
}> {
  if (!file) {
    throw new Error('No file selected');
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max allowed size is 25MB.`);
  }

  const ext = extensionOf(file.name);
  const mimeType = resolveClientMimeType(file);
  const isPlain =
    PLAIN_EXTENSIONS.has(ext) ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json';

  if (isPlain) {
    let text = await file.text();
    if (ext === 'json' || mimeType === 'application/json') {
      try {
        const parsed = JSON.parse(text);
        text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
      } catch {
        // keep raw
      }
    }
    const cleaned = text.replace(/\u0000/g, '').trim();
    if (!cleaned) {
      throw new Error('No readable text found in the uploaded file');
    }
    return { text: cleaned, method: 'plain', charCount: cleaned.length };
  }

  const base64 = await fileToBase64(file);
  const res = await fetch('/api/extract-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType,
      data: base64,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    text?: string;
    method?: 'plain' | 'gemini-ocr';
    charCount?: number;
    error?: string;
  };

  if (!res.ok || !body.text) {
    throw new Error(body.error || `Document extraction failed (${res.status})`);
  }

  return {
    text: body.text.trim(),
    method: body.method || 'gemini-ocr',
    charCount: body.charCount ?? body.text.length,
  };
}
