import { Question } from '../app/models/qa.models.js';

export interface SessionMetrics {
  aiCoverageRatio: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    critical: number;
    positivePct: number;
    neutralPct: number;
    criticalPct: number;
  };
  topQuestions: { id: string; content: string; authorName: string; upvotes: number }[];
}

const POSITIVE_THRESHOLD = 0.2;
const CRITICAL_THRESHOLD = -0.2;

export function computeSessionMetrics(questions: Question[]): SessionMetrics {
  const total = questions.length;
  const answered = questions.filter(q => q.aiLine1 && q.aiStatus === 'READY').length;
  const aiCoverageRatio = total === 0 ? 0 : Math.round((answered / total) * 100);

  let positive = 0;
  let neutral = 0;
  let critical = 0;
  for (const q of questions) {
    const score = q.sentimentScore ?? 0;
    if (score >= POSITIVE_THRESHOLD) positive++;
    else if (score <= CRITICAL_THRESHOLD) critical++;
    else neutral++;
  }
  const evaluated = positive + neutral + critical || 1;

  const topQuestions = [...questions]
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, 5)
    .map(q => ({
      id: q.id,
      content: q.content,
      authorName: q.authorName || (q.isAnonymous ? 'Anonymous' : 'Attendee'),
      upvotes: q.upvotes,
    }));

  return {
    aiCoverageRatio,
    sentimentBreakdown: {
      positive,
      neutral,
      critical,
      positivePct: Math.round((positive / evaluated) * 100),
      neutralPct: Math.round((neutral / evaluated) * 100),
      criticalPct: Math.round((critical / evaluated) * 100),
    },
    topQuestions,
  };
}
