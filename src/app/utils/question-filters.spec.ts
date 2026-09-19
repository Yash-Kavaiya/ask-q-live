import { describe, it, expect, vi, afterEach } from 'vitest';
import { filterAndSortQuestions, selectPendingModerationQuestions, selectTopPrioritizedQuestions, QuestionFilterState } from './question-filters';
import type { Question } from '../models/qa.models';

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q1',
    sessionId: 'S1',
    clientFingerprint: 'fp1',
    authorName: 'Attendee',
    isAnonymous: false,
    content: 'Why does this happen?',
    category: 'General',
    aiStatus: 'IDLE',
    isGroundedOnDeck: false,
    upvotes: 0,
    isSpam: false,
    status: 'APPROVED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Question;
}

const baseState: QuestionFilterState = {
  category: 'ALL',
  status: 'ALL',
  segmentFilter: 'ALL',
  search: '',
  sort: 'popular',
  userFingerprint: 'fp1',
  upvotedIds: new Set(),
  isModerationView: false,
  isSpeaker: false,
  speakerSegmentId: null,
};

describe('filterAndSortQuestions', () => {
  it('hides REJECTED questions outside the moderation view', () => {
    const questions = [makeQuestion({ id: 'q1', status: 'REJECTED' }), makeQuestion({ id: 'q2', status: 'APPROVED' })];
    const result = filterAndSortQuestions(questions, baseState);
    expect(result.map(q => q.id)).toEqual(['q2']);
  });

  it('hides other attendees\' PENDING_REVIEW questions but shows your own', () => {
    const questions = [
      makeQuestion({ id: 'mine', status: 'PENDING_REVIEW', clientFingerprint: 'fp1' }),
      makeQuestion({ id: 'other', status: 'PENDING_REVIEW', clientFingerprint: 'fp2' }),
    ];
    const result = filterAndSortQuestions(questions, baseState);
    expect(result.map(q => q.id)).toEqual(['mine']);
  });

  it('shows REJECTED and PENDING_REVIEW questions in the moderation view', () => {
    const questions = [makeQuestion({ id: 'q1', status: 'REJECTED' }), makeQuestion({ id: 'q2', status: 'PENDING_REVIEW', clientFingerprint: 'fp2' })];
    const result = filterAndSortQuestions(questions, { ...baseState, isModerationView: true });
    expect(result.map(q => q.id).sort()).toEqual(['q1', 'q2']);
  });

  it('filters a speaker to only their assigned segment, ignoring segmentFilter', () => {
    const questions = [makeQuestion({ id: 'mine', segmentId: 'seg-1' }), makeQuestion({ id: 'other', segmentId: 'seg-2' })];
    const result = filterAndSortQuestions(questions, { ...baseState, isSpeaker: true, speakerSegmentId: 'seg-1', segmentFilter: 'seg-2' });
    expect(result.map(q => q.id)).toEqual(['mine']);
  });

  it('filters by category', () => {
    const questions = [makeQuestion({ id: 'a', category: 'Technical' }), makeQuestion({ id: 'b', category: 'General' })];
    const result = filterAndSortQuestions(questions, { ...baseState, category: 'Technical' });
    expect(result.map(q => q.id)).toEqual(['a']);
  });

  it('MY_QUESTIONS status filter matches by clientFingerprint', () => {
    const questions = [makeQuestion({ id: 'mine', clientFingerprint: 'fp1' }), makeQuestion({ id: 'other', clientFingerprint: 'fp2' })];
    const result = filterAndSortQuestions(questions, { ...baseState, status: 'MY_QUESTIONS' });
    expect(result.map(q => q.id)).toEqual(['mine']);
  });

  it('UPVOTED status filter matches the upvotedIds set', () => {
    const questions = [makeQuestion({ id: 'up' }), makeQuestion({ id: 'down' })];
    const result = filterAndSortQuestions(questions, { ...baseState, status: 'UPVOTED', upvotedIds: new Set(['up']) });
    expect(result.map(q => q.id)).toEqual(['up']);
  });

  it('AI_ANSWERED status filter requires a READY aiLine1', () => {
    const questions = [
      makeQuestion({ id: 'answered', aiLine1: 'Because.', aiStatus: 'READY' }),
      makeQuestion({ id: 'unanswered' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, status: 'AI_ANSWERED' });
    expect(result.map(q => q.id)).toEqual(['answered']);
  });

  it('search matches content, authorName, speakerName, or AI answer lines', () => {
    const questions = [
      makeQuestion({ id: 'byContent', content: 'What about latency?' }),
      makeQuestion({ id: 'byAuthor', authorName: 'Latency Larry' }),
      makeQuestion({ id: 'bySpeaker', speakerName: 'Dr Latency' }),
      makeQuestion({ id: 'byAi', aiLine1: 'Caused by latency', aiLine2: 'Check the p99' }),
      makeQuestion({ id: 'noMatch', content: 'Unrelated' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, search: 'latency' });
    expect(result.map(q => q.id).sort()).toEqual(['byAi', 'byAuthor', 'byContent', 'bySpeaker']);
  });

  it('sorts by popular: ANSWERING first, then highest upvotes, then newest', () => {
    const questions = [
      makeQuestion({ id: 'low', upvotes: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeQuestion({ id: 'high', upvotes: 10, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeQuestion({ id: 'answering', upvotes: 0, status: 'ANSWERING', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, sort: 'popular' });
    expect(result.map(q => q.id)).toEqual(['answering', 'high', 'low']);
  });

  it('sorts by recent: newest createdAt first', () => {
    const questions = [
      makeQuestion({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeQuestion({ id: 'new', createdAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, sort: 'recent' });
    expect(result.map(q => q.id)).toEqual(['new', 'old']);
  });

  it('treats sort "top" the same as popular', () => {
    const questions = [
      makeQuestion({ id: 'low', upvotes: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeQuestion({ id: 'high', upvotes: 10, createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, sort: 'top' });
    expect(result.map(q => q.id)).toEqual(['high', 'low']);
  });

  it('sorts by trending: ANSWERING first, then recency-weighted upvotes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-01T01:00:00.000Z'));
    const questions = [
      makeQuestion({ id: 'oldHigh', upvotes: 20, createdAt: '2025-12-01T00:00:00.000Z' }),
      makeQuestion({ id: 'fresh', upvotes: 2, createdAt: '2026-01-01T00:50:00.000Z' }),
      makeQuestion({ id: 'answering', upvotes: 0, status: 'ANSWERING', createdAt: '2025-12-01T00:00:00.000Z' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, sort: 'trending' });
    expect(result.map(q => q.id)).toEqual(['answering', 'fresh', 'oldHigh']);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selectPendingModerationQuestions', () => {
  it('selects questions that are PENDING_REVIEW or flagged as spam', () => {
    const questions = [
      makeQuestion({ id: 'pending', status: 'PENDING_REVIEW' }),
      makeQuestion({ id: 'spam', isSpam: true }),
      makeQuestion({ id: 'clean' }),
    ];
    expect(selectPendingModerationQuestions(questions).map(q => q.id).sort()).toEqual(['pending', 'spam']);
  });
});

describe('selectTopPrioritizedQuestions', () => {
  it('selects up to 3 APPROVED/ANSWERING questions with upvotes, highest first', () => {
    const questions = [
      makeQuestion({ id: 'a', status: 'APPROVED', upvotes: 5 }),
      makeQuestion({ id: 'b', status: 'APPROVED', upvotes: 10 }),
      makeQuestion({ id: 'c', status: 'APPROVED', upvotes: 0 }),
      makeQuestion({ id: 'd', status: 'REJECTED', upvotes: 100 }),
      makeQuestion({ id: 'e', status: 'ANSWERING', upvotes: 3 }),
      makeQuestion({ id: 'f', status: 'APPROVED', upvotes: 20 }),
    ];
    const result = selectTopPrioritizedQuestions(questions);
    expect(result.map(q => q.id)).toEqual(['f', 'b', 'a']);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
