/** Shared grounding document extraction (plain text locally, server for binaries/images/Office). */

import {
  assertSupportedGroundingUpload,
  GROUNDING_FILE_ACCEPT,
  resolveGroundingMimeType,
} from './grounding-formats';

export { GROUNDING_FILE_ACCEPT, resolveGroundingMimeType as resolveClientMimeType };

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
  method: 'plain' | 'gemini-ocr' | 'openxml';
  charCount: number;
}> {
  if (!file) {
    throw new Error('No file selected');
  }

  const mimeType = resolveGroundingMimeType(file.name, file.type);
  assertSupportedGroundingUpload(file.name, file.size, mimeType);

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isPlain =
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'html', 'htm', 'xml', 'log'].includes(ext);

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

  // PDF, images, DOCX, PPTX → server (Open XML extract or Gemini OCR)
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
    method?: 'plain' | 'gemini-ocr' | 'openxml';
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

export function describeExtractionMethod(method: 'plain' | 'gemini-ocr' | 'openxml'): string {
  if (method === 'openxml') return 'Office text extract';
  if (method === 'gemini-ocr') return 'Gemini OCR';
  return 'text import';
}
