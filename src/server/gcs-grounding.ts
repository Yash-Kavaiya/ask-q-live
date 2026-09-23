/**
 * Upload grounding documents to Firebase / GCS Storage from the server.
 * Uses Application Default Credentials (Cloud Run SA locally via gcloud ADC).
 */
import { GoogleAuth } from 'google-auth-library';
import {
  assertSupportedGroundingUpload,
  resolveGroundingMimeType,
} from '../app/utils/grounding-formats.js';

const STORAGE_BUCKET =
  process.env['FIREBASE_STORAGE_BUCKET'] ||
  process.env['STORAGE_BUCKET'] ||
  'gen-ai-guru-gdg-pune.firebasestorage.app';

const PROJECT_ID = process.env['GOOGLE_CLOUD_PROJECT'] || 'gen-ai-guru-gdg-pune';

let authClient: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
      projectId: PROJECT_ID,
    });
  }
  return authClient;
}

async function getAccessToken(): Promise<string> {
  const client = await getAuth().getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error('Could not obtain Google access token for Storage upload');
  }
  return token;
}

function safeFileName(name: string): string {
  return (name || 'document.bin').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export interface GroundingStorageUploadResult {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  downloadUrl: string;
  uploadedAt: string;
  bucket: string;
}

export async function uploadGroundingBytes(params: {
  sessionCode: string;
  fileName: string;
  mimeType?: string;
  base64: string;
}): Promise<GroundingStorageUploadResult> {
  const code = (params.sessionCode || 'PENDING').toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'PENDING';
  const id = `gf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `grounding/${code}/${id}_${safeFileName(params.fileName)}`;
  const contentType = resolveGroundingMimeType(params.fileName, params.mimeType);
  const buffer = Buffer.from(params.base64, 'base64');

  if (!buffer.length) {
    throw new Error('Empty file payload');
  }
  assertSupportedGroundingUpload(params.fileName, buffer.length, contentType);

  const token = await getAccessToken();
  const encodedName = encodeURIComponent(storagePath);
  const uploadUrl =
    `https://storage.googleapis.com/upload/storage/v1/b/${STORAGE_BUCKET}/o` +
    `?uploadType=media&name=${encodedName}`;

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'x-goog-user-project': PROJECT_ID,
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`Storage upload failed (${uploadRes.status}): ${errText.slice(0, 240)}`);
  }

  // Make object readable via a Firebase-style download URL (token optional).
  // Public media link works for authenticated GCS; for browser use we also set
  // a temporary signed-style alt=media URL that Cloud Storage serves.
  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/` +
    `${encodeURIComponent(storagePath)}?alt=media`;

  return {
    id,
    fileName: params.fileName,
    contentType,
    sizeBytes: buffer.length,
    storagePath,
    downloadUrl,
    uploadedAt: new Date().toISOString(),
    bucket: STORAGE_BUCKET,
  };
}
