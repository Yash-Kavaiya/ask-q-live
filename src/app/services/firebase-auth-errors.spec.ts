import { describe, it, expect } from 'vitest';
import { formatFirebaseAuthError } from './firebase-auth-errors';

describe('formatFirebaseAuthError', () => {
  it('maps a Firebase `.code` to user-facing copy', () => {
    expect(formatFirebaseAuthError({ code: 'auth/wrong-password' }, 'fallback')).toBe(
      'Incorrect email or password. Please try again.'
    );
  });

  it('treats invalid-credential, wrong-password, and user-not-found as the same copy', () => {
    const fallback = 'fallback';
    const expected = 'Incorrect email or password. Please try again.';
    expect(formatFirebaseAuthError({ code: 'auth/invalid-credential' }, fallback)).toBe(expected);
    expect(formatFirebaseAuthError({ code: 'auth/wrong-password' }, fallback)).toBe(expected);
    expect(formatFirebaseAuthError({ code: 'auth/user-not-found' }, fallback)).toBe(expected);
  });

  it('falls back to a code embedded in Error.message when `.code` is missing', () => {
    const err = new Error('Firebase: Error (auth/popup-blocked).');
    expect(formatFirebaseAuthError(err, 'fallback')).toBe(
      'Pop-up blocked. Allow pop-ups for this site and try Google sign-in again.'
    );
  });

  it('passes through a local-auth Error that already has friendly copy', () => {
    const err = new Error('No account found for this email. Create a host account first.');
    expect(formatFirebaseAuthError(err, 'fallback')).toBe(err.message);
  });

  it('uses the fallback for non-Error values without a known code', () => {
    expect(formatFirebaseAuthError(null, 'Sign-in failed')).toBe('Sign-in failed');
    expect(formatFirebaseAuthError('nope', 'Sign-in failed')).toBe('Sign-in failed');
  });

  it('ignores an unknown `.code` and uses the Error message', () => {
    const err = Object.assign(new Error('Something exploded'), { code: 'auth/totally-new' });
    expect(formatFirebaseAuthError(err, 'fallback')).toBe('Something exploded');
  });
});
