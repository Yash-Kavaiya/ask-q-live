export type ModerationAction = 'APPROVE' | 'FLAG_FOR_REVIEW' | 'AUTO_REJECT';
export type QuestionStatus = 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'ANSWERING' | 'ANSWERED';
export type ModerationSensitivity = 'STRICT' | 'BALANCED' | 'RELAXED';
export type SegmentType = 'TALK' | 'BREAK' | 'PANEL' | 'LOBBY';
export type SegmentStatus = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'SKIPPED' | 'GRACE_WINDOW';
export type SeriesState = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'ARCHIVED';
export type SegmentState = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'SKIPPED';
export type UserRole = 'organizer' | 'speaker' | 'moderator' | 'attendee';

export interface SpeakerProfile {
  name: string;
  title?: string;
  org?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface SessionSettings {
  moderationSensitivity: ModerationSensitivity;
  autoAiAnswers: boolean;
  allowAnonymous: boolean;
  maxQuestionsPerMinute: number;
}

export interface SeriesSettings {
  autoAdvance: boolean;
  graceWindowMinutes: number;
  allowPreSubmit: boolean;
  allowSpeakerSelfEnd: boolean;
  autoParkUnanswered: boolean;
  cascadeScheduleShift: boolean;
  defaultModerationSensitivity: ModerationSensitivity;
  allowAnonymous: boolean;
  maxQuestionsPerMinute: number;
  maxQuestionsPerSeriesPerHour: number;
  showCrossSegmentSimilarHint: boolean;
}

export interface Segment {
  id: string;
  seriesId: string;
  title: string;
  speakerName: string;
  speakerBio?: string;
  speakerRole?: string;
  speakerOrg?: string;
  speakerAvatar?: string;
  speaker?: SpeakerProfile;
  talkTitle?: string;
  topicSummary?: string;
  type: SegmentType;
  status: SegmentStatus;
  state?: SegmentState;
  startTime: string; // ISO or human string (e.g. '09:00')
  scheduledStart?: string;
  scheduledDurationMinutes: number;
  durationMinutes?: number;
  actualStartTime?: string;
  actualEndTime?: string;
  actualStart?: string;
  actualEnd?: string;
  groundingContext?: string;
  contextData?: string;
  categories: string[];
  adminToken: string;
  order: number;
  graceWindowMinutes: number;
  moderationSensitivity?: ModerationSensitivity;
  autoAiAnswers?: boolean;
  questionCount?: number;
  upvoteCount?: number;
  answeredCount?: number;
}

export interface Series {
  id: string;
  seriesCode: string;
  organizerToken: string;
  creatorUid?: string;
  title: string;
  description?: string;
  contextData?: string;
  startDate: string;
  timezone: string;
  state: SeriesState;
  segmentIds: string[];
  liveSegmentId?: string | null;
  settings: SeriesSettings;
  createdAt: string;
  updatedAt: string;
  revision?: number;

  // Backward-compatibility and UI convenience aliases:
  joinCode: string;
  date?: string;
  seriesContextData?: string;
  autoAdvance?: boolean;
  isActive?: boolean;
  activeSegmentId?: string | null;
  segments: Segment[];
}

export type SessionSeries = Series;

export interface SeriesParticipant {
  clientFingerprint: string;
  name: string;
  isBanned: boolean;
  joinedAt: string;
  lastSeenAt: string;
  questionCount: number;
  segmentsVisited: string[];
}

export interface UserAccessInfo {
  role: UserRole;
  scope: string[]; // Segment IDs or ['*'] for all
  token?: string;
  segmentId?: string; // If speaker role
}

export interface Session {
  id: string;
  joinCode: string;
  adminToken: string;
  title: string;
  description?: string;
  contextData?: string;
  isActive: boolean;
  createdAt: string;
  categories: string[];
  settings: SessionSettings;
  seriesId?: string;
  seriesCode?: string;
  order?: number;
  segmentType?: SegmentType;
  state?: SegmentState;
  speaker?: SpeakerProfile;
  talkTitle?: string;
  scheduledStart?: string;
  durationMinutes?: number;
  actualStart?: string;
  actualEnd?: string;
  segmentId?: string;

  // Compatibility fields
  speakerName?: string;
  startTime?: string;
  scheduledDurationMinutes?: number;
  graceWindowMinutes?: number;
}

export interface Question {
  id: string;
  sessionId: string;
  seriesId?: string;
  segmentId?: string;
  segmentTitle?: string;
  speakerName?: string;
  targetedExplicitly?: boolean;
  movedFrom?: { segmentId: string; at: string; by: string }[];
  isParked?: boolean;
  clientFingerprint: string;
  authorName: string;
  isAnonymous: boolean;
  content: string;
  category?: string;
  aiLine1?: string;
  aiLine2?: string;
  aiConfidence?: number;
  aiStatus?: 'IDLE' | 'GENERATING' | 'READY' | 'FAILED';
  upvotes: number;
  isSpam: boolean;
  spamScore?: number;
  flagReason?: string;
  moderationReason?: string;
  status: QuestionStatus;
  sentimentScore?: number;
  clusteredWithId?: string;
  clusterCount?: number;
  decayScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  clientFingerprint: string;
  name: string;
  isBanned: boolean;
  joinedAt: string;
  questionCount: number;
}

export interface TelemetryMetrics {
  questionVelocity: number; // questions in last 60s
  velocity?: number;
  upvoteMomentum: number; // upvotes in last 60s
  upvoteVelocity?: number;
  sentimentPolarity: number; // -1.0 to 1.0
  topicDistribution: {
    topic: string;
    count: number;
    percentage: number;
  }[];
  totalQuestions: number;
  totalUpvotes?: number;
  approvedQuestions: number;
  flaggedQuestions: number;
  answeredQuestions: number;
  activeParticipants: number;
}

export interface SegmentScore {
  segmentId: string;
  speakerName: string;
  talkTitle: string;
  questionCount: number;
  uniqueAskers: number;
  upvoteCount: number;
  answeredCount: number;
  answeredRate: number;
  avgSentiment: number;
  avgConfidence: number;
  unansweredCount: number;
}

export interface SeriesTelemetry {
  totalQuestions: number;
  totalUpvotes: number;
  uniqueParticipants: number;
  answeredRate: number;
  timeline: { t: string; questions: number; upvotes: number; segmentId?: string }[];
  speakerScorecard: SegmentScore[];
  topicDrift: { topic: string; segments: string[]; count: number }[];
  unansweredDebt: { segmentId: string; segmentTitle: string; unansweredCount: number; upvotesTotal: number }[];
  attendanceCurve: { segmentId: string; segmentTitle: string; activeParticipants: number }[];
}

export interface WordFrequency {
  text: string;
  value: number;
  count: number;
  sentimentScore?: number;
  positiveCount?: number;
  neutralCount?: number;
  criticalCount?: number;
  totalUpvotes?: number;
  sampleQuestion?: string;
  relatedQuestionCount?: number;
}

export interface ModerationResult {
  isSpam: boolean;
  isToxic: boolean;
  flagReason?: string;
  recommendedAction: ModerationAction;
  confidence: number;
}

export interface TwoLineAnswerResult {
  firstLine: string;
  secondLine: string;
  confidenceScore: number;
}

export interface ThematicCluster {
  title: string;
  description: string;
  questionExamples: string[];
}

export interface PostSessionReport {
  sessionTitle: string;
  generatedAt: string;
  totalQuestions: number;
  totalUpvotes: number;
  executiveSummary?: string;
  topThemes: ThematicCluster[];
  unresolvedTopics: {
    topic: string;
    significance: string;
  }[];
  actionableFollowUps: string[];
  markdownReport: string;
}

export interface SpeakerComparison {
  segmentId: string;
  speakerName: string;
  talkTitle: string;
  questionCount: number;
  upvoteCount: number;
  answeredCount: number;
  sentimentScore: number;
  topQuestion?: string;
}

export interface SeriesReport {
  seriesTitle: string;
  seriesCode?: string;
  joinCode?: string;
  generatedAt: string;
  totalQuestions: number;
  totalUpvotes: number;
  totalParticipants?: number;
  executiveSummary: string;
  segmentReports?: PostSessionReport[];
  speakerComparisons?: SpeakerComparison[];
  speakerScorecard?: SegmentScore[];
  crossCuttingThemes: ThematicCluster[];
  unresolvedTopics: {
    topic: string;
    significance: string;
    speakerName?: string;
  }[];
  actionableFollowUps: string[];
  markdownReport: string;
}

export interface AuditEntry {
  id: string;
  seriesId: string;
  segmentId?: string;
  actorRole: UserRole | string;
  actorRef: string;
  action: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface HostedSessionRecord {
  id: string;
  joinCode: string;
  title: string;
  description?: string;
  type: 'single' | 'series';
  adminToken?: string;
  createdAt: string;
  lastAccessedAt: string;
  status?: 'ACTIVE' | 'CONCLUDED' | 'SCHEDULED';
  segmentCount?: number;
  questionCount?: number;
}

export interface ActiveLiveRoomPreview {
  type: 'single' | 'series';
  joinCode: string;
  title: string;
  description?: string;
  state?: string;
  date?: string;
  timezone?: string;
  activeSpeaker?: string;
  activeSpeakerRole?: string;
  activeTalk?: string;
  activeSegmentId?: string;
  participantCount?: number;
  categories?: string[];
  series?: SessionSeries;
  session?: Session;
}
