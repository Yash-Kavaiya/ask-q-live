import { describe, expect, it, beforeEach } from 'vitest';
import { QaStore } from './qa-store';
import { resolveAuth } from './auth';
import { NEXT26_DEMO_SPEAKERS } from './demo-next26-segments';
import { geminiAiGateway } from './gemini-ai-gateway';
import { QaRepository } from './qa-repository';

describe('NEXT26 8-speaker seed + speaker invite login', () => {
  let store: QaStore;

  beforeEach(() => {
    store = new QaStore(true, { repo: new QaRepository(), ai: geminiAiGateway });
  });

  it('seeds exactly 8 NEXT26 speakers with emails and tokens', () => {
    const series = store.getSeries('NEXT26');
    expect(series).toBeTruthy();
    expect(series!.segments).toHaveLength(8);
    expect(NEXT26_DEMO_SPEAKERS).toHaveLength(8);

    for (const demo of NEXT26_DEMO_SPEAKERS) {
      const seg = series!.segments.find((s) => s.id === demo.id);
      expect(seg?.speakerName).toBe(demo.name);
      expect(seg?.speakerEmail).toBe(demo.email);
      expect(seg?.adminToken).toBe(demo.token);
    }
  });

  it('resolves speaker invites by email like moderator staff login', () => {
    const invites = store.findSpeakerInvitesByEmail('maya.chen@askqlive.demo');
    expect(invites.length).toBeGreaterThanOrEqual(1);
    expect(invites[0].joinCode).toBe('NEXT26');
    expect(invites[0].adminToken).toBe('speaker_token_maya');

    const auth = resolveAuth(store, 'NEXT26', invites[0].adminToken);
    expect(auth.role).toBe('speaker');
    expect(auth.segmentId).toBe('seg-2');
    expect(auth.scope).toEqual(['seg-2']);
  });

  it('keeps organizer auth working for moderator-style control room access', () => {
    const auth = resolveAuth(store, 'NEXT26', 'organizer_secret_next26');
    expect(auth.role).toBe('organizer');
    expect(auth.scope).toEqual(['*']);
  });
});
