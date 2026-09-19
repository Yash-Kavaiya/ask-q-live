/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientStorageService } from './client-storage.service';

describe('ClientStorageService', () => {
  let service: ClientStorageService;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
    service = new ClientStorageService();
  });

  it('round-trips the fingerprint', () => {
    expect(service.getFingerprint()).toBeNull();
    service.setFingerprint('fp-abc123');
    expect(service.getFingerprint()).toBe('fp-abc123');
    expect(store['live_qa_fingerprint']).toBe('fp-abc123');
  });

  it('round-trips the auth token and clears it', () => {
    service.setAuthToken('org_secret');
    expect(service.getAuthToken()).toBe('org_secret');
    service.clearAuthToken();
    expect(service.getAuthToken()).toBeNull();
  });

  it('round-trips hosted-sessions-history and clears it', () => {
    service.setHostedSessionsHistory('[{"joinCode":"ABC"}]');
    expect(service.getHostedSessionsHistory()).toBe('[{"joinCode":"ABC"}]');
    service.clearHostedSessionsHistory();
    expect(service.getHostedSessionsHistory()).toBeNull();
  });

  it('scopes cached questions and upvoted ids by join code', () => {
    service.setCachedQuestions('ABC', '[{"id":"q1"}]');
    service.setCachedQuestions('XYZ', '[{"id":"q2"}]');
    expect(service.getCachedQuestions('ABC')).toBe('[{"id":"q1"}]');
    expect(service.getCachedQuestions('XYZ')).toBe('[{"id":"q2"}]');

    service.setUpvotedIds('ABC', '["q1"]');
    expect(service.getUpvotedIds('ABC')).toBe('["q1"]');
  });
});
