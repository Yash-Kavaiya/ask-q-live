import { describe, it, expect } from 'vitest';
import { computeSessionMetrics } from './report-metrics.js';
import { Question } from '../app/models/qa.models.js';

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: overrides.id || 'q1',
    sessionId: 'sess-1',
    clientFingerprint: 'fp-1',
    authorName: 'Attendee',
    isAnonymous: false,
    content: 'Sample question?',
    upvotes: 0,
    isSpam: false,
    status: 'APPROVED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeSessionMetrics', () => {
  it('returns zeroed metrics for an empty question list', () => {
    const result = computeSessionMetrics([]);
    expect(result.aiCoverageRatio).toBe(0);
    expect(result.sentimentBreakdown).toEqual({
      positive: 0, neutral: 0, critical: 0, positivePct: 0, neutralPct: 0, criticalPct: 0,
    });
    expect(result.topQuestions).toEqual([]);
  });

  it('computes AI coverage ratio from aiLine1 + aiStatus READY', () => {
    const questions = [
      makeQuestion({ id: 'q1', aiLine1: 'Answer', aiStatus: 'READY' }),
      makeQuestion({ id: 'q2', aiLine1: 'Answer', aiStatus: 'READY' }),
      makeQuestion({ id: 'q3', aiStatus: 'GENERATING' }),
      makeQuestion({ id: 'q4' }),
    ];
    expect(computeSessionMetrics(questions).aiCoverageRatio).toBe(50);
  });

  it('buckets sentiment into positive, neutral, and critical using +-0.2 thresholds', () => {
    const questions = [
      makeQuestion({ id: 'q1', sentimentScore: 0.6 }),
      makeQuestion({ id: 'q2', sentimentScore: 0.2 }),
      makeQuestion({ id: 'q3', sentimentScore: 0 }),
      makeQuestion({ id: 'q4', sentimentScore: -0.2 }),
      makeQuestion({ id: 'q5', sentimentScore: -0.9 }),
    ];
    const { sentimentBreakdown } = computeSessionMetrics(questions);
    expect(sentimentBreakdown.positive).toBe(2);
    expect(sentimentBreakdown.neutral).toBe(1);
    expect(sentimentBreakdown.critical).toBe(2);
    expect(sentimentBreakdown.positivePct).toBe(40);
    expect(sentimentBreakdown.neutralPct).toBe(20);
    expect(sentimentBreakdown.criticalPct).toBe(40);
  });

  it('returns the top 5 questions by upvotes, most upvoted first', () => {
    const questions = Array.from({ length: 7 }, (_, i) =>
      makeQuestion({ id: `q${i}`, content: `Question ${i}`, upvotes: i })
    );
    const { topQuestions } = computeSessionMetrics(questions);
    expect(topQuestions).toHaveLength(5);
    expect(topQuestions[0]).toEqual({ id: 'q6', content: 'Question 6', authorName: 'Attendee', upvotes: 6 });
    expect(topQuestions[4].upvotes).toBe(2);
  });

  it('labels anonymous authors correctly in top questions', () => {
    const questions = [makeQuestion({ id: 'q1', isAnonymous: true, authorName: '', upvotes: 5 })];
    expect(computeSessionMetrics(questions).topQuestions[0].authorName).toBe('Anonymous');
  });
});
