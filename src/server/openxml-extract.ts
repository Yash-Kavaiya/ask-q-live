/**
 * Extract readable text from DOCX / PPTX (Open XML zip packages) without Gemini.
 */
import JSZip from 'jszip';

function stripXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^/]*\/>/gi, '\t')
    .replace(/<w:br\b[^/]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/a:p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function readZipXmlEntries(
  zip: JSZip,
  pathPredicate: (path: string) => boolean
): Promise<string[]> {
  const names = Object.keys(zip.files)
    .filter((n) => pathPredicate(n) && !zip.files[n].dir)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const chunks: string[] = [];
  for (const name of names) {
    const xml = await zip.files[name].async('string');
    const text = stripXmlToText(xml);
    if (text) chunks.push(text);
  }
  return chunks;
}

export async function extractOpenXmlText(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; charCount: number }> {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(
      `Could not read ${ext.toUpperCase()} package. Re-export the file and try again.`
    );
  }

  let parts: string[] = [];
  if (ext === 'docx') {
    parts = await readZipXmlEntries(
      zip,
      (p) => p === 'word/document.xml' || /^word\/document\d*\.xml$/i.test(p)
    );
  } else if (ext === 'pptx') {
    const slides = await readZipXmlEntries(zip, (p) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(p)
    );
    parts = slides.map((t, i) => `Slide ${i + 1}:\n${t}`);
    // Notes if present
    const notes = await readZipXmlEntries(zip, (p) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(p)
    );
    if (notes.length) {
      parts.push('Speaker notes:\n' + notes.join('\n\n'));
    }
  } else {
    throw new Error(`Open XML extraction does not support .${ext}`);
  }

  const text = parts.join('\n\n').trim();
  if (!text || text.length < 2) {
    throw new Error(
      `No readable text found in this ${ext.toUpperCase()}. Try PDF export or paste notes manually.`
    );
  }
  return { text, charCount: text.length };
}
