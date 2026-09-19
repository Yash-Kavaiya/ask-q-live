import { describe, it, expect, beforeEach } from 'vitest';
import { QaStore } from './qa-store.js';
import { QaRepository } from './qa-repository.js';
import { silentAiGateway } from './ai-gateway.js';

describe('QaStore host token binding', () => {
  let store: QaStore;

  beforeEach(() => {
    store = new QaStore(true, { repo: new QaRepository(), ai: silentAiGateway });
  });

  it('claimOrganizerToken writes organizerToken and session adminToken', () => {
    expect(store.claimOrganizerToken('NEXT26', '  org_new_secret  ')).toBe(true);
    expect(store.getSeries('NEXT26')!.organizerToken).toBe('org_new_secret');
    expect(store.getSession('NEXT26')!.adminToken).toBe('org_new_secret');
  });

  it('claimOrganizerToken returns false when the code is unknown', () => {
    expect(store.claimOrganizerToken('NOPE99', 'org_x')).toBe(false);
  });

  it('bindJoinAdminToken only binds admin_/org_/host_ prefixes', () => {
    const original = store.getSeries('NEXT26')!.organizerToken;
    store.bindJoinAdminToken('NEXT26', 'speaker_token_sundar');
    expect(store.getSeries('NEXT26')!.organizerToken).toBe(original);

    store.bindJoinAdminToken('NEXT26', 'admin_from_join');
    expect(store.getSeries('NEXT26')!.organizerToken).toBe('admin_from_join');
    expect(store.getSession('NEXT26')!.adminToken).toBe('admin_from_join');

    store.bindJoinAdminToken('NEXT26', 'org_from_join');
    expect(store.getSeries('NEXT26')!.organizerToken).toBe('org_from_join');

    store.bindJoinAdminToken('NEXT26', 'host_from_join');
    expect(store.getSeries('NEXT26')!.organizerToken).toBe('host_from_join');
  });
});
