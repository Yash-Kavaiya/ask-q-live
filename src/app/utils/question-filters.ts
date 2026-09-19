import { Question } from '../models/qa.models';

export interface QuestionFilterState {
  category: string;
  status: string;
  segmentFilter: string;
  search: string;
  sort: 'popular' | 'trending' | 'recent' | 'top';
  userFingerprint: string;
  upvotedIds: Set<string>;
  isModerationView: boolean;
  isSpeaker: boolean;
  speakerSegmentId: string | null;
}

const TOP_PRIORITIZED_LIMIT = 3;
const MS_PER_MINUTE = 60_000;
const TRENDING_AGE_OFFSET_MINUTES = 2;
const TRENDING_GRAVITY = 1.2;

export function filterAndSortQuestions(questions: Question[], state: QuestionFilterState): Question[] {
  return sortQuestions(
    questions.filter(q => matchesQuestionFilters(q, state)),
    state.sort,
  );
}

function matchesQuestionFilters(q: Question, state: QuestionFilterState): boolean {
  if (!state.isModerationView) {
    if (q.status === 'REJECTED' || (q.status === 'PENDING_REVIEW' && q.clientFingerprint !== state.userFingerprint)) {
      return false;
    }
  }

  if (state.isSpeaker && state.speakerSegmentId) {
    if (q.segmentId !== state.speakerSegmentId) return false;
  } else if (state.segmentFilter !== 'ALL') {
    if (q.segmentId !== state.segmentFilter) return false;
  }

  if (state.category !== 'ALL' && q.category !== state.category) return false;

  if (state.status === 'MY_QUESTIONS') {
    if (q.clientFingerprint !== state.userFingerprint) return false;
  } else if (state.status === 'UPVOTED') {
    if (!state.upvotedIds.has(q.id)) return false;
  } else if (state.status === 'AI_ANSWERED') {
    if (!q.aiLine1 || q.aiStatus !== 'READY') return false;
  } else if (state.status !== 'ALL' && q.status !== state.status) {
    return false;
  }

  return matchesSearch(q, state.search.toLowerCase().trim());
}

function matchesSearch(q: Question, search: string): boolean {
  if (!search) return true;
  const matchesContent = q.content.toLowerCase().includes(search);
  const matchesAuthor = q.authorName.toLowerCase().includes(search);
  const matchesSpeaker = !!q.speakerName && q.speakerName.toLowerCase().includes(search);
  const matchesAi =
    (!!q.aiLine1 && q.aiLine1.toLowerCase().includes(search)) ||
    (!!q.aiLine2 && q.aiLine2.toLowerCase().includes(search));
  return matchesContent || matchesAuthor || matchesSpeaker || matchesAi;
}

function sortQuestions(questions: Question[], sort: QuestionFilterState['sort']): Question[] {
  if (sort === 'popular' || sort === 'top') {
    return [...questions].sort(compareByPopularity);
  }
  if (sort === 'recent') {
    return [...questions].sort(compareByRecency);
  }
  return [...questions].sort(compareByTrending);
}

function answeringFirst(a: Question, b: Question): number {
  if (a.status === 'ANSWERING' && b.status !== 'ANSWERING') return -1;
  if (b.status === 'ANSWERING' && a.status !== 'ANSWERING') return 1;
  return 0;
}

function compareByPopularity(a: Question, b: Question): number {
  return answeringFirst(a, b) || b.upvotes - a.upvotes || compareByRecency(a, b);
}

function compareByRecency(a: Question, b: Question): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function compareByTrending(a: Question, b: Question): number {
  const spotlight = answeringFirst(a, b);
  if (spotlight !== 0) return spotlight;
  const now = Date.now();
  return trendingScore(b, now) - trendingScore(a, now);
}

function trendingScore(q: Question, now: number): number {
  const ageMinutes = (now - new Date(q.createdAt).getTime()) / MS_PER_MINUTE;
  return (q.upvotes + 1) / Math.pow(ageMinutes + TRENDING_AGE_OFFSET_MINUTES, TRENDING_GRAVITY);
}

export function selectPendingModerationQuestions(questions: Question[]): Question[] {
  return questions.filter(q => q.status === 'PENDING_REVIEW' || q.isSpam);
}

export function selectTopPrioritizedQuestions(questions: Question[]): Question[] {
  return questions
    .filter(q => (q.status === 'APPROVED' || q.status === 'ANSWERING') && q.upvotes > 0)
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, TOP_PRIORITIZED_LIMIT);
}
