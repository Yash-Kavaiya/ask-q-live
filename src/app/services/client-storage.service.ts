import { Injectable } from '@angular/core';

const KEY_FINGERPRINT = 'live_qa_fingerprint';
const KEY_USERNAME = 'live_qa_username';
const KEY_EMAIL = 'live_qa_email';
const KEY_AUTH_TOKEN = 'live_qa_auth_token';
const KEY_HOSTED_SESSIONS = 'live_qa_hosted_sessions_history';

function questionsCacheKey(joinCode: string): string {
  return `askqlive_questions_${joinCode}`;
}

function upvotedIdsKey(joinCode: string): string {
  return `askqlive_upvoted_${joinCode}`;
}

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

@Injectable({ providedIn: 'root' })
export class ClientStorageService {
  private getItem(key: string): string | null {
    if (!hasLocalStorage()) return null;
    return localStorage.getItem(key);
  }

  private setItem(key: string, value: string): void {
    if (!hasLocalStorage()) return;
    localStorage.setItem(key, value);
  }

  private removeItem(key: string): void {
    if (!hasLocalStorage()) return;
    localStorage.removeItem(key);
  }

  getFingerprint(): string | null { return this.getItem(KEY_FINGERPRINT); }
  setFingerprint(fingerprint: string): void { this.setItem(KEY_FINGERPRINT, fingerprint); }

  getUsername(): string | null { return this.getItem(KEY_USERNAME); }
  setUsername(name: string): void { this.setItem(KEY_USERNAME, name); }

  getEmail(): string | null { return this.getItem(KEY_EMAIL); }
  setEmail(email: string): void { this.setItem(KEY_EMAIL, email); }

  getAuthToken(): string | null { return this.getItem(KEY_AUTH_TOKEN); }
  setAuthToken(token: string): void { this.setItem(KEY_AUTH_TOKEN, token); }
  clearAuthToken(): void { this.removeItem(KEY_AUTH_TOKEN); }

  getHostedSessionsHistory(): string | null { return this.getItem(KEY_HOSTED_SESSIONS); }
  setHostedSessionsHistory(json: string): void { this.setItem(KEY_HOSTED_SESSIONS, json); }
  clearHostedSessionsHistory(): void { this.removeItem(KEY_HOSTED_SESSIONS); }

  getCachedQuestions(joinCode: string): string | null { return this.getItem(questionsCacheKey(joinCode)); }
  setCachedQuestions(joinCode: string, json: string): void { this.setItem(questionsCacheKey(joinCode), json); }

  getUpvotedIds(joinCode: string): string | null { return this.getItem(upvotedIdsKey(joinCode)); }
  setUpvotedIds(joinCode: string, json: string): void { this.setItem(upvotedIdsKey(joinCode), json); }
}
