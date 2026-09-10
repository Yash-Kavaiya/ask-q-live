import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

/**
 * Resolve Firebase apiKey at runtime — never hardcoded in source.
 * Server (SSR/Node): reads process.env.FIREBASE_API_KEY (Cloud Run secret).
 * Browser: reads window.__FIREBASE_API_KEY__ injected by the SSR server.
 */
function resolveApiKey(): string {
  if (typeof process !== 'undefined' && process.env?.['FIREBASE_API_KEY']) {
    return process.env['FIREBASE_API_KEY'];
  }
  if (typeof window !== 'undefined') {
    const w = window as Window & { __FIREBASE_API_KEY__?: string };
    if (w.__FIREBASE_API_KEY__) return w.__FIREBASE_API_KEY__;
  }
  return '';
}

const BASE_CONFIG = {
  authDomain: 'genaiguru.firebaseapp.com',
  projectId: 'genaiguruyoutube',
  storageBucket: 'genaiguruyoutube.firebasestorage.app',
  messagingSenderId: '759503671462',
  appId: '1:759503671462:web:b4c46f7c481d1df2f62467',
  firestoreDatabaseId: '(default)',
};

export const firebaseConfig = { ...BASE_CONFIG, apiKey: resolveApiKey() };

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!app) {
    const cfg = { ...BASE_CONFIG, apiKey: resolveApiKey() };
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
