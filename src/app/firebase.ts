import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

export const firebaseConfig = {
  projectId: 'ai-studio-liveqaplatform-d7273fea-9de9-49df-ad9d-7e1effee902a',
  appId: '1:583451844279:web:ai-studio-liveqaplatform',
  firestoreDatabaseId: 'ai-studio-liveqaplatform-d7273fea-9de9-49df-ad9d-7e1effee902a',
  authDomain: 'ai-studio-liveqaplatform-d7273fea-9de9-49df-ad9d-7e1effee902a.firebaseapp.com',
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getDb(): Firestore | null {
  if (typeof window === 'undefined') return null;
  if (!db) {
    const fApp = getFirebaseApp();
    if (fApp) {
      db = getFirestore(fApp, firebaseConfig.firestoreDatabaseId);
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
