export interface Session {
  id: string;
  title: string;
  code: string;
  description?: string;
  hostUid: string;
  hostName: string;
  isActive: boolean;
  allowAnonymous: boolean;
  createdAt: string;
}

export interface Question {
  id: string;
  sessionId: string;
  text: string;
  authorUid: string;
  authorName: string;
  isAnonymous: boolean;
  upvotes: number;
  status: 'pending' | 'approved' | 'answered' | 'hidden';
  answerText?: string;
  humanAnswers?: any[];
  createdAt: string;
}

export interface PollOption {
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  sessionId: string;
  question: string;
  options: PollOption[];
  isActive: boolean;
  createdAt: string;
  userVotedIndex?: number;
}
