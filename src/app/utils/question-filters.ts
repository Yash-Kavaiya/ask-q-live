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

export function filterAndSortQuestions(questions: Question[], state: QuestionFilterState): Question[] {
  const search = state.search.toLowerCase().trim();

  let result = questions.filter(q => {
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

    if (search) {
      const matchesContent = q.content.toLowerCase().includes(search);
      const matchesAuthor = q.authorName.toLowerCase().includes(search);
      const matchesSpeaker = q.speakerName && q.speakerName.toLowerCase().includes(search);
      const matchesAi = (q.aiLine1 && q.aiLine1.toLowerCase().includes(search)) ||
        (q.aiLine2 && q.aiLine2.toLowerCase().includes(search));
      if (!matchesContent && !matchesAuthor && !matchesSpeaker && !matchesAi) return false;
    }

    return true;
  });

  if (state.sort === 'popular' || state.sort === 'top') {
    result = [...result].sort((a, b) => {
      if (a.status === 'ANSWERING' && b.status !== 'ANSWERING') return -1;
      if (b.status === 'ANSWERING' && a.status !== 'ANSWERING') return 1;
      if (b.upvotes !== a.upvotes) {
        return b.upvotes - a.upvotes;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else if (state.sort === 'recent') {
    result = [...result].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } else {
    result = [...result].sort((a, b) => {
      if (a.status === 'ANSWERING' && b.status !== 'ANSWERING') return -1;
      if (b.status === 'ANSWERING' && a.status !== 'ANSWERING') return 1;
      const now = Date.now();
      const scoreA = (a.upvotes + 1) / Math.pow((now - new Date(a.createdAt).getTime()) / 60000 + 2, 1.2);
      const scoreB = (b.upvotes + 1) / Math.pow((now - new Date(b.createdAt).getTime()) / 60000 + 2, 1.2);
      return scoreB - scoreA;
    });
  }

  return result;
}

export function selectPendingModerationQuestions(questions: Question[]): Question[] {
  return questions.filter(q => q.status === 'PENDING_REVIEW' || q.isSpam);
}

export function selectTopPrioritizedQuestions(questions: Question[]): Question[] {
  return questions
    .filter(q => (q.status === 'APPROVED' || q.status === 'ANSWERING') && q.upvotes > 0)
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, 3);
}
