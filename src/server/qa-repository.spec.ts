import { describe, it, expect, beforeEach } from 'vitest';
import { QaRepository } from './qa-repository.js';
import type { Session, Participant, Series, SeriesParticipant, Question, AuditEntry, PostSessionReport } from '../app/models/qa.models.js';

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

describe('QaRepository: questions, sessionQuestions & upvoteLedger', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores, retrieves, and deletes a question by id', () => {
    const q = { id: 'q1', content: 'Why?' } as Question;
    repo.setQuestion('q1', q);
    expect(repo.getQuestion('q1')).toBe(q);
    repo.deleteQuestion('q1');
    expect(repo.getQuestion('q1')).toBeUndefined();
  });

  it('lazily creates the question-id list on first add', () => {
    repo.addQuestionId('ABC', 'q1');
    repo.addQuestionId('ABC', 'q2');
    expect(repo.getQuestionIds('ABC')).toEqual(['q1', 'q2']);
  });

  it('returns an empty list for a code that has no question ids', () => {
    expect(repo.getQuestionIds('NEVER-SEEN')).toEqual([]);
  });

  it('overwrites the question-id list with setQuestionIds', () => {
    repo.addQuestionId('ABC', 'q1');
    repo.setQuestionIds('ABC', ['q2', 'q3']);
    expect(repo.getQuestionIds('ABC')).toEqual(['q2', 'q3']);
  });

  it('setQuestionIds with an empty list resets a non-empty list', () => {
    repo.addQuestionId('ABC', 'q1');
    repo.setQuestionIds('ABC', []);
    expect(repo.getQuestionIds('ABC')).toEqual([]);
  });

  it('keeps question-id lists separate per join code', () => {
    repo.addQuestionId('ABC', 'q1');
    repo.addQuestionId('XYZ', 'q2');
    expect(repo.getQuestionIds('ABC')).toEqual(['q1']);
    expect(repo.getQuestionIds('XYZ')).toEqual(['q2']);
  });

  it('tracks upvotes per question+fingerprint pair', () => {
    expect(repo.hasUpvote('q1', 'fp1')).toBe(false);
    repo.addUpvote('q1', 'fp1');
    expect(repo.hasUpvote('q1', 'fp1')).toBe(true);
    repo.removeUpvote('q1', 'fp1');
    expect(repo.hasUpvote('q1', 'fp1')).toBe(false);
  });

  it('does not conflate upvotes across different questions or fingerprints', () => {
    repo.addUpvote('q1', 'fp1');
    expect(repo.hasUpvote('q1', 'fp2')).toBe(false);
    expect(repo.hasUpvote('q2', 'fp1')).toBe(false);
  });
});

describe('QaRepository: rate limits, audit logs & cached reports', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores and retrieves rate-limit timestamps by key', () => {
    expect(repo.getRateLimitTimestamps('seg:q1')).toEqual([]);
    repo.setRateLimitTimestamps('seg:q1', [1, 2, 3]);
    expect(repo.getRateLimitTimestamps('seg:q1')).toEqual([1, 2, 3]);
  });

  it('lazily creates the audit log on first append and lists entries in insertion order', () => {
    expect(repo.getAuditLog('NEXT26')).toEqual([]);
    const e1 = { id: '1', action: 'SEGMENT_ADDED' } as AuditEntry;
    const e2 = { id: '2', action: 'SEGMENT_STARTED' } as AuditEntry;
    repo.appendAuditEntry('NEXT26', e1);
    repo.appendAuditEntry('NEXT26', e2);
    expect(repo.getAuditLog('NEXT26')).toEqual([e1, e2]);
  });

  it('does not create storage when an unknown audit log is read', () => {
    const missing = repo.getAuditLog('GHOST');
    missing.push({ id: 'x', action: 'SEGMENT_ADDED' } as AuditEntry);
    expect(repo.getAuditLog('GHOST')).toEqual([]);
  });

  it('caches a post-session report per segment id', () => {
    expect(repo.getCachedReport('seg-1')).toBeUndefined();
    const report = { sessionTitle: 'Talk' } as PostSessionReport;
    repo.setCachedReport('seg-1', report);
    expect(repo.getCachedReport('seg-1')).toBe(report);
  });
});
