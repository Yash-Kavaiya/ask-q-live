export interface TwoLineAnswer {
  firstLine: string;
  secondLine: string;
  confidenceScore: number;
  isGroundedOnDeck: boolean;
  ragModel?: string;
  retrievedChunks?: string[];
  topSimilarity?: number;
}

export interface ModerationDecision {
  isSpam: boolean;
  isToxic: boolean;
  flagReason?: string;
  recommendedAction: 'APPROVE' | 'FLAG_FOR_REVIEW' | 'AUTO_REJECT';
  confidence: number;
}

export interface DeduplicationDecision {
  isDuplicate: boolean;
  matchedQuestionId?: string;
  similarityScore: number;
  reason?: string;
}

export interface PostSessionReportDraft {
  executiveSummary: string;
  topThemes: { title: string; description: string; questionExamples: string[] }[];
  unresolvedTopics: { topic: string; significance: string }[];
  actionableFollowUps: string[];
  markdownReport: string;
}

export interface SeriesSpeakerBrief {
  speakerName: string;
  talkTitle: string;
  segmentId: string;
  questionCount: number;
  upvotes: number;
  answeredCount: number;
  questions: { content: string; upvotes: number; status: string }[];
}

export interface SeriesExecutiveReportDraft {
  executiveSummary: string;
  crossCuttingThemes: { title: string; description: string; questionExamples: string[] }[];
  unresolvedTopics: { topic: string; significance: string; speakerName?: string }[];
  actionableFollowUps: string[];
  markdownReport: string;
}

/** Use-case port. Implemented by the Gemini adapter; tests inject a silent stub. */
export interface AiGateway {
  generateTwoLineAnswer(
    questionText: string,
    sessionContext?: string,
    options?: { apiKey?: string | null }
  ): Promise<TwoLineAnswer>;
  moderateQuestion(
    rawQuestion: string,
    sensitivity?: 'STRICT' | 'BALANCED' | 'RELAXED'
  ): Promise<ModerationDecision>;
  checkSemanticDeduplication(
    newQuestion: string,
    existingQuestions: { id: string; content: string }[]
  ): Promise<DeduplicationDecision>;
  generatePostSessionReport(
    sessionTitle: string,
    sessionContext: string,
    questions: {
      content: string;
      upvotes: number;
      aiLine1?: string;
      aiLine2?: string;
      category?: string;
      status?: string;
    }[],
    apiKey?: string | null
  ): Promise<PostSessionReportDraft>;
  generateSeriesExecutiveReport(
    seriesTitle: string,
    seriesContext: string,
    speakers: SeriesSpeakerBrief[],
    apiKey?: string | null
  ): Promise<SeriesExecutiveReportDraft>;
}

/** Null Object: no network, approve everything, empty reports. */
export const silentAiGateway: AiGateway = {
  async generateTwoLineAnswer() {
    return {
      firstLine: '',
      secondLine: '',
      confidenceScore: 0,
      isGroundedOnDeck: false,
    };
  },
  async moderateQuestion() {
    return {
      isSpam: false,
      isToxic: false,
      recommendedAction: 'APPROVE',
      confidence: 0.9,
    };
  },
  async checkSemanticDeduplication() {
    return { isDuplicate: false, similarityScore: 0 };
  },
  async generatePostSessionReport(sessionTitle: string) {
    return {
      executiveSummary: '',
      topThemes: [],
      unresolvedTopics: [],
      actionableFollowUps: [],
      markdownReport: `# ${sessionTitle}`,
    };
  },
  async generateSeriesExecutiveReport(seriesTitle: string) {
    return {
      executiveSummary: '',
      crossCuttingThemes: [],
      unresolvedTopics: [],
      actionableFollowUps: [],
      markdownReport: `# ${seriesTitle}`,
    };
  },
};
