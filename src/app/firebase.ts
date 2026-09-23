import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';

/**
 * Resolve Firebase apiKey at runtime — never hardcoded in source.
 * Priority:
 * 1. window.__FIREBASE_API_KEY__ (SSR inject on Cloud Run, or public/firebase-runtime-config.js on ng serve)
 * 2. process.env.FIREBASE_API_KEY (Node / SSR)
 */
export function resolveFirebaseApiKey(): string {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __FIREBASE_API_KEY__?: string };
    if (w.__FIREBASE_API_KEY__?.trim()) return w.__FIREBASE_API_KEY__.trim();
  }
  if (typeof process !== 'undefined' && process.env?.['FIREBASE_API_KEY']?.trim()) {
    return process.env['FIREBASE_API_KEY'].trim();
  }
  return '';
}

const BASE_CONFIG = {
  authDomain: 'gen-ai-guru-gdg-pune.firebaseapp.com',
  projectId: 'gen-ai-guru-gdg-pune',
  storageBucket: 'gen-ai-guru-gdg-pune.firebasestorage.app',
  messagingSenderId: '443180956629',
  appId: '1:443180956629:web:1428dd86f1d33580971b5c',
  firestoreDatabaseId: '(default)',
};

export const firebaseConfig = { ...BASE_CONFIG, apiKey: resolveFirebaseApiKey() };

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!app) {
    const cfg = { ...BASE_CONFIG, apiKey: resolveFirebaseApiKey() };
    app = getApps().length > 0 ? getApps()[0] : initializeApp(cfg);
  }
  return app;
}

export function getDb(): Firestore | null {
  if (typeof window === 'undefined') return null;
  if (!db) {
    const fApp = getFirebaseApp();
    if (fApp) {
      db = getFirestore(fApp, BASE_CONFIG.firestoreDatabaseId);
    }
  }
  return db;
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === 'undefined') return null;
  if (!auth) {
    const fApp = getFirebaseApp();
    if (fApp) {
      auth = getAuth(fApp);
    }
  }
  return auth;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  if (typeof window === 'undefined') return null;
  if (!storage) {
    const fApp = getFirebaseApp();
    if (fApp) {
      storage = getStorage(fApp, `gs://${BASE_CONFIG.storageBucket}`);
    }
  }
  return storage;
}
