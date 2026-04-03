import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const CANONICAL_AUTH_DOMAIN = 'kuci-cafe-bakery.web.app';
const LEGACY_AUTH_DOMAIN = 'kuci-cafe-bakery.firebaseapp.com';

function resolveAuthDomain(): string {
  const configured = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  if (configured && configured !== LEGACY_AUTH_DOMAIN) {
    return configured;
  }
  return CANONICAL_AUTH_DOMAIN;
}

const resolvedAuthDomain = resolveAuthDomain();

// Single source of truth: VITE_FIREBASE_* environment variables (see .env.local)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolvedAuthDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

if (import.meta.env.DEV) {
  console.debug('[firebase] Resolved authDomain:', resolvedAuthDomain);
  console.debug('[firebase] window.origin:', typeof window !== 'undefined' ? window.location.origin : 'server');
  console.debug('[firebase] Expected OAuth handler URI:', `https://${resolvedAuthDomain}/__/auth/handler`);
  console.debug('[firebase] projectId:', app.options.projectId);
}

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn('Could not set auth persistence to local:', error);
});
export const db = getFirestore(app);
export const functions = getFunctions(app);

export default app;
