import { describe, it, expect, beforeEach } from 'vitest';
import { QaRepository } from './qa-repository.js';
import type { Session, Participant, Series, SeriesParticipant } from '../app/models/qa.models.js';

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

function makeSeriesParticipant(): SeriesParticipant {
  return {
    clientFingerprint: 'fp1',
    name: 'Ada',
    isBanned: false,
    joinedAt: '2026-01-01',
    lastSeenAt: '2026-01-01',
    questionCount: 0,
    segmentsVisited: ['general'],
  };
}

describe('QaRepository: series & seriesParticipants', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores and retrieves series by code', () => {
    const series = { joinCode: 'NEXT26' } as Series;
    repo.setSeries('NEXT26', series);
    expect(repo.getSeries('NEXT26')).toBe(series);
    expect(repo.hasSeries('NEXT26')).toBe(true);
    expect(repo.hasSeries('NOPE')).toBe(false);
    expect(repo.getSeries('NOPE')).toBeUndefined();
    expect(repo.listSeries().map(s => s.joinCode)).toEqual(['NEXT26']);
  });

  it('lazily creates the series-participant map on first write', () => {
    const p = makeSeriesParticipant();
    repo.setSeriesParticipant('NEXT26', 'fp1', p);
    expect(repo.getSeriesParticipant('NEXT26', 'fp1')).toEqual(p);
    expect(repo.listSeriesParticipants('NEXT26')).toEqual([p]);
    expect(repo.countSeriesParticipants('NEXT26')).toBe(1);
  });

  it('returns empty list/zero count for a series with no participants yet', () => {
    expect(repo.getSeriesParticipant('NEVER-SEEN', 'fp1')).toBeUndefined();
    expect(repo.listSeriesParticipants('NEVER-SEEN')).toEqual([]);
    expect(repo.countSeriesParticipants('NEVER-SEEN')).toBe(0);
  });

  it('initSeriesParticipants creates an empty series-participant map when absent', () => {
    expect(repo.hasSeriesParticipants('NEXT26')).toBe(false);
    repo.initSeriesParticipants('NEXT26');
    expect(repo.hasSeriesParticipants('NEXT26')).toBe(true);
    expect(repo.listSeriesParticipants('NEXT26')).toEqual([]);
    expect(repo.countSeriesParticipants('NEXT26')).toBe(0);
  });

  it('initSeriesParticipants is idempotent and does not clobber existing participants', () => {
    const p = makeSeriesParticipant();
    repo.setSeriesParticipant('NEXT26', 'fp1', p);
    repo.initSeriesParticipants('NEXT26');
    repo.initSeriesParticipants('NEXT26');
    expect(repo.countSeriesParticipants('NEXT26')).toBe(1);
    expect(repo.getSeriesParticipant('NEXT26', 'fp1')).toBe(p);
  });

  it('hasSeriesParticipants is true after lazy creation via setSeriesParticipant', () => {
    const p = makeSeriesParticipant();
    expect(repo.hasSeriesParticipants('NEXT26')).toBe(false);
    repo.setSeriesParticipant('NEXT26', 'fp1', p);
    expect(repo.hasSeriesParticipants('NEXT26')).toBe(true);
  });

  it('keeps series participants separate from legacy session participants', () => {
    repo.initSeriesParticipants('NEXT26');
    expect(repo.hasParticipants('NEXT26')).toBe(false);
    repo.initParticipants('ROOM1');
    expect(repo.hasSeriesParticipants('ROOM1')).toBe(false);
  });
});
