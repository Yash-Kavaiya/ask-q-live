import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionApiClient } from './session-api.client';

describe('SessionApiClient', () => {
  let client: SessionApiClient;

  beforeEach(() => {
    client = new SessionApiClient();
  });

  it('authenticateRole posts the token and returns the parsed UserAccessInfo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: 'organizer', scope: ['*'] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.authenticateRole('ABC123', 'org_secret');

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/ABC123/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'org_secret' }),
    });
    expect(result).toEqual({ role: 'organizer', scope: ['*'] });
  });

  it('joinSession throws the server-provided error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Session not found or invalid room code' }),
    }));

    await expect(client.joinSession('ABC123', { fingerprint: 'fp1', name: 'Ada' }))
      .rejects.toThrow('Session not found or invalid room code');
  });

  it('checkCodeAvailability returns { available: true } on a network error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await client.checkCodeAvailability('ABC');
    expect(result).toEqual({ available: true });
  });

  it('getPrivilegedSegments sends the Bearer token and returns null on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.getPrivilegedSegments('ABC123', 'org_secret');

    expect(fetchMock).toHaveBeenCalledWith('/api/series/ABC123/segments', {
      headers: { Authorization: 'Bearer org_secret' },
    });
    expect(result).toBeNull();
  });
});

describe('SessionApiClient: questions & analytics', () => {
  let client: SessionApiClient;

  beforeEach(() => {
    client = new SessionApiClient();
  });

  it('submitQuestion posts to /questions and returns the parsed body on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deduplicated: false, question: { id: 'q1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.submitQuestion('ABC123', { content: 'Why?' });

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/ABC123/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Why?' }),
    });
    expect(result.question?.id).toBe('q1');
  });

  it('toggleUpvote returns null (not a throw) when the server responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await client.toggleUpvote('ABC123', 'q1', 'fp1');
    expect(result).toBeNull();
  });

  it('deleteQuestion returns true only when the response is ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    expect(await client.deleteQuestion('ABC123', 'q1', { clientFingerprint: 'fp1', isAdmin: false })).toBe(true);
  });

  it('translateText returns the original text on a network error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await client.translateText('ABC123', 'hello', 'fr')).toBe('hello');
  });

  it('banParticipant rejects on a network error instead of returning false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(client.banParticipant('ABC123', 'fp1', true)).rejects.toThrow('offline');
  });
});
