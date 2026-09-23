/**
 * E2E: grounding PDF → Firebase Storage → Firestore metadata + OCR extract.
 * Uses gcloud user credentials (yash.kavaiya3) via GOOGLE_CLOUD / ADC.
 *
 * Usage: node scripts/test-grounding-storage.mjs
 */
import { GoogleAuth } from 'google-auth-library';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROJECT = 'gen-ai-guru-gdg-pune';
const BUCKET = 'gen-ai-guru-gdg-pune.firebasestorage.app';
const API_BASE = process.env.ASKQLIVE_API_BASE || 'https://askqlive.com';
const SESSION_CODE = `STORTEST${Date.now().toString(36).toUpperCase().slice(-4)}`;

const auth = new GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/firebase',
    'https://www.googleapis.com/auth/datastore',
    'https://www.googleapis.com/auth/devstorage.read_write',
  ],
  projectId: PROJECT,
});

async function token() {
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  const value = typeof t === 'string' ? t : t?.token;
  if (!value) throw new Error('No access token');
  return value;
}

function minimalPdf(text) {
  // Tiny valid PDF with embedded text
  const stream = `BT /F1 12 Tf 50 700 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n'
  );
  objects.push(
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`
  );
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += obj;
  }
  const xrefPos = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

async function deployStorageRules(accessToken) {
  const rulesPath = join(ROOT, 'storage.rules');
  if (!existsSync(rulesPath)) {
    console.warn('storage.rules missing — skip rules deploy');
    return null;
  }
  const content = readFileSync(rulesPath, 'utf8');
  const createRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': PROJECT,
      },
      body: JSON.stringify({
        source: { files: [{ name: 'storage.rules', content }] },
      }),
    }
  );
  const createBody = await createRes.json();
  if (!createRes.ok) {
    console.warn('Ruleset create failed:', createRes.status, JSON.stringify(createBody).slice(0, 300));
    return null;
  }
  const rulesetName = createBody.name;
  console.log('Created ruleset:', rulesetName);

  const releaseName = `projects/${PROJECT}/releases/cloud.storage.${BUCKET}`;
  const releaseRes = await fetch(
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': PROJECT,
      },
      body: JSON.stringify({
        name: releaseName,
        rulesetName,
      }),
    }
  );
  // If release doesn't exist, create it
  if (releaseRes.status === 404) {
    const postRes = await fetch(
      `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-goog-user-project': PROJECT,
        },
        body: JSON.stringify({
          name: releaseName,
          rulesetName,
        }),
      }
    );
    const postBody = await postRes.json();
    console.log('Release create:', postRes.status, JSON.stringify(postBody).slice(0, 200));
    return rulesetName;
  }
  const releaseBody = await releaseRes.json();
  console.log('Release update:', releaseRes.status, JSON.stringify(releaseBody).slice(0, 200));
  return rulesetName;
}

async function uploadPdf(accessToken, pdfBuf, storagePath) {
  const url =
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o` +
    `?uploadType=media&name=${encodeURIComponent(storagePath)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/pdf',
      'x-goog-user-project': PROJECT,
    },
    body: pdfBuf,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Upload failed ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function verifyObject(accessToken, storagePath) {
  const url =
    `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(storagePath)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-user-project': PROJECT,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Verify failed ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function extractViaApi(pdfBuf, fileName) {
  const res = await fetch(`${API_BASE}/api/extract-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: fileName,
      mimeType: 'application/pdf',
      data: pdfBuf.toString('base64'),
    }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function writeFirestoreMeta(accessToken, meta, contextSnippet) {
  // Firestore REST commit
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents` +
    `:commit`;
  const docName =
    `projects/${PROJECT}/databases/(default)/documents/sessions/${SESSION_CODE}`;
  const fields = {
    joinCode: { stringValue: SESSION_CODE },
    title: { stringValue: 'Storage Grounding E2E Test' },
    contextData: { stringValue: contextSnippet || '' },
    isActive: { booleanValue: true },
    createdAt: { stringValue: new Date().toISOString() },
    updatedAt: { stringValue: new Date().toISOString() },
    groundingFiles: {
      arrayValue: {
        values: [
          {
            mapValue: {
              fields: {
                id: { stringValue: meta.id },
                fileName: { stringValue: meta.fileName },
                contentType: { stringValue: meta.contentType },
                sizeBytes: { integerValue: String(meta.sizeBytes) },
                storagePath: { stringValue: meta.storagePath },
                downloadUrl: { stringValue: meta.downloadUrl },
                uploadedAt: { stringValue: meta.uploadedAt },
                extractionMethod: { stringValue: meta.extractionMethod || 'gemini-ocr' },
                charCount: { integerValue: String(meta.charCount || 0) },
              },
            },
          },
        ],
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': PROJECT,
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: docName,
            fields,
          },
        },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Firestore write failed ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function readFirestore(accessToken) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/sessions/${SESSION_CODE}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-user-project': PROJECT,
    },
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log('=== AskQlive grounding Storage E2E ===');
  console.log('Session code:', SESSION_CODE);
  console.log('API base:', API_BASE);

  const accessToken = await token();
  console.log('Auth OK');

  await deployStorageRules(accessToken);

  const pdfText = 'AskQlive Grounding Storage Test: Gemini Flash RAG on Cloud Run.';
  const pdfBuf = minimalPdf(pdfText);
  const pdfPath = join(ROOT, 'tmp-grounding-test.pdf');
  writeFileSync(pdfPath, pdfBuf);
  console.log('Wrote test PDF:', pdfPath, `(${pdfBuf.length} bytes)`);

  const fileId = `gf_${Date.now().toString(36)}`;
  const storagePath = `grounding/${SESSION_CODE}/${fileId}_askqlive-grounding-test.pdf`;

  const uploaded = await uploadPdf(accessToken, pdfBuf, storagePath);
  console.log('Storage upload OK:', uploaded.name, 'size=', uploaded.size);

  const verified = await verifyObject(accessToken, storagePath);
  console.log('Storage verify OK:', verified.name, verified.contentType, verified.size);

  const extract = await extractViaApi(pdfBuf, 'askqlive-grounding-test.pdf');
  console.log('Extract API status:', extract.status);
  if (extract.body?.text) {
    console.log('Extract chars:', extract.body.charCount, 'method:', extract.body.method);
    console.log('Extract preview:', String(extract.body.text).slice(0, 160));
  } else {
    console.warn('Extract body:', JSON.stringify(extract.body).slice(0, 400));
  }

  const meta = {
    id: fileId,
    fileName: 'askqlive-grounding-test.pdf',
    contentType: 'application/pdf',
    sizeBytes: pdfBuf.length,
    storagePath,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`,
    uploadedAt: new Date().toISOString(),
    extractionMethod: extract.body?.method || 'gemini-ocr',
    charCount: extract.body?.charCount || 0,
  };

  const contextSnippet =
    `--- Document: ${meta.fileName} ---\n` + (extract.body?.text || pdfText);
  await writeFirestoreMeta(accessToken, meta, contextSnippet);
  console.log('Firestore session write OK');

  const fsRead = await readFirestore(accessToken);
  console.log('Firestore read status:', fsRead.status);
  const gf = fsRead.body?.fields?.groundingFiles;
  console.log(
    'groundingFiles present:',
    Boolean(gf?.arrayValue?.values?.length),
    'contextData chars:',
    (fsRead.body?.fields?.contextData?.stringValue || '').length
  );

  const summary = {
    ok: true,
    sessionCode: SESSION_CODE,
    storagePath,
    bucket: BUCKET,
    objectSize: Number(verified.size),
    extractStatus: extract.status,
    extractChars: extract.body?.charCount || 0,
    firestoreStatus: fsRead.status,
    downloadUrl: meta.downloadUrl,
  };
  console.log('\nRESULT', JSON.stringify(summary, null, 2));
  writeFileSync(join(ROOT, 'tmp-grounding-storage-e2e.json'), JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
