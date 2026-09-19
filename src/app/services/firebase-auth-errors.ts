const INCORRECT_EMAIL_OR_PASSWORD = 'Incorrect email or password. Please try again.';
const GOOGLE_SIGNIN_CANCELLED =
  'Google sign-in was cancelled. Click Continue with Google again when ready.';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/invalid-credential': INCORRECT_EMAIL_OR_PASSWORD,
  'auth/wrong-password': INCORRECT_EMAIL_OR_PASSWORD,
  'auth/user-not-found': INCORRECT_EMAIL_OR_PASSWORD,
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/popup-closed-by-user': GOOGLE_SIGNIN_CANCELLED,
  'auth/cancelled-popup-request': GOOGLE_SIGNIN_CANCELLED,
  'auth/popup-blocked': 'Pop-up blocked. Allow pop-ups for this site and try Google sign-in again.',
  'auth/unauthorized-domain':
    'This domain is not authorized for Firebase Auth. Add it under Authentication → Settings → Authorized domains.',
  'auth/operation-not-allowed':
    'Google sign-in is disabled in Firebase Console. Enable Authentication → Sign-in method → Google.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method. Try email/password instead.',
};

function authErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = String((err as { code?: unknown }).code);
    if (AUTH_ERROR_MESSAGES[code]) return code;
  }
  // Firebase sometimes only embeds the stable code in `.message`.
  if (err instanceof Error) {
    const match = err.message.match(/auth\/[a-z-]+/);
    if (match && AUTH_ERROR_MESSAGES[match[0]]) return match[0];
  }
  return '';
}

/**
 * Turns a Firebase Auth error into user-facing copy, keyed off the stable
 * `.code` (e.g. "auth/wrong-password") rather than matching on `.message`
 * text, which Firebase does not guarantee. Local-auth-fallback errors have
 * no `.code` and already carry a friendly message, so they pass through.
 */
export function formatFirebaseAuthError(err: unknown, fallback: string): string {
  const code = authErrorCode(err);
  if (code) return AUTH_ERROR_MESSAGES[code];
  return err instanceof Error && err.message ? err.message : fallback;
}
