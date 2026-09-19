import { Injectable } from '@angular/core';

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

  getFingerprint(): string | null { return this.getItem('live_qa_fingerprint'); }
  setFingerprint(fp: string): void { this.setItem('live_qa_fingerprint', fp); }

  getUsername(): string | null { return this.getItem('live_qa_username'); }
  setUsername(name: string): void { this.setItem('live_qa_username', name); }

  getEmail(): string | null { return this.getItem('live_qa_email'); }
  setEmail(email: string): void { this.setItem('live_qa_email', email); }

  getAuthToken(): string | null { return this.getItem('live_qa_auth_token'); }
  setAuthToken(token: string): void { this.setItem('live_qa_auth_token', token); }
  clearAuthToken(): void { this.removeItem('live_qa_auth_token'); }

  getHostedSessionsHistory(): string | null { return this.getItem('live_qa_hosted_sessions_history'); }
  setHostedSessionsHistory(json: string): void { this.setItem('live_qa_hosted_sessions_history', json); }
  clearHostedSessionsHistory(): void { this.removeItem('live_qa_hosted_sessions_history'); }

  getCachedQuestions(joinCode: string): string | null { return this.getItem(`askqlive_questions_${joinCode}`); }
  setCachedQuestions(joinCode: string, json: string): void { this.setItem(`askqlive_questions_${joinCode}`, json); }

  getUpvotedIds(joinCode: string): string | null { return this.getItem(`askqlive_upvoted_${joinCode}`); }
  setUpvotedIds(joinCode: string, json: string): void { this.setItem(`askqlive_upvoted_${joinCode}`, json); }
}
