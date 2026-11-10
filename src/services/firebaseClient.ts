import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() || '',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() || '',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() || '',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() || '',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() || '',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() || '',
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined)?.trim() || '',
};

export function getMissingFirebaseClientKeys(): string[] {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('YOUR_')) {
    missing.push('VITE_FIREBASE_API_KEY');
  }
  if (!firebaseConfig.authDomain) {
    missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  }
  if (!firebaseConfig.projectId) {
    missing.push('VITE_FIREBASE_PROJECT_ID');
  }
  if (!firebaseConfig.appId) {
    missing.push('VITE_FIREBASE_APP_ID');
  }
  return missing;
}

export function isFirebaseClientConfigured(): boolean {
  return getMissingFirebaseClientKeys().length === 0;
}

function getOrInitFirebaseApp(): FirebaseApp {
  if (!isFirebaseClientConfigured()) {
    throw new Error(
      'Firebase Google Sign-In requires VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID in .env.'
    );
  }
  const existing = getApps();
  return existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
}

function buildGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

function normalizeFirebaseAuthError(err: unknown): Error {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  const message = err instanceof Error ? err.message : String(err);

  if (code === 'auth/configuration-not-found' || message.includes('auth/configuration-not-found')) {
    const enhanced = new Error(
      'Google Sign-In is not enabled yet in your Firebase project (devmindai-2bfd5). Please enable Google in Firebase Console > Authentication > Sign-in method.'
    );
    Object.assign(enhanced, { code: 'auth/configuration-not-found' });
    return enhanced;
  }
  if (code === 'auth/popup-blocked' || message.includes('auth/popup-blocked')) {
    const enhanced = new Error('Your browser blocked the Google Sign-In popup. Allow popups or use Full-Page Redirect below.');
    Object.assign(enhanced, { code: 'auth/popup-blocked' });
    return enhanced;
  }
  if (err instanceof Error) return err;
  return new Error(message || 'Google Sign-In failed');
}

/**
 * Initiates official Firebase Google OAuth 2.0 / OIDC sign-in flow and returns
 * the cryptographically signed Firebase ID token for server-side verification.
 */
export async function signInWithGooglePopup(): Promise<string> {
  const app = getOrInitFirebaseApp();
  const auth = getAuth(app);
  const provider = buildGoogleProvider();

  const isHeadlessOrTest =
    typeof navigator !== 'undefined' &&
    (Boolean(navigator.webdriver) || navigator.userAgent.includes('Headless'));

  // Give interactive users 5 minutes to complete Google login / 2FA without premature cutoff,
  // while keeping automated headless tests bounded if COOP blocks popup close detection.
  const timeoutMs = isHeadlessOrTest ? 2000 : 300_000;
  let timerId: ReturnType<typeof setTimeout> | undefined;

  try {
    const popupPromise = signInWithPopup(auth, provider);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        const timeoutErr = new Error('Google Sign-In popup timed out or was closed. Please try again or use Redirect Sign-In.');
        Object.assign(timeoutErr, { code: 'auth/popup-timeout' });
        reject(timeoutErr);
      }, timeoutMs);
    });

    const credential = await Promise.race([popupPromise, timeoutPromise]);
    return await credential.user.getIdToken(true);
  } catch (err: unknown) {
    throw normalizeFirebaseAuthError(err);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

/**
 * Fallback full-page Google OAuth redirect for browsers or webviews that block popups or COOP windows.
 */
export async function signInWithGoogleRedirect(): Promise<void> {
  const app = getOrInitFirebaseApp();
  const auth = getAuth(app);
  const provider = buildGoogleProvider();
  try {
    await signInWithRedirect(auth, provider);
  } catch (err: unknown) {
    throw normalizeFirebaseAuthError(err);
  }
}

/**
 * Consumes a completed Google OAuth redirect login (if present) on app mount.
 */
export async function consumeGoogleRedirectResult(): Promise<string | null> {
  if (!isFirebaseClientConfigured()) return null;
  try {
    const app = getOrInitFirebaseApp();
    const auth = getAuth(app);
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;
    return await result.user.getIdToken(true);
  } catch (err: unknown) {
    throw normalizeFirebaseAuthError(err);
  }
}

export async function firebaseSignOutSafe(): Promise<void> {
  if (!isFirebaseClientConfigured()) return;
  const existing = getApps();
  if (existing.length === 0) return;
  try {
    await signOut(getAuth(existing[0]));
  } catch {
    // Ignore client sign-out race
  }
}
