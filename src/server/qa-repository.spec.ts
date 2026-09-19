import { describe, it, expect, beforeEach } from 'vitest';
import { QaRepository } from './qa-repository.js';
import type { Session, Participant } from '../app/models/qa.models.js';

describe('QaRepository: sessions & participants', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores and retrieves a session by join code', () => {
    const session = { joinCode: 'ABC123' } as Session;
    repo.setSession('ABC123', session);
    expect(repo.getSession('ABC123')).toBe(session);
    expect(repo.hasSession('ABC123')).toBe(true);
    expect(repo.getSession('NOPE')).toBeUndefined();
  });

  it('lists all sessions', () => {
    repo.setSession('A', { joinCode: 'A' } as Session);
    repo.setSession('B', { joinCode: 'B' } as Session);
    expect(repo.listSessions().map(s => s.joinCode).sort()).toEqual(['A', 'B']);
  });

  it('lazily creates the participant map on first write and lists participants', () => {
    const p: Participant = { clientFingerprint: 'fp1', name: 'Ada', joinedAt: '2026-01-01', isBanned: false, questionCount: 0 };
    repo.setParticipant('ABC123', 'fp1', p);
    expect(repo.getParticipant('ABC123', 'fp1')).toEqual(p);
    expect(repo.listParticipants('ABC123')).toEqual([p]);
    expect(repo.countParticipants('ABC123')).toBe(1);
  });

  it('returns empty list/zero count for a session with no participants yet', () => {
    expect(repo.listParticipants('NEVER-SEEN')).toEqual([]);
    expect(repo.countParticipants('NEVER-SEEN')).toBe(0);
  });

  it('initParticipants creates an empty participant map when absent', () => {
    expect(repo.hasParticipants('ABC123')).toBe(false);
    repo.initParticipants('ABC123');
    expect(repo.hasParticipants('ABC123')).toBe(true);
    expect(repo.listParticipants('ABC123')).toEqual([]);
    expect(repo.countParticipants('ABC123')).toBe(0);
  });

  it('initParticipants is idempotent and does not clobber existing participants', () => {
    const p: Participant = { clientFingerprint: 'fp1', name: 'Ada', joinedAt: '2026-01-01', isBanned: false, questionCount: 0 };
    repo.setParticipant('ABC123', 'fp1', p);
    expect(repo.countParticipants('ABC123')).toBe(1);
    repo.initParticipants('ABC123');
    expect(repo.countParticipants('ABC123')).toBe(1);
    expect(repo.getParticipant('ABC123', 'fp1')).toEqual(p);
  });

  it('hasParticipants returns false for nonexistent code', () => {
    expect(repo.hasParticipants('NEVER-SEEN')).toBe(false);
  });

  it('hasParticipants returns true after init even with zero participants', () => {
    repo.initParticipants('EMPTY');
    expect(repo.hasParticipants('EMPTY')).toBe(true);
    expect(repo.countParticipants('EMPTY')).toBe(0);
  });

  it('hasParticipants returns true after adding participants via lazy creation', () => {
    const p: Participant = { clientFingerprint: 'fp1', name: 'Ada', joinedAt: '2026-01-01', isBanned: false, questionCount: 0 };
    repo.setParticipant('ABC123', 'fp1', p);
    expect(repo.hasParticipants('ABC123')).toBe(true);
  });
});
