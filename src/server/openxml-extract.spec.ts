import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractOpenXmlText } from './openxml-extract';
import {
  assertSupportedGroundingUpload,
  classifyGroundingFile,
} from '../app/utils/grounding-formats';

async function buildMinimalDocx(bodyText: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p></w:body>
</w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildMinimalPptx(slideTexts: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  );
  slideTexts.forEach((text, i) => {
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
    );
  });
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('grounding multi-format extract', () => {
  it('classifies common formats', () => {
    expect(classifyGroundingFile('notes.txt')).toBe('plain');
    expect(classifyGroundingFile('deck.pdf')).toBe('pdf');
    expect(classifyGroundingFile('slides.pptx')).toBe('openxml');
    expect(classifyGroundingFile('brief.docx')).toBe('openxml');
    expect(classifyGroundingFile('shot.png')).toBe('image');
    expect(classifyGroundingFile('old.doc')).toBe('legacy-office');
  });

  it('rejects legacy office uploads', () => {
    expect(() => assertSupportedGroundingUpload('talk.ppt', 1000)).toThrow(/Legacy/);
  });

  it('extracts text from DOCX', async () => {
    const buf = await buildMinimalDocx('AskQlive DOCX grounding notes');
    const result = await extractOpenXmlText(buf, 'notes.docx');
    expect(result.text).toContain('AskQlive DOCX grounding notes');
    expect(result.charCount).toBeGreaterThan(10);
  });

  it('extracts text from PPTX slides', async () => {
    const buf = await buildMinimalPptx(['Keynote opener', 'Architecture deep dive']);
    const result = await extractOpenXmlText(buf, 'deck.pptx');
    expect(result.text).toContain('Slide 1:');
    expect(result.text).toContain('Keynote opener');
    expect(result.text).toContain('Architecture deep dive');
  });
});
