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
