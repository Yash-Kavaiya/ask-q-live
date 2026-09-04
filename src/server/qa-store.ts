import crypto from 'node:crypto';
import {
  Session,
  Question,
  Participant,
  TelemetryMetrics,
  WordFrequency,
  QuestionStatus,
  Series,
  Segment,
  SegmentState,
  UserAccessInfo,
  SeriesReport,
  SpeakerComparison,
  SeriesSettings,
  SeriesParticipant,
  SeriesTelemetry,
  SegmentScore,
  AuditEntry,
  PostSessionReport,
} from '../app/models/qa.models.js';
import {
  generateTwoLineAnswer,
  moderateQuestion,
  checkSemanticDeduplication,
  generateSeriesExecutiveReport,
  generatePostSessionReport,
} from './gemini.service.js';
import { timingSafeCompare } from './auth.js';

// Compute text sentiment polarity score (-1.0 to 1.0)
export function computeTextSentiment(text: string, isSpam = false, isToxic = false): number {
  if (isSpam || isToxic) return -0.85;
  const lower = text.toLowerCase();
  const positiveWords = [
    'great', 'awesome', 'love', 'best', 'excellent', 'fast', 'seamless', 'good',
    'benefit', 'helpful', 'excited', 'impressive', 'innovative', 'perfect', 'clear',
    'useful', 'reliable', 'scalable', 'secure', 'efficient', 'streamline', 'thank',
    'congratulations', 'brilliant', 'wonderful', 'super'
  ];
  const negativeWords = [
    'broken', 'fail', 'bad', 'terrible', 'slow', 'wrong', 'issue', 'bug',
    'crash', 'problem', 'difficult', 'expensive', 'risk', 'flaw', 'confusing',
    'cannot', 'error', 'bottleneck', 'downtime', 'vulnerability', 'spam', 'hate'
  ];

  let score = 0.35; // standard curious, engaged baseline for Q&A questions
  for (const w of positiveWords) {
    if (lower.includes(w)) score += 0.22;
  }
  for (const w of negativeWords) {
    if (lower.includes(w)) score -= 0.38;
  }
  return Math.max(-1, Math.min(1, Math.round(score * 100) / 100));
}

// Common English stopwords for word cloud frequency extraction
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could', 'couldn\'t',
  'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have',
  'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s',
  'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll',
  'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself',
  'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll',
  'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t',
  'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who',
  'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you',
  'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  'question', 'questions', 'please', 'tell', 'like', 'know', 'just', 'much', 'many',
  'also', 'get', 'will', 'make', 'use', 'using', 'used', 'need', 'want', 'work', 'works',
]);

const UNAMBIGUOUS_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export class QaStore {
  private sessions = new Map<string, Session>(); // joinCode -> Session
  private series = new Map<string, Series>(); // seriesCode -> Series
  private questions = new Map<string, Question>(); // questionId -> Question
  private sessionQuestions = new Map<string, string[]>(); // joinCode -> questionId[]
  private upvoteLedger = new Set<string>(); // `${questionId}:${clientFingerprint}`
  private participants = new Map<string, Map<string, Participant>>(); // joinCode -> (fingerprint -> Participant)
  private seriesParticipants = new Map<string, Map<string, SeriesParticipant>>(); // seriesCode -> (fingerprint -> SeriesParticipant)
  private submissionRateLimits = new Map<string, number[]>(); // `${key}:${fingerprint}` -> timestamps[]
  private auditLogs = new Map<string, AuditEntry[]>(); // seriesCode -> AuditEntry[]
  private cachedSegmentReports = new Map<string, PostSessionReport>(); // segmentId -> PostSessionReport

  constructor(seed = false) {
    if (seed) {
      this.seedDefaultSessions();
    }
  }

  public isCodeAvailable(code: string): boolean {
    const clean = code.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    if (!clean || clean.length < 3) return false;
    return !this.sessions.has(clean) && !this.series.has(clean);
  }

  /**
   * Helper to generate unambiguous 6-character code
   */
  public generateUniqueCode(prefix = ''): string {
    let code = '';
    let attempts = 0;
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        const idx = Math.floor(Math.random() * UNAMBIGUOUS_CHARSET.length);
        code += UNAMBIGUOUS_CHARSET[idx];
      }
      if (prefix) {
        code = (prefix + code).substring(0, 12);
      }
      attempts++;
    } while ((this.sessions.has(code) || this.series.has(code)) && attempts < 100);
    return code;
  }

  // ==========================================
  // Session Series Management (Multi-Speaker)
  // ==========================================

  public getSeries(code: string): Series | undefined {
    return this.series.get(code.toUpperCase());
  }

  public getAllSeries(): Series[] {
    return Array.from(this.series.values());
  }

  public getActiveLiveRoom(): { series?: Series; session?: Session } | null {
    const allSeries = Array.from(this.series.values());
    const liveSeries = allSeries.find(s => s.state === 'LIVE') || this.series.get('NEXT26') || allSeries[0];
    if (liveSeries) {
      return { series: liveSeries };
    }
    const allSessions = Array.from(this.sessions.values());
    const liveSession = allSessions.find(s => s.isActive) || allSessions[0];
    if (liveSession) {
      return { session: liveSession };
    }
    return null;
  }

  /**
   * Creates a full Session Series with implicit General Lobby and backing Sessions
   */
  public createSeries(params: {
    title: string;
    description?: string;
    contextData?: string;
    seriesContextData?: string;
    startDate?: string;
    date?: string;
    timezone?: string;
    autoAdvance?: boolean;
    customSeriesCode?: string;
    customJoinCode?: string;
    settings?: Partial<SeriesSettings>;
    segments?: Partial<Segment>[];
  }): Series {
    let seriesCode = (params.customSeriesCode || params.customJoinCode || '')
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9_-]/g, '');

    if (seriesCode) {
      if (this.series.has(seriesCode) || this.sessions.has(seriesCode)) {
        throw new Error(`Custom room code "${seriesCode}" is already in use by another session or workshop. Please choose a different code or use auto-generation.`);
      }
    } else {
      seriesCode = this.generateUniqueCode();
    }

    const seriesId = 'series-' + Math.random().toString(36).substring(2, 9);
    const organizerToken = 'org_' + crypto.randomBytes(12).toString('hex');
    const nowIso = new Date().toISOString();

    const defaultSettings: SeriesSettings = {
      autoAdvance: params.autoAdvance ?? params.settings?.autoAdvance ?? false,
      graceWindowMinutes: params.settings?.graceWindowMinutes ?? 10,
      allowPreSubmit: params.settings?.allowPreSubmit ?? true,
      allowSpeakerSelfEnd: params.settings?.allowSpeakerSelfEnd ?? false,
      autoParkUnanswered: params.settings?.autoParkUnanswered ?? false,
      cascadeScheduleShift: params.settings?.cascadeScheduleShift ?? true,
      defaultModerationSensitivity: params.settings?.defaultModerationSensitivity ?? 'BALANCED',
      allowAnonymous: params.settings?.allowAnonymous ?? true,
      maxQuestionsPerMinute: params.settings?.maxQuestionsPerMinute ?? 5,
      maxQuestionsPerSeriesPerHour: params.settings?.maxQuestionsPerSeriesPerHour ?? 30,
      showCrossSegmentSimilarHint: params.settings?.showCrossSegmentSimilarHint ?? true,
    };

    // Create implicit General Lobby segment
    const generalSegment: Segment = {
      id: 'general',
      seriesId,
      title: 'General Workshop Lobby & Community Q&A',
      speakerName: 'Event Organizers',
      type: 'LOBBY',
      status: 'LIVE',
      state: 'LIVE',
      startTime: '08:30',
      scheduledStart: nowIso,
      scheduledDurationMinutes: 360,
      durationMinutes: 360,
      actualStartTime: nowIso,
      actualStart: nowIso,
      order: 0,
      adminToken: organizerToken,
      graceWindowMinutes: 60,
      categories: ['General', 'Logistics', 'Feedback', 'Sponsors'],
      groundingContext: params.contextData || params.seriesContextData || 'General workshop inquiries and event logistics.',
      contextData: params.contextData || params.seriesContextData || 'General workshop inquiries and event logistics.',
    };

    const segments: Segment[] = [generalSegment];
    const segmentIds: string[] = ['general'];

    // Add user provided segments if any
    const rawSegments = params.segments || [];
    rawSegments.forEach((seg, idx) => {
      const segOrder = idx + 1;
      const segId = seg.id || `seg-${segOrder}-${Math.random().toString(36).substring(2, 7)}`;
      const segToken = seg.adminToken || ('spk_' + crypto.randomBytes(8).toString('hex'));
      const segDuration = seg.durationMinutes || seg.scheduledDurationMinutes || 45;

      const createdSeg: Segment = {
        id: segId,
        seriesId,
        title: seg.title || `Segment ${segOrder}`,
        speakerName: seg.speakerName || 'Featured Speaker',
        speakerRole: seg.speakerRole,
        speakerBio: seg.speakerBio,
        speakerOrg: seg.speakerOrg,
        speakerAvatar: seg.speakerAvatar,
        speaker: seg.speaker || {
          name: seg.speakerName || 'Featured Speaker',
          title: seg.speakerRole,
          bio: seg.speakerBio,
          org: seg.speakerOrg,
          avatarUrl: seg.speakerAvatar,
        },
        talkTitle: seg.talkTitle || seg.title || `Talk ${segOrder}`,
        type: seg.type || 'TALK',
        status: (seg.status as SegmentState) || (seg.state as SegmentState) || 'SCHEDULED',
        state: (seg.state as SegmentState) || (seg.status as SegmentState) || 'SCHEDULED',
        startTime: seg.startTime || '09:00',
        scheduledStart: seg.scheduledStart || seg.startTime || nowIso,
        scheduledDurationMinutes: segDuration,
        durationMinutes: segDuration,
        actualStartTime: seg.actualStartTime,
        actualEndTime: seg.actualEndTime,
        actualStart: seg.actualStart,
        actualEnd: seg.actualEnd,
        groundingContext: seg.groundingContext || seg.contextData || '',
        contextData: seg.contextData || seg.groundingContext || '',
        categories: seg.categories && seg.categories.length > 0 ? seg.categories : ['General'],
        adminToken: segToken,
        order: segOrder,
        graceWindowMinutes: seg.graceWindowMinutes ?? defaultSettings.graceWindowMinutes,
        moderationSensitivity: seg.moderationSensitivity || defaultSettings.defaultModerationSensitivity,
        autoAiAnswers: seg.autoAiAnswers ?? true,
      };

      segments.push(createdSeg);
      segmentIds.push(segId);

      // Backing Session for Segment
      const backingJoinCode = `${seriesCode}-S${segOrder}`;
      const backingSession: Session = {
        id: 'session-' + segId,
        joinCode: backingJoinCode,
        adminToken: segToken,
        title: createdSeg.title,
        description: createdSeg.speakerBio,
        contextData: createdSeg.groundingContext,
        isActive: createdSeg.state === 'LIVE',
        createdAt: nowIso,
        categories: createdSeg.categories,
        seriesId,
        seriesCode,
        order: segOrder,
        segmentType: createdSeg.type,
        state: createdSeg.state,
        speaker: createdSeg.speaker,
        talkTitle: createdSeg.talkTitle,
        scheduledStart: createdSeg.scheduledStart,
        durationMinutes: createdSeg.durationMinutes,
        actualStart: createdSeg.actualStart,
        actualEnd: createdSeg.actualEnd,
        segmentId: segId,
        settings: {
          moderationSensitivity: createdSeg.moderationSensitivity || defaultSettings.defaultModerationSensitivity,
          autoAiAnswers: createdSeg.autoAiAnswers ?? true,
          allowAnonymous: defaultSettings.allowAnonymous,
          maxQuestionsPerMinute: defaultSettings.maxQuestionsPerMinute,
        },
      };
      this.sessions.set(backingJoinCode, backingSession);
      this.sessionQuestions.set(backingJoinCode, []);
    });

    const newSeries: Series = {
      id: seriesId,
      seriesCode,
      joinCode: seriesCode,
      organizerToken,
      title: params.title || 'Interactive Workshop Series',
      description: params.description,
      contextData: params.contextData || params.seriesContextData,
      seriesContextData: params.seriesContextData || params.contextData,
      startDate: params.startDate || params.date || nowIso.split('T')[0],
      date: params.date || params.startDate || nowIso.split('T')[0],
      timezone: params.timezone || 'UTC',
      state: 'SCHEDULED',
      segmentIds,
      liveSegmentId: 'general',
      activeSegmentId: 'general',
      settings: defaultSettings,
      segments,
      isActive: true,
      revision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.series.set(seriesCode, newSeries);
    this.sessionQuestions.set(seriesCode, []);
    this.participants.set(seriesCode, new Map());
    this.seriesParticipants.set(seriesCode, new Map());
    this.auditLogs.set(seriesCode, []);

    // Create synthetic root session for legacy join
    const rootSession: Session = {
      id: 'session-' + seriesId,
      joinCode: seriesCode,
      adminToken: organizerToken,
      title: newSeries.title,
      description: newSeries.description,
      contextData: newSeries.contextData,
      isActive: true,
      createdAt: nowIso,
      categories: ['General', 'Architecture', 'AI & ML'],
      seriesId,
      seriesCode,
      segmentId: 'general',
      settings: {
        moderationSensitivity: defaultSettings.defaultModerationSensitivity,
        autoAiAnswers: true,
        allowAnonymous: defaultSettings.allowAnonymous,
        maxQuestionsPerMinute: defaultSettings.maxQuestionsPerMinute,
      },
    };
    this.sessions.set(seriesCode, rootSession);

    this.logAudit({
      seriesId,
      actorRole: 'organizer',
      actorRef: 'system',
      action: 'SERIES_CREATED',
      targetId: seriesId,
      meta: { seriesCode, title: newSeries.title },
    });

    return newSeries;
  }

  /**
   * Verifies bearer tokens and returns role and scope info
   */
  public verifyToken(joinCode: string, token: string | undefined): UserAccessInfo {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    const session = this.getSession(code);

    if (!token) {
      return { role: 'attendee', scope: [] };
    }

    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();

    // Check organizer token on series
    if (series && timingSafeCompare(series.organizerToken, cleanToken)) {
      return { role: 'organizer', scope: ['*'], token: cleanToken };
    }
    // Check organizer token on session
    if (session && timingSafeCompare(session.adminToken, cleanToken)) {
      return { role: 'organizer', scope: ['*'], token: cleanToken };
    }

    // Check segment speaker admin token
    if (series && series.segments) {
      const matchSeg = series.segments.find(s => s.adminToken && timingSafeCompare(s.adminToken, cleanToken));
      if (matchSeg) {
        return {
          role: 'speaker',
          scope: [matchSeg.id],
          segmentId: matchSeg.id,
          token: cleanToken,
        };
      }
    }

    return { role: 'attendee', scope: [] };
  }

  /**
   * Adds a new segment to a series with atomic backing session registration
   */
  public addSegment(
    joinCode: string,
    data: Partial<Segment>,
    token?: string
  ): Segment | null {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return null;

    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer') return null;

    const order = series.segments.length;
    const segId = data.id || `seg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const adminToken = 'spk_' + crypto.randomBytes(8).toString('hex');
    const nowIso = new Date().toISOString();
    const duration = data.durationMinutes || data.scheduledDurationMinutes || 45;

    const newSeg: Segment = {
      id: segId,
      seriesId: series.id,
      title: data.title || `Segment ${order}`,
      speakerName: data.speakerName || 'Speaker',
      speakerRole: data.speakerRole,
      speakerBio: data.speakerBio,
      speakerOrg: data.speakerOrg,
      speakerAvatar: data.speakerAvatar,
      speaker: data.speaker || {
        name: data.speakerName || 'Speaker',
        title: data.speakerRole,
        bio: data.speakerBio,
      },
      talkTitle: data.talkTitle || data.title || `Talk ${order}`,
      type: data.type || 'TALK',
      status: 'SCHEDULED',
      state: 'SCHEDULED',
      startTime: data.startTime || '13:00',
      scheduledStart: data.scheduledStart || data.startTime || nowIso,
      scheduledDurationMinutes: duration,
      durationMinutes: duration,
      groundingContext: data.groundingContext || data.contextData || '',
      contextData: data.contextData || data.groundingContext || '',
      categories: data.categories || ['General'],
      adminToken,
      order,
      graceWindowMinutes: data.graceWindowMinutes ?? series.settings.graceWindowMinutes,
      moderationSensitivity: data.moderationSensitivity || series.settings.defaultModerationSensitivity,
      autoAiAnswers: data.autoAiAnswers ?? true,
    };

    series.segments.push(newSeg);
    series.segmentIds.push(segId);
    series.revision = (series.revision || 1) + 1;
    series.updatedAt = nowIso;

    // Create backing Session
    const backingJoinCode = `${code}-S${order}`;
    const backingSession: Session = {
      id: 'session-' + segId,
      joinCode: backingJoinCode,
      adminToken,
      title: newSeg.title,
      description: newSeg.speakerBio,
      contextData: newSeg.groundingContext,
      isActive: false,
      createdAt: nowIso,
      categories: newSeg.categories,
      seriesId: series.id,
      seriesCode: code,
      order,
      segmentType: newSeg.type,
      state: 'SCHEDULED',
      speaker: newSeg.speaker,
      talkTitle: newSeg.talkTitle,
      scheduledStart: newSeg.scheduledStart,
      durationMinutes: newSeg.durationMinutes,
      segmentId: segId,
      settings: {
        moderationSensitivity: newSeg.moderationSensitivity || series.settings.defaultModerationSensitivity,
        autoAiAnswers: newSeg.autoAiAnswers ?? true,
        allowAnonymous: series.settings.allowAnonymous,
        maxQuestionsPerMinute: series.settings.maxQuestionsPerMinute,
      },
    };
    this.sessions.set(backingJoinCode, backingSession);
    this.sessionQuestions.set(backingJoinCode, []);

    this.logAudit({
      seriesId: series.id,
      segmentId: segId,
      actorRole: auth.role,
      actorRef: auth.token || 'admin',
      action: 'SEGMENT_ADDED',
      targetId: segId,
      meta: { title: newSeg.title, order },
    });

    return newSeg;
  }

  /**
   * Segment State Machine: Starts a segment atomically, enforcing the Single-Live invariant (FR-B3)
   */
  public startSegment(
    joinCode: string,
    segmentId: string,
    token?: string
  ): { success: boolean; status?: number; error?: string; series?: Series } {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return { success: false, status: 404, error: 'Series not found' };

    const auth = this.verifyToken(code, token);
    const isOrganizer = auth.role === 'organizer';
    const isSpeakerAllowed = auth.role === 'speaker' && auth.scope.includes(segmentId) && series.settings.allowSpeakerSelfEnd;

    if (!isOrganizer && !isSpeakerAllowed) {
      return { success: false, status: 403, error: 'Unauthorized to start this segment' };
    }

    const targetSeg = series.segments.find(s => s.id === segmentId);
    if (!targetSeg) return { success: false, status: 404, error: 'Segment not found' };

    // Check valid state transition
    const currentState = targetSeg.state || targetSeg.status;
    if (currentState === 'LIVE') {
      return { success: true, series }; // Already live, idempotent success
    }
    if (currentState === 'ENDED' || currentState === 'SKIPPED') {
      return {
        success: false,
        status: 409,
        error: `Conflict: Cannot start segment currently in terminal state ${currentState}`,
      };
    }

    const nowIso = new Date().toISOString();

    // Enforce SINGLE-LIVE invariant: Transition any other currently LIVE segment to ENDED
    for (const seg of series.segments) {
      if ((seg.status === 'LIVE' || seg.state === 'LIVE') && seg.id !== segmentId && seg.id !== 'general') {
        seg.status = 'ENDED';
        seg.state = 'ENDED';
        seg.actualEndTime = nowIso;
        seg.actualEnd = nowIso;

        // Update backing session
        const backingCode = `${code}-S${seg.order}`;
        const backingSess = this.sessions.get(backingCode);
        if (backingSess) {
          backingSess.state = 'ENDED';
          backingSess.actualEnd = nowIso;
          backingSess.isActive = false;
        }
      }
    }

    // Set target to LIVE
    targetSeg.status = 'LIVE';
    targetSeg.state = 'LIVE';
    if (!targetSeg.actualStartTime && !targetSeg.actualStart) {
      targetSeg.actualStartTime = nowIso;
      targetSeg.actualStart = nowIso;
    }

    series.liveSegmentId = segmentId;
    series.activeSegmentId = segmentId;
    series.state = 'LIVE';
    series.revision = (series.revision || 1) + 1;
    series.updatedAt = nowIso;

    // Sync root session
    const rootSession = this.getSession(code);
    if (rootSession) {
      rootSession.title = targetSeg.title;
      rootSession.contextData = targetSeg.groundingContext || targetSeg.contextData || series.contextData;
      rootSession.categories = targetSeg.categories;
      rootSession.segmentId = targetSeg.id;
    }

    // Sync backing session
    const targetBackingCode = `${code}-S${targetSeg.order}`;
    const targetBackingSess = this.sessions.get(targetBackingCode);
    if (targetBackingSess) {
      targetBackingSess.state = 'LIVE';
      targetBackingSess.isActive = true;
      targetBackingSess.actualStart = targetSeg.actualStart;
    }

    this.logAudit({
      seriesId: series.id,
      segmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'speaker',
      action: 'SEGMENT_STARTED',
      targetId: segmentId,
      meta: { title: targetSeg.title },
    });

    return { success: true, series };
  }

  /**
   * Segment State Machine: Ends a segment, starting its grace window
   */
  public endSegment(
    joinCode: string,
    segmentId: string,
    token?: string
  ): { success: boolean; status?: number; error?: string; series?: Series } {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return { success: false, status: 404, error: 'Series not found' };

    const auth = this.verifyToken(code, token);
    const isOrganizer = auth.role === 'organizer';
    const isSpeakerAllowed = auth.role === 'speaker' && auth.scope.includes(segmentId);

    if (!isOrganizer && !isSpeakerAllowed) {
      return { success: false, status: 403, error: 'Unauthorized to end this segment' };
    }

    const targetSeg = series.segments.find(s => s.id === segmentId);
    if (!targetSeg) return { success: false, status: 404, error: 'Segment not found' };

    const currentState = targetSeg.state || targetSeg.status;
    if (currentState === 'ENDED') {
      return { success: true, series }; // Idempotent
    }
    if (currentState !== 'LIVE' && currentState !== 'PAUSED') {
      return {
        success: false,
        status: 409,
        error: `Conflict: Cannot end segment in state ${currentState}`,
      };
    }

    const nowIso = new Date().toISOString();
    targetSeg.status = 'ENDED';
    targetSeg.state = 'ENDED';
    targetSeg.actualEndTime = nowIso;
    targetSeg.actualEnd = nowIso;

    if (series.liveSegmentId === segmentId || series.activeSegmentId === segmentId) {
      series.liveSegmentId = 'general';
      series.activeSegmentId = 'general';
    }

    series.revision = (series.revision || 1) + 1;
    series.updatedAt = nowIso;

    // Sync backing session
    const backingCode = `${code}-S${targetSeg.order}`;
    const backingSess = this.sessions.get(backingCode);
    if (backingSess) {
      backingSess.state = 'ENDED';
      backingSess.actualEnd = nowIso;
      backingSess.isActive = false;
    }

    this.logAudit({
      seriesId: series.id,
      segmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'speaker',
      action: 'SEGMENT_ENDED',
      targetId: segmentId,
      meta: { title: targetSeg.title, graceWindowMinutes: targetSeg.graceWindowMinutes },
    });

    return { success: true, series };
  }

  /**
   * Segment State Machine: Pauses or resumes a LIVE segment
   */
  public pauseSegment(
    joinCode: string,
    segmentId: string,
    token?: string
  ): { success: boolean; status?: number; error?: string; series?: Series } {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return { success: false, status: 404, error: 'Series not found' };

    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer') {
      return { success: false, status: 403, error: 'Organizer permission required to pause segment' };
    }

    const targetSeg = series.segments.find(s => s.id === segmentId);
    if (!targetSeg) return { success: false, status: 404, error: 'Segment not found' };

    const currentState = targetSeg.state || targetSeg.status;
    const nowIso = new Date().toISOString();

    if (currentState === 'LIVE') {
      targetSeg.status = 'PAUSED';
      targetSeg.state = 'PAUSED';
    } else if (currentState === 'PAUSED') {
      targetSeg.status = 'LIVE';
      targetSeg.state = 'LIVE';
    } else {
      return {
        success: false,
        status: 409,
        error: `Conflict: Cannot pause/resume segment in state ${currentState}`,
      };
    }

    series.revision = (series.revision || 1) + 1;
    series.updatedAt = nowIso;

    this.logAudit({
      seriesId: series.id,
      segmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'organizer',
      action: targetSeg.state === 'PAUSED' ? 'SEGMENT_PAUSED' : 'SEGMENT_RESUMED',
      targetId: segmentId,
    });

    return { success: true, series };
  }

  /**
   * Segment State Machine: Skips an unstarted segment (SCHEDULED -> SKIPPED)
   */
  public skipSegment(
    joinCode: string,
    segmentId: string,
    token?: string
  ): { success: boolean; status?: number; error?: string; series?: Series } {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return { success: false, status: 404, error: 'Series not found' };

    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer') {
      return { success: false, status: 403, error: 'Organizer permission required to skip segment' };
    }

    const targetSeg = series.segments.find(s => s.id === segmentId);
    if (!targetSeg) return { success: false, status: 404, error: 'Segment not found' };

    const currentState = targetSeg.state || targetSeg.status;
    if (currentState !== 'SCHEDULED') {
      return {
        success: false,
        status: 409,
        error: `Conflict: Only SCHEDULED segments can be skipped (current: ${currentState})`,
      };
    }

    targetSeg.status = 'SKIPPED';
    targetSeg.state = 'SKIPPED';
    series.revision = (series.revision || 1) + 1;
    series.updatedAt = new Date().toISOString();

    this.logAudit({
      seriesId: series.id,
      segmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'organizer',
      action: 'SEGMENT_SKIPPED',
      targetId: segmentId,
    });

    return { success: true, series };
  }

  /**
   * Extends a segment duration with optional cascading schedule shift (FR-B6)
   */
  public extendSegment(
    joinCode: string,
    segmentId: string,
    minutes: number,
    token?: string
  ): { success: boolean; status?: number; error?: string; series?: Series } {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return { success: false, status: 404, error: 'Series not found' };

    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer') {
      return { success: false, status: 403, error: 'Organizer authorization required' };
    }

    const targetIndex = series.segments.findIndex(s => s.id === segmentId);
    if (targetIndex === -1) return { success: false, status: 404, error: 'Segment not found' };

    const targetSeg = series.segments[targetIndex];
    targetSeg.scheduledDurationMinutes = (targetSeg.scheduledDurationMinutes || 45) + minutes;
    targetSeg.durationMinutes = (targetSeg.durationMinutes || targetSeg.scheduledDurationMinutes) + minutes;

    // Cascade shift if enabled
    if (series.settings.cascadeScheduleShift) {
      for (let i = targetIndex + 1; i < series.segments.length; i++) {
        const nextSeg = series.segments[i];
        if (nextSeg.scheduledStart && nextSeg.scheduledStart.includes('T')) {
          const shifted = new Date(new Date(nextSeg.scheduledStart).getTime() + minutes * 60000);
          nextSeg.scheduledStart = shifted.toISOString();
        }
      }
    }

    series.revision = (series.revision || 1) + 1;
    series.updatedAt = new Date().toISOString();

    this.logAudit({
      seriesId: series.id,
      segmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'organizer',
      action: 'SEGMENT_EXTENDED',
      targetId: segmentId,
      meta: { extensionMinutes: minutes },
    });

    return { success: true, series };
  }

  /**
   * Reorders segments, rejecting if a LIVE or ENDED segment is moved (FR-B4)
   */
  public reorderSegments(
    joinCode: string,
    segmentIds: string[],
    token?: string
  ): { success: boolean; status?: number; error?: string } {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return { success: false, status: 404, error: 'Series not found' };

    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer') {
      return { success: false, status: 403, error: 'Organizer permission required to reorder segments' };
    }

    // Check if any LIVE or ENDED segment moved out of place
    const existingActiveOrEnded = series.segments.filter(s => s.state === 'LIVE' || s.state === 'ENDED' || s.status === 'LIVE' || s.status === 'ENDED');
    for (const lockedSeg of existingActiveOrEnded) {
      const originalIdx = series.segments.findIndex(s => s.id === lockedSeg.id);
      const newIdx = segmentIds.indexOf(lockedSeg.id);
      if (newIdx !== -1 && newIdx !== originalIdx) {
        return {
          success: false,
          status: 409,
          error: `Conflict: Cannot reorder segment "${lockedSeg.title}" which is currently ${lockedSeg.state || lockedSeg.status}`,
        };
      }
    }

    const ordered: Segment[] = [];
    segmentIds.forEach((id, idx) => {
      const seg = series.segments.find(s => s.id === id);
      if (seg) {
        seg.order = idx + 1;
        ordered.push(seg);
      }
    });

    // Append any unmentioned
    series.segments.forEach(s => {
      if (!ordered.includes(s)) {
        s.order = ordered.length + 1;
        ordered.push(s);
      }
    });

    series.segments = ordered;
    series.segmentIds = ordered.map(s => s.id);
    series.revision = (series.revision || 1) + 1;
    series.updatedAt = new Date().toISOString();

    this.logAudit({
      seriesId: series.id,
      actorRole: auth.role,
      actorRef: auth.token || 'organizer',
      action: 'SEGMENTS_REORDERED',
      meta: { newOrder: series.segmentIds },
    });

    return { success: true };
  }

  /**
   * Deletes a segment with FR-B5 guard (cannot delete if it holds questions)
   */
  public deleteSegment(
    joinCode: string,
    segmentId: string,
    token?: string
  ): { success: boolean; status?: number; error?: string } {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return { success: false, status: 404, error: 'Series not found' };

    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer') {
      return { success: false, status: 403, error: 'Organizer permission required' };
    }

    if (segmentId === 'general') {
      return { success: false, status: 400, error: 'Cannot delete the implicit general lobby segment' };
    }

    // FR-B5 Guard: Reject if questions exist
    const segQuestions = this.getQuestions(code).filter(q => q.segmentId === segmentId);
    if (segQuestions.length > 0) {
      return {
        success: false,
        status: 409,
        error: `Conflict: Segment has ${segQuestions.length} questions. Move questions first or skip the segment.`,
      };
    }

    series.segments = series.segments.filter(s => s.id !== segmentId);
    series.segmentIds = series.segmentIds.filter(id => id !== segmentId);
    series.revision = (series.revision || 1) + 1;
    series.updatedAt = new Date().toISOString();

    this.logAudit({
      seriesId: series.id,
      segmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'organizer',
      action: 'SEGMENT_DELETED',
      targetId: segmentId,
    });

    return { success: true };
  }

  /**
   * Resolves question target segment per FR-D2 and FR-D3
   */
  public resolveQuestionTarget(
    seriesCode: string,
    requestedSegmentId?: string
  ): { targetSegmentId: string; targetedExplicitly: boolean; targetSegment?: Segment } {
    const series = this.getSeries(seriesCode);
    if (!series) {
      return { targetSegmentId: 'general', targetedExplicitly: false };
    }

    const isAccepting = (seg: Segment): boolean => {
      const state = seg.state || seg.status;
      if (state === 'LIVE') return true;
      if (seg.id === 'general' || seg.type === 'LOBBY') return series.state !== 'ENDED';
      if (state === 'SCHEDULED' && series.settings.allowPreSubmit) return true;
      if (state === 'ENDED' && (seg.actualEndTime || seg.actualEnd)) {
        const endedMs = new Date(seg.actualEndTime || seg.actualEnd!).getTime();
        const graceMs = (seg.graceWindowMinutes ?? series.settings.graceWindowMinutes) * 60000;
        return Date.now() - endedMs <= graceMs;
      }
      return false;
    };

    // 1. Explicitly chosen segment
    if (requestedSegmentId && requestedSegmentId !== 'auto') {
      const explicitSeg = series.segments.find(s => s.id === requestedSegmentId);
      if (explicitSeg && isAccepting(explicitSeg)) {
        return { targetSegmentId: explicitSeg.id, targetedExplicitly: true, targetSegment: explicitSeg };
      }
    }

    // 2. LIVE segment
    if (series.liveSegmentId && series.liveSegmentId !== 'general') {
      const liveSeg = series.segments.find(s => s.id === series.liveSegmentId);
      if (liveSeg && isAccepting(liveSeg)) {
        return { targetSegmentId: liveSeg.id, targetedExplicitly: false, targetSegment: liveSeg };
      }
    }

    // 3. Most recently ENDED segment inside its grace window
    const endedSegments = series.segments
      .filter(s => (s.state === 'ENDED' || s.status === 'ENDED') && (s.actualEndTime || s.actualEnd))
      .sort((a, b) => {
        const tA = new Date(a.actualEndTime || a.actualEnd!).getTime();
        const tB = new Date(b.actualEndTime || b.actualEnd!).getTime();
        return tB - tA;
      });

    for (const endedSeg of endedSegments) {
      if (isAccepting(endedSeg)) {
        return { targetSegmentId: endedSeg.id, targetedExplicitly: false, targetSegment: endedSeg };
      }
    }

    // 4. Fallback to General lobby
    const generalSeg = series.segments.find(s => s.id === 'general') || series.segments[0];
    return {
      targetSegmentId: generalSeg?.id || 'general',
      targetedExplicitly: false,
      targetSegment: generalSeg,
    };
  }

  // ==========================================
  // Question Lifecycle & Grounded Gemini Processing
  // ==========================================

  public async submitQuestion(params: {
    joinCode: string;
    clientFingerprint: string;
    authorName: string;
    isAnonymous: boolean;
    content: string;
    category?: string;
    segmentId?: string;
  }): Promise<{
    question?: Question;
    deduplicatedWith?: Question;
    error?: string;
    moderated: boolean;
    resolvedSegmentId?: string;
  }> {
    const code = params.joinCode.toUpperCase();
    const session = this.getSession(code);
    const series = this.getSeries(code);

    if (!session && !series) {
      return { error: 'Session room not found', moderated: false };
    }

    // Check participant ban state
    const isBanned = this.isParticipantBanned(code, params.clientFingerprint);
    if (isBanned) {
      return { error: 'Your account has been restricted from posting in this session.', moderated: false };
    }

    // NFR-1: Cap questions per series (default 5000)
    const currentQuestions = this.getQuestions(code);
    const maxSeriesQuestions = 5000;
    if (currentQuestions.length >= maxSeriesQuestions) {
      return {
        error: 'Event capacity reached. No additional questions can be accepted at this time.',
        moderated: false,
      };
    }

    // Target segment resolution (FR-D2 / FR-D3)
    let targetSegment: Segment | undefined;
    let targetedExplicitly = false;

    if (series) {
      const resolution = this.resolveQuestionTarget(code, params.segmentId);
      targetSegment = resolution.targetSegment;
      targetedExplicitly = resolution.targetedExplicitly;
    }

    // Rate limiting: Per-segment (60s) AND Series-level (1 hr) with NFR-1 pruning
    const now = Date.now();
    const segmentKey = `${code}:${targetSegment?.id || 'default'}:${params.clientFingerprint}`;
    const seriesKey = `${code}:hourly:${params.clientFingerprint}`;

    // 1. Prune and check segment rate limit
    const segTimestamps = (this.submissionRateLimits.get(segmentKey) || []).filter(t => now - t < 60000);
    const maxPerMin = targetSegment?.moderationSensitivity ? 5 : (session?.settings.maxQuestionsPerMinute || series?.settings.maxQuestionsPerMinute || 5);
    if (segTimestamps.length >= maxPerMin) {
      return {
        error: `Submission velocity limit reached for this speaker. Please wait a moment before submitting again.`,
        moderated: false,
      };
    }

    // 2. Prune and check series hourly rate limit
    const seriesTimestamps = (this.submissionRateLimits.get(seriesKey) || []).filter(t => now - t < 3600000);
    const maxPerHour = series?.settings.maxQuestionsPerSeriesPerHour || 30;
    if (seriesTimestamps.length >= maxPerHour) {
      return {
        error: `Event-level submission limit exceeded (${maxPerHour}/hr). Please wait before posting more inquiries.`,
        moderated: false,
      };
    }

    segTimestamps.push(now);
    seriesTimestamps.push(now);
    this.submissionRateLimits.set(segmentKey, segTimestamps);
    this.submissionRateLimits.set(seriesKey, seriesTimestamps);

    // Automated Moderation via Gemini
    const modSensitivity = targetSegment?.moderationSensitivity || session?.settings.moderationSensitivity || 'BALANCED';
    const moderation = await moderateQuestion(params.content, modSensitivity);

    let status: QuestionStatus = 'APPROVED';
    if (moderation.recommendedAction === 'AUTO_REJECT') {
      status = 'REJECTED';
    } else if (moderation.recommendedAction === 'FLAG_FOR_REVIEW' || moderation.isSpam || moderation.isToxic) {
      status = 'PENDING_REVIEW';
    }

    // Semantic Deduplication against existing questions in the SAME segment
    if (status === 'APPROVED') {
      const existingApproved = this.getQuestions(code).filter(
        q => (q.status === 'APPROVED' || q.status === 'ANSWERED' || q.status === 'ANSWERING') &&
             (!targetSegment || q.segmentId === targetSegment.id)
      );

      const dedupeResult = await checkSemanticDeduplication(params.content, existingApproved);
      if (dedupeResult.isDuplicate && dedupeResult.matchedQuestionId) {
        const parentQuestion = this.questions.get(dedupeResult.matchedQuestionId);
        if (parentQuestion) {
          parentQuestion.upvotes += 1;
          parentQuestion.clusterCount = (parentQuestion.clusterCount || 0) + 1;
          this.upvoteLedger.add(`${parentQuestion.id}:${params.clientFingerprint}`);

          return {
            deduplicatedWith: parentQuestion,
            moderated: true,
            resolvedSegmentId: targetSegment?.id,
          };
        }
      }
    }

    const sentimentScore = computeTextSentiment(params.content, moderation.isSpam, moderation.isToxic);
    const newQuestionId = 'q-' + Math.random().toString(36).substring(2, 9);
    const nowIso = new Date().toISOString();

    const newQuestion: Question = {
      id: newQuestionId,
      sessionId: session?.id || series?.id || code,
      seriesId: series?.id,
      segmentId: targetSegment?.id,
      segmentTitle: targetSegment?.title,
      speakerName: targetSegment?.speakerName,
      targetedExplicitly,
      clientFingerprint: params.clientFingerprint,
      authorName: params.isAnonymous ? 'Anonymous' : (params.authorName || 'Attendee'),
      isAnonymous: params.isAnonymous,
      content: params.content.trim(),
      category: params.category || targetSegment?.categories[0] || 'General',
      upvotes: 1, // Author initial upvote
      isSpam: moderation.isSpam,
      spamScore: moderation.confidence,
      flagReason: moderation.flagReason,
      status,
      sentimentScore,
      aiStatus: 'IDLE',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.questions.set(newQuestionId, newQuestion);
    if (!this.sessionQuestions.has(code)) {
      this.sessionQuestions.set(code, []);
    }
    this.sessionQuestions.get(code)!.push(newQuestionId);
    this.upvoteLedger.add(`${newQuestionId}:${params.clientFingerprint}`);

    // Update participant counts
    this.recordParticipantQuestion(code, params.clientFingerprint, params.authorName, targetSegment?.id);

    // Grounded Gemini AI Two-Line Answer (FR-E1 / FR-E2)
    const autoAi = targetSegment?.autoAiAnswers ?? session?.settings.autoAiAnswers ?? true;
    if (status === 'APPROVED' && autoAi) {
      newQuestion.aiStatus = 'GENERATING';
      // Compose grounding: Event grounding + Speaker grounding + Speaker Identity (FR-E1)
      const eventContext = series?.contextData || series?.seriesContextData || '';
      const speakerContext = targetSegment?.groundingContext || targetSegment?.contextData || session?.contextData || '';
      const speakerHeader = targetSegment?.speakerName ? `Speaker: ${targetSegment.speakerName} (${targetSegment.title})` : '';

      const mergedGrounding = [speakerHeader, speakerContext, eventContext].filter(Boolean).join('\n\n').substring(0, 10000);

      generateTwoLineAnswer(newQuestion.content, mergedGrounding)
        .then(aiResult => {
          newQuestion.aiLine1 = aiResult.firstLine;
          newQuestion.aiLine2 = aiResult.secondLine;
          newQuestion.aiConfidence = aiResult.confidenceScore;
          newQuestion.aiStatus = 'READY';
          newQuestion.updatedAt = new Date().toISOString();
        })
        .catch(err => {
          console.error('Async AI generation failed:', err);
          newQuestion.aiStatus = 'FAILED';
        });
    }

    return { question: newQuestion, moderated: true, resolvedSegmentId: targetSegment?.id };
  }

  /**
   * Moves a question between segments preserving upvotes and appending audit trail (FR-D6)
   */
  public moveQuestion(
    joinCode: string,
    questionId: string,
    targetSegmentId: string,
    token?: string
  ): boolean {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return false;

    const auth = this.verifyToken(code, token);
    const question = this.questions.get(questionId);
    if (!question) return false;

    const sourceSeg = series.segments.find(s => s.id === question.segmentId);
    const targetSeg = series.segments.find(s => s.id === targetSegmentId);
    if (!targetSeg) return false;

    // Organizer or source speaker can move
    const canMove = auth.role === 'organizer' || (auth.role === 'speaker' && sourceSeg && auth.scope.includes(sourceSeg.id));
    if (!canMove) return false;

    const nowIso = new Date().toISOString();
    const movedFromEntry = {
      segmentId: question.segmentId || 'general',
      at: nowIso,
      by: auth.role,
    };

    question.movedFrom = question.movedFrom || [];
    question.movedFrom.push(movedFromEntry);
    question.segmentId = targetSeg.id;
    question.segmentTitle = targetSeg.title;
    question.speakerName = targetSeg.speakerName;
    question.updatedAt = nowIso;

    this.logAudit({
      seriesId: series.id,
      segmentId: targetSegmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'user',
      action: 'QUESTION_MOVED',
      targetId: questionId,
      meta: { fromSegmentId: movedFromEntry.segmentId, toSegmentId: targetSegmentId },
    });

    return true;
  }

  public bulkMoveQuestions(
    joinCode: string,
    questionIds: string[],
    targetSegmentId: string,
    token?: string
  ): { movedCount: number } {
    let movedCount = 0;
    for (const qId of questionIds) {
      if (this.moveQuestion(joinCode, qId, targetSegmentId, token)) {
        movedCount++;
      }
    }
    return { movedCount };
  }

  public parkQuestion(
    joinCode: string,
    questionId: string,
    isParked: boolean,
    token?: string
  ): boolean {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return false;

    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer' && auth.role !== 'speaker') return false;

    const question = this.questions.get(questionId);
    if (!question) return false;

    question.isParked = isParked;
    question.updatedAt = new Date().toISOString();

    this.logAudit({
      seriesId: series.id,
      segmentId: question.segmentId,
      actorRole: auth.role,
      actorRef: auth.token || 'user',
      action: isParked ? 'QUESTION_PARKED' : 'QUESTION_UNPARKED',
      targetId: questionId,
    });

    return true;
  }

  // ==========================================
  // Participants & Multi-Speaker Identity Continuity
  // ==========================================

  public registerSeriesParticipant(
    seriesCode: string,
    fingerprint: string,
    name: string
  ): SeriesParticipant {
    const code = seriesCode.toUpperCase();
    if (!this.seriesParticipants.has(code)) {
      this.seriesParticipants.set(code, new Map());
    }
    const partMap = this.seriesParticipants.get(code)!;
    let participant = partMap.get(fingerprint);
    const nowIso = new Date().toISOString();

    if (!participant) {
      participant = {
        clientFingerprint: fingerprint,
        name: name || 'Participant',
        isBanned: false,
        joinedAt: nowIso,
        lastSeenAt: nowIso,
        questionCount: 0,
        segmentsVisited: ['general'],
      };
      partMap.set(fingerprint, participant);
    } else {
      participant.lastSeenAt = nowIso;
      if (name && participant.name !== name) {
        participant.name = name;
      }
    }
    return participant;
  }

  private recordParticipantQuestion(
    code: string,
    fingerprint: string,
    name?: string,
    segmentId?: string
  ) {
    // 1. Update Series participant
    const sMap = this.seriesParticipants.get(code);
    if (sMap) {
      let sp = sMap.get(fingerprint);
      if (!sp) {
        sp = this.registerSeriesParticipant(code, fingerprint, name || 'Participant');
      }
      sp.questionCount++;
      if (segmentId && !sp.segmentsVisited.includes(segmentId)) {
        sp.segmentsVisited.push(segmentId);
      }
    }

    // 2. Update legacy session participant
    const partMap = this.participants.get(code);
    if (partMap) {
      let p = partMap.get(fingerprint);
      if (!p) {
        p = this.registerParticipant(code, fingerprint, name || 'Participant');
      }
      p.questionCount++;
    }
  }

  public isParticipantBanned(code: string, fingerprint: string): boolean {
    const sPart = this.seriesParticipants.get(code.toUpperCase())?.get(fingerprint);
    if (sPart?.isBanned) return true;
    const sessPart = this.participants.get(code.toUpperCase())?.get(fingerprint);
    return sessPart?.isBanned || false;
  }

  public banParticipant(
    joinCode: string,
    fingerprint: string,
    banned: boolean,
    token?: string
  ): boolean {
    const code = joinCode.toUpperCase();
    const auth = this.verifyToken(code, token);
    if (auth.role !== 'organizer') return false;

    let updated = false;

    // Series level ban
    const sPart = this.seriesParticipants.get(code)?.get(fingerprint);
    if (sPart) {
      sPart.isBanned = banned;
      updated = true;
    }

    // Session level ban
    const sessPart = this.participants.get(code)?.get(fingerprint);
    if (sessPart) {
      sessPart.isBanned = banned;
      updated = true;
    }

    const series = this.getSeries(code);
    if (series) {
      this.logAudit({
        seriesId: series.id,
        actorRole: auth.role,
        actorRef: auth.token || 'organizer',
        action: banned ? 'PARTICIPANT_BANNED' : 'PARTICIPANT_UNBANNED',
        targetId: fingerprint,
      });
    }

    return updated;
  }

  public getSeriesParticipants(seriesCode: string): SeriesParticipant[] {
    const map = this.seriesParticipants.get(seriesCode.toUpperCase());
    return map ? Array.from(map.values()) : [];
  }

  // ==========================================
  // Audit Logs
  // ==========================================

  public logAudit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): AuditEntry {
    const fullEntry: AuditEntry = {
      id: 'audit-' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      ...entry,
    };
    const series = Array.from(this.series.values()).find(s => s.id === entry.seriesId);
    const code = series?.seriesCode || entry.seriesId;

    if (!this.auditLogs.has(code)) {
      this.auditLogs.set(code, []);
    }
    this.auditLogs.get(code)!.push(fullEntry);
    return fullEntry;
  }

  public getAuditLog(seriesCode: string): AuditEntry[] {
    return this.auditLogs.get(seriesCode.toUpperCase()) || [];
  }

  // ==========================================
  // Upvotes & Question Operations
  // ==========================================

  public toggleUpvote(
    joinCode: string,
    questionId: string,
    clientFingerprint: string
  ): { upvoted: boolean; upvotes: number } | null {
    const question = this.questions.get(questionId);
    if (!question) return null;

    const ledgerKey = `${questionId}:${clientFingerprint}`;
    const hasVoted = this.upvoteLedger.has(ledgerKey);

    if (hasVoted) {
      this.upvoteLedger.delete(ledgerKey);
      question.upvotes = Math.max(0, question.upvotes - 1);
      question.updatedAt = new Date().toISOString();
      return { upvoted: false, upvotes: question.upvotes };
    } else {
      this.upvoteLedger.add(ledgerKey);
      question.upvotes += 1;
      question.updatedAt = new Date().toISOString();
      return { upvoted: true, upvotes: question.upvotes };
    }
  }

  public hasUserUpvoted(questionId: string, clientFingerprint: string): boolean {
    return this.upvoteLedger.has(`${questionId}:${clientFingerprint}`);
  }

  public getUserUpvotedIds(joinCode: string, clientFingerprint: string): string[] {
    const questionIds = this.sessionQuestions.get(joinCode.toUpperCase()) || [];
    return questionIds.filter(qId => this.upvoteLedger.has(`${qId}:${clientFingerprint}`));
  }

  public updateQuestionStatus(
    joinCode: string,
    questionId: string,
    status: QuestionStatus
  ): Question | null {
    const question = this.questions.get(questionId);
    if (!question) return null;
    question.status = status;
    question.updatedAt = new Date().toISOString();

    if (status === 'APPROVED' && (!question.aiLine1 || question.aiStatus === 'IDLE')) {
      const series = this.getSeries(joinCode);
      const targetSeg = series?.segments.find(s => s.id === question.segmentId);
      const session = this.getSession(joinCode);
      const grounding = targetSeg?.groundingContext || session?.contextData || series?.seriesContextData;

      question.aiStatus = 'GENERATING';
      generateTwoLineAnswer(question.content, grounding)
        .then(aiResult => {
          newQuestionLine(question, aiResult);
        })
        .catch(() => {
          question.aiStatus = 'FAILED';
        });
    }

    return question;
  }

  public editQuestionContent(
    questionId: string,
    clientFingerprint: string,
    newContent: string,
    isAdmin = false
  ): Question | null {
    const question = this.questions.get(questionId);
    if (!question) return null;
    if (!isAdmin && question.clientFingerprint !== clientFingerprint) {
      return null;
    }
    question.content = newContent.trim();
    question.updatedAt = new Date().toISOString();
    return question;
  }

  public deleteQuestion(
    joinCode: string,
    questionId: string,
    clientFingerprint: string,
    isAdmin = false
  ): boolean {
    const question = this.questions.get(questionId);
    if (!question) return false;
    if (!isAdmin && question.clientFingerprint !== clientFingerprint) {
      return false;
    }
    this.questions.delete(questionId);
    const code = joinCode.toUpperCase();
    const list = this.sessionQuestions.get(code);
    if (list) {
      this.sessionQuestions.set(code, list.filter(id => id !== questionId));
    }
    return true;
  }

  public getQuestions(joinCode: string, segmentId?: string): Question[] {
    const code = joinCode.toUpperCase();
    const ids = this.sessionQuestions.get(code) || [];
    const result: Question[] = [];
    for (const id of ids) {
      const q = this.questions.get(id);
      if (q) {
        if (!segmentId || segmentId === 'ALL' || q.segmentId === segmentId) {
          result.push(q);
        }
      }
    }
    return result;
  }

  public getTeleprompterQuestions(joinCode: string, segmentId?: string): Question[] {
    const questions = this.getQuestions(joinCode, segmentId).filter(
      q => q.status === 'APPROVED' || q.status === 'ANSWERING'
    );
    const now = Date.now();
    const gamma = 1.5;

    return questions
      .map(q => {
        const subTime = new Date(q.createdAt).getTime();
        const elapsedMinutes = Math.max(0, (now - subTime) / 60000);
        const score = (q.upvotes - 1) / Math.pow(elapsedMinutes + 2, gamma);
        return {
          ...q,
          decayScore: Math.round(score * 100) / 100,
        };
      })
      .sort((a, b) => {
        if (a.status === 'ANSWERING' && b.status !== 'ANSWERING') return -1;
        if (b.status === 'ANSWERING' && a.status !== 'ANSWERING') return 1;
        return (b.decayScore || 0) - (a.decayScore || 0);
      });
  }

  // ==========================================
  // Telemetry & Word Cloud Analytics
  // ==========================================

  public getTelemetry(joinCode: string, segmentId?: string): TelemetryMetrics {
    const questions = this.getQuestions(joinCode, segmentId);
    const now = Date.now();
    const oneMinAgo = now - 60000;

    const recentQuestions = questions.filter(
      q => new Date(q.createdAt).getTime() >= oneMinAgo
    );
    const questionVelocity = recentQuestions.length;

    const upvoteMomentum = questions.reduce((acc, q) => {
      const isRecent = new Date(q.updatedAt).getTime() >= oneMinAgo;
      return isRecent ? acc + 1 : acc;
    }, 0);

    const categoryCounts = new Map<string, number>();
    for (const q of questions) {
      const cat = q.category || 'General';
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
    const totalQ = questions.length || 1;
    const topicDistribution = Array.from(categoryCounts.entries()).map(([topic, count]) => ({
      topic,
      count,
      percentage: Math.round((count / totalQ) * 100),
    }));

    const sentiments = questions.map(q => q.sentimentScore ?? 0.5);
    const avgSentiment = sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 0.7;

    const approved = questions.filter(q => q.status === 'APPROVED').length;
    const flagged = questions.filter(q => q.status === 'PENDING_REVIEW' || q.isSpam).length;
    const answered = questions.filter(q => q.status === 'ANSWERED').length;
    const totalUpvotes = questions.reduce((acc, q) => acc + q.upvotes, 0);

    return {
      questionVelocity,
      velocity: questionVelocity,
      upvoteMomentum,
      upvoteVelocity: upvoteMomentum,
      sentimentPolarity: Math.round(avgSentiment * 100) / 100,
      topicDistribution,
      totalQuestions: questions.length,
      totalUpvotes,
      approvedQuestions: approved,
      flaggedQuestions: flagged,
      answeredQuestions: answered,
      activeParticipants: Math.max(1, (this.participants.get(joinCode.toUpperCase())?.size || 18) + Math.floor(questions.length * 1.5)),
    };
  }

  public getSeriesTelemetry(seriesCode: string): SeriesTelemetry {
    const code = seriesCode.toUpperCase();
    const series = this.getSeries(code);
    const allQuestions = this.getQuestions(code);

    const totalQuestions = allQuestions.length;
    const totalUpvotes = allQuestions.reduce((acc, q) => acc + q.upvotes, 0);
    const answeredCount = allQuestions.filter(q => q.status === 'ANSWERED').length;
    const answeredRate = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
    const uniqueParticipants = Math.max(20, (this.seriesParticipants.get(code)?.size || 18) + Math.floor(totalQuestions * 1.5));

    // Timeline buckets (5-minute buckets)
    const timelineMap = new Map<string, { questions: number; upvotes: number; segmentId?: string }>();
    for (const q of allQuestions) {
      const qTime = new Date(q.createdAt);
      const roundedMinutes = Math.floor(qTime.getMinutes() / 5) * 5;
      qTime.setMinutes(roundedMinutes, 0, 0);
      const key = qTime.toISOString().substring(11, 16);

      const entry = timelineMap.get(key) || { questions: 0, upvotes: 0, segmentId: q.segmentId };
      entry.questions += 1;
      entry.upvotes += q.upvotes;
      timelineMap.set(key, entry);
    }
    const timeline = Array.from(timelineMap.entries()).map(([t, val]) => ({
      t,
      questions: val.questions,
      upvotes: val.upvotes,
      segmentId: val.segmentId,
    }));

    // Speaker scorecards
    const speakerScorecard: SegmentScore[] = (series?.segments || []).map(seg => {
      const segQs = allQuestions.filter(q => q.segmentId === seg.id);
      const segAnswered = segQs.filter(q => q.status === 'ANSWERED').length;
      const segUpvotes = segQs.reduce((sum, q) => sum + q.upvotes, 0);
      const askers = new Set(segQs.map(q => q.clientFingerprint)).size;
      const sentiments = segQs.map(q => q.sentimentScore ?? 0.5);
      const avgSent = sentiments.length > 0
        ? Math.round((sentiments.reduce((a, b) => a + b, 0) / sentiments.length) * 100) / 100
        : 0.75;
      const confidences = segQs.filter(q => q.aiConfidence).map(q => q.aiConfidence!);
      const avgConf = confidences.length > 0
        ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
        : 0.88;

      return {
        segmentId: seg.id,
        speakerName: seg.speakerName,
        talkTitle: seg.title,
        questionCount: segQs.length,
        uniqueAskers: askers,
        upvoteCount: segUpvotes,
        answeredCount: segAnswered,
        answeredRate: segQs.length > 0 ? Math.round((segAnswered / segQs.length) * 100) : 0,
        avgSentiment: avgSent,
        avgConfidence: avgConf,
        unansweredCount: segQs.length - segAnswered,
      };
    });

    // Topic drift
    const topicMap = new Map<string, Set<string>>();
    for (const q of allQuestions) {
      const topic = q.category || 'General';
      if (!topicMap.has(topic)) topicMap.set(topic, new Set());
      if (q.segmentId) topicMap.get(topic)!.add(q.segmentId);
    }
    const topicDrift = Array.from(topicMap.entries()).map(([topic, segSet]) => ({
      topic,
      segments: Array.from(segSet),
      count: segSet.size,
    }));

    // Unanswered debt
    const unansweredDebt = (series?.segments || []).map(seg => {
      const segQs = allQuestions.filter(q => q.segmentId === seg.id && q.status !== 'ANSWERED');
      const upvotesTotal = segQs.reduce((s, q) => s + q.upvotes, 0);
      return {
        segmentId: seg.id,
        segmentTitle: seg.title,
        unansweredCount: segQs.length,
        upvotesTotal,
      };
    });

    // Attendance curve
    const attendanceCurve = (series?.segments || []).map((seg, idx) => ({
      segmentId: seg.id,
      segmentTitle: seg.title,
      activeParticipants: Math.max(12, uniqueParticipants - (idx * 3)),
    }));

    return {
      totalQuestions,
      totalUpvotes,
      uniqueParticipants,
      answeredRate,
      timeline,
      speakerScorecard,
      topicDrift,
      unansweredDebt,
      attendanceCurve,
    };
  }

  public getWordFrequencies(joinCode: string, segmentId?: string): WordFrequency[] {
    const questions = this.getQuestions(joinCode, segmentId).filter(q => !q.isSpam && q.status !== 'REJECTED');
    const wordCounts = new Map<string, number>();

    const knownAcronyms = new Set(['ai', 'api', 'llm', 'gcp', 'sdk', 'sql', 'jwt', 'grpc', 'vm', 'k8s', 'nlp', 'tpu', 'gpu', 'rag', 'cdn']);
    const compoundPhrases = [
      'real-time', 'deep research', 'cloud run', 'sub-second', 'context cache',
      'state sync', 'rate limit', 'high concurrency', 'edge worker', 'vector context',
    ];

    for (const q of questions) {
      const lower = q.content.toLowerCase();
      for (const phrase of compoundPhrases) {
        if (lower.includes(phrase)) {
          const formattedPhrase = phrase
            .split(/[\s-]+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          wordCounts.set(formattedPhrase, (wordCounts.get(formattedPhrase) || 0) + 1);
        }
      }

      const cleanText = q.content.replace(/https?:\/\/[^\s]+/g, '').replace(/[^\w\s-]/g, ' ');
      const words = cleanText.split(/\s+/);
      for (const rawWord of words) {
        const wordLower = rawWord.toLowerCase().trim();
        if (wordLower.length > 2 && !STOP_WORDS.has(wordLower) && !/^\d+$/.test(wordLower)) {
          let displayWord = wordLower.charAt(0).toUpperCase() + wordLower.slice(1);
          if (knownAcronyms.has(wordLower)) {
            displayWord = wordLower.toUpperCase();
          } else if (rawWord.length > 2 && /[A-Z]/.test(rawWord.slice(1))) {
            displayWord = rawWord.trim();
          }
          wordCounts.set(displayWord, (wordCounts.get(displayWord) || 0) + 1);
        }
      }
    }

    return Array.from(wordCounts.entries())
      .map(([text, count]) => {
        const textLower = text.toLowerCase();
        const matchingQuestions = questions.filter(q => q.content.toLowerCase().includes(textLower));
        const relatedCount = matchingQuestions.length || count;
        let avgSentiment = 0.4;
        let posCount = 0;
        let neuCount = 0;
        let critCount = 0;
        let totalUpvotes = 0;

        if (matchingQuestions.length > 0) {
          let sentimentSum = 0;
          for (const q of matchingQuestions) {
            const s = q.sentimentScore !== undefined ? q.sentimentScore : computeTextSentiment(q.content);
            sentimentSum += s;
            if (s >= 0.2) posCount++;
            else if (s <= -0.2) critCount++;
            else neuCount++;
            totalUpvotes += q.upvotes;
          }
          avgSentiment = Math.round((sentimentSum / matchingQuestions.length) * 100) / 100;
        }

        const topQ = matchingQuestions.length > 0
          ? [...matchingQuestions].sort((a, b) => b.upvotes - a.upvotes)[0]
          : undefined;

        return {
          text,
          count,
          value: count,
          sentimentScore: avgSentiment,
          positiveCount: posCount,
          neutralCount: neuCount,
          criticalCount: critCount,
          totalUpvotes,
          relatedQuestionCount: relatedCount,
          sampleQuestion: topQ?.content,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 48);
  }

  // ==========================================
  // Map-Reduce Executive Report Generation (FR-E5)
  // ==========================================

  public async getSeriesReport(joinCode: string): Promise<SeriesReport | null> {
    const code = joinCode.toUpperCase();
    const series = this.getSeries(code);
    if (!series) return null;

    const allQuestions = this.getQuestions(code);

    // 1. Map Phase: Generate / retrieve each segment's report
    const segmentReports: PostSessionReport[] = [];
    for (const seg of series.segments) {
      if (seg.id === 'general') continue; // Skip general bucket in individual speaker breakdown
      const segQuestions = allQuestions.filter(q => q.segmentId === seg.id);

      let segReport = this.cachedSegmentReports.get(seg.id);
      if (!segReport || segQuestions.length > segReport.totalQuestions) {
        const generated = await generatePostSessionReport(
          `${seg.speakerName} — ${seg.title}`,
          seg.groundingContext || seg.contextData || '',
          segQuestions
        );
        segReport = {
          sessionTitle: `${seg.speakerName} — ${seg.title}`,
          generatedAt: new Date().toISOString(),
          totalQuestions: segQuestions.length,
          totalUpvotes: segQuestions.reduce((sum, q) => sum + q.upvotes, 0),
          topThemes: generated.topThemes,
          unresolvedTopics: generated.unresolvedTopics,
          actionableFollowUps: generated.actionableFollowUps,
          markdownReport: generated.markdownReport,
        };
        this.cachedSegmentReports.set(seg.id, segReport);
      }
      if (segReport) {
        segmentReports.push(segReport);
      }
    }

    // 2. Reduce Phase: Synthesize Series Executive Report from segment summaries
    const speakersForGemini = series.segments.map(seg => {
      const segQs = allQuestions.filter(q => q.segmentId === seg.id);
      return {
        speakerName: seg.speakerName,
        talkTitle: seg.title,
        segmentId: seg.id,
        questionCount: segQs.length,
        upvotes: segQs.reduce((sum, q) => sum + q.upvotes, 0),
        answeredCount: segQs.filter(q => q.status === 'ANSWERED').length,
        questions: segQs.map(q => ({ content: q.content, upvotes: q.upvotes, status: q.status })),
      };
    });

    const report = await generateSeriesExecutiveReport(
      series.title,
      series.contextData || series.seriesContextData || '',
      speakersForGemini
    );

    const speakerComparisons: SpeakerComparison[] = series.segments.map(seg => {
      const segQuestions = allQuestions.filter(q => q.segmentId === seg.id);
      const answered = segQuestions.filter(q => q.status === 'ANSWERED').length;
      const upvotes = segQuestions.reduce((sum, q) => sum + q.upvotes, 0);
      const topQ = [...segQuestions].sort((a, b) => b.upvotes - a.upvotes)[0];
      const sentiments = segQuestions.map(q => q.sentimentScore ?? 0.5);
      const avgSent = sentiments.length > 0
        ? Math.round((sentiments.reduce((a, b) => a + b, 0) / sentiments.length) * 100) / 100
        : 0.75;

      return {
        segmentId: seg.id,
        speakerName: seg.speakerName,
        talkTitle: seg.title,
        questionCount: segQuestions.length,
        upvoteCount: upvotes,
        answeredCount: answered,
        sentimentScore: avgSent,
        topQuestion: topQ?.content,
      };
    });

    return {
      seriesTitle: series.title,
      seriesCode: series.seriesCode,
      joinCode: series.joinCode,
      generatedAt: new Date().toISOString(),
      totalQuestions: allQuestions.length,
      totalUpvotes: allQuestions.reduce((sum, q) => sum + q.upvotes, 0),
      totalParticipants: Math.max(20, (this.seriesParticipants.get(code)?.size || 18) + Math.floor(allQuestions.length * 1.5)),
      executiveSummary: report.executiveSummary,
      segmentReports,
      speakerComparisons,
      crossCuttingThemes: report.crossCuttingThemes,
      unresolvedTopics: report.unresolvedTopics,
      actionableFollowUps: report.actionableFollowUps,
      markdownReport: report.markdownReport,
    };
  }

  // ==========================================
  // Legacy / Standalone Session CRUD & Seeding
  // ==========================================

  public getSession(joinCode: string): Session | undefined {
    return this.sessions.get(joinCode.toUpperCase());
  }

  public createSession(params: {
    title: string;
    description?: string;
    contextData?: string;
    categories?: string[];
    settings?: Partial<Session['settings']>;
    customJoinCode?: string;
  }): Session {
    let joinCode = (params.customJoinCode || '')
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9_-]/g, '');

    if (joinCode) {
      if (this.sessions.has(joinCode) || this.series.has(joinCode)) {
        throw new Error(`Custom room code "${joinCode}" is already in use by another session or workshop. Please choose a different code or use auto-generation.`);
      }
    } else {
      joinCode = this.generateUniqueCode('ROOM');
    }

    const session: Session = {
      id: 'session-' + Math.random().toString(36).substring(2, 9),
      joinCode,
      adminToken: 'admin_' + crypto.randomBytes(8).toString('hex'),
      title: params.title || 'Live Interactive Q&A Session',
      description: params.description,
      contextData: params.contextData,
      isActive: true,
      createdAt: new Date().toISOString(),
      categories: params.categories && params.categories.length > 0
        ? params.categories
        : ['General', 'Architecture', 'AI & ML', 'Performance', 'Operations'],
      settings: {
        moderationSensitivity: params.settings?.moderationSensitivity || 'BALANCED',
        autoAiAnswers: params.settings?.autoAiAnswers ?? true,
        allowAnonymous: params.settings?.allowAnonymous ?? true,
        maxQuestionsPerMinute: params.settings?.maxQuestionsPerMinute || 5,
      },
    };

    this.sessions.set(joinCode, session);
    this.sessionQuestions.set(joinCode, []);
    this.participants.set(joinCode, new Map());

    return session;
  }

  public updateGroundingContext(joinCode: string, contextData: string): boolean {
    const session = this.getSession(joinCode);
    if (!session) return false;
    session.contextData = contextData;

    const series = this.getSeries(joinCode);
    if (series && series.liveSegmentId) {
      const seg = series.segments.find(s => s.id === series.liveSegmentId);
      if (seg) {
        seg.groundingContext = contextData;
        seg.contextData = contextData;
      }
    }
    return true;
  }

  public updateSessionSettings(
    joinCode: string,
    settings: Partial<Session['settings']>
  ): boolean {
    const session = this.getSession(joinCode);
    if (!session) return false;
    session.settings = { ...session.settings, ...settings };
    return true;
  }

  public registerParticipant(
    joinCode: string,
    fingerprint: string,
    name: string
  ): Participant {
    const code = joinCode.toUpperCase();
    if (!this.participants.has(code)) {
      this.participants.set(code, new Map());
    }
    const sessionPartMap = this.participants.get(code)!;
    let participant = sessionPartMap.get(fingerprint);
    if (!participant) {
      participant = {
        clientFingerprint: fingerprint,
        name: name || 'Participant',
        isBanned: false,
        joinedAt: new Date().toISOString(),
        questionCount: 0,
      };
      sessionPartMap.set(fingerprint, participant);
    } else if (name && participant.name !== name) {
      participant.name = name;
    }
    return participant;
  }

  public getParticipants(joinCode: string): Participant[] {
    const code = joinCode.toUpperCase();
    const map = this.participants.get(code);
    return map ? Array.from(map.values()) : [];
  }

  /**
   * Seeds demo 6-speaker series and standalone keynote session (NEXT26)
   */
  private seedDefaultSessions() {
    const defaultCode = 'NEXT26';
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // 6-Segment Run of Show for Google Cloud Next 2026 Workshop
    const segments: Segment[] = [
      {
        id: 'seg-1',
        seriesId: 'series-next26',
        title: 'Keynote: Multimodal AI & Live Interaction Systems',
        speakerName: 'Dr. Sundar Varma',
        speakerRole: 'VP of Machine Learning & Live Systems, Google DeepMind',
        speakerBio: 'Leading research on low-latency multimodal LLMs and real-time interactive voice & teleprompter synthesis.',
        speakerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'LIVE',
        state: 'LIVE',
        startTime: '09:00',
        scheduledStart: new Date(now - 1000 * 60 * 30).toISOString(),
        scheduledDurationMinutes: 50,
        durationMinutes: 50,
        actualStartTime: new Date(now - 1000 * 60 * 25).toISOString(),
        actualStart: new Date(now - 1000 * 60 * 25).toISOString(),
        order: 1,
        adminToken: 'speaker_token_sundar',
        graceWindowMinutes: 10,
        categories: ['Architecture', 'Gemini AI', 'Performance', 'Security', 'Telemetry'],
        groundingContext: `Dr. Sundar Varma Keynote Context:
- Gemini 2.5 Flash / Gemini 3.7 Flash: Sub-second inference time with strict JSON responseSchema validation.
- Real-time live Q&A architecture: Uses Redis caching, WebSocket message propagation, and PostgreSQL persistence.
- Automated Content Moderation: Low-latency classification for spam, toxicity, and irrelevant inquiries.
- Semantic Clustering: Uses cosine similarity over text embeddings (threshold 0.88) to group duplicate audience questions and merge upvote momentum.
- Teleprompter Scoring: Score(q) = (U_q - 1) / (T_now - T_sub + 2)^1.5, prioritizing high-velocity trending inquiries.
- Client-side Auditory Synthesis: Offloads speech generation to the browser-native Web Speech API, eliminating third-party streaming latency.`,
      },
      {
        id: 'seg-2',
        seriesId: 'series-next26',
        title: 'Low-Latency Inference & Edge Caching Architecture',
        speakerName: 'Maya Chen',
        speakerRole: 'Principal Cloud Systems Architect',
        speakerBio: 'Specializes in distributed edge runtimes, Cloud Run microVM scaling, and sub-10ms cache hierarchies.',
        speakerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '10:00',
        scheduledStart: new Date(now + 1000 * 60 * 30).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 2,
        adminToken: 'speaker_token_maya',
        graceWindowMinutes: 10,
        categories: ['Edge Workers', 'Caching', 'Latency', 'Redis', 'CDN'],
        groundingContext: `Maya Chen - Edge Architecture Context:
- Edge Cache Architecture: Anycast routing via Cloud CDN with tier-1 edge POPs caching AI answers with 30s TTL.
- MicroVM Provisioning: Scale-to-zero containers achieve <250ms cold-start latency through snapshot memory hydration.
- WebSocket Broadcast: Epoll-driven non-blocking pub/sub multiplexers handling 100,000 concurrent listeners per regional cluster.
- Failover Protocol: Automatic DNS health-check failover to secondary continent cluster within 1.2 seconds.`,
      },
      {
        id: 'seg-3',
        seriesId: 'series-next26',
        title: 'Mid-Morning Break & Sponsor Showcase',
        speakerName: 'Workshop MC',
        speakerRole: 'Community Lead',
        type: 'BREAK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '10:45',
        scheduledStart: new Date(now + 1000 * 60 * 75).toISOString(),
        scheduledDurationMinutes: 15,
        durationMinutes: 15,
        order: 3,
        adminToken: 'speaker_token_break',
        graceWindowMinutes: 5,
        categories: ['Networking', 'General', 'Community'],
        groundingContext: `Break & Community Hub:
- Coffee stations and partner lounges located on Level 2 Promenade.
- Lightning demos in Hall B: Vertex AI Model Garden & Cloud Workstations.
- Submit questions ahead for Dr. Elena Rostova and Devon Takahashi during this break!`,
      },
      {
        id: 'seg-4',
        seriesId: 'series-next26',
        title: 'Zero-Hallucination Grounding with Dynamic Vector Contexts',
        speakerName: 'Dr. Elena Rostova',
        speakerRole: 'Head of Applied AI Research',
        speakerBio: 'Author of landmark papers on structured RAG orchestration and real-time knowledge injection in LLMs.',
        speakerAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '11:00',
        scheduledStart: new Date(now + 1000 * 60 * 90).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 4,
        adminToken: 'speaker_token_elena',
        graceWindowMinutes: 10,
        categories: ['Grounding', 'Vector Search', 'Hallucination Mitigation', 'Embeddings'],
        groundingContext: `Dr. Elena Rostova - Dynamic Vector Grounding:
- Structured RAG Pipelines: Dynamic chunk retrieval with hybrid BM25 + dense neural embedding ranking.
- Context Compression: Redundant token stripping achieves 60% context reduction without accuracy degradation.
- Real-time Citation Injection: Every two-line AI answer references verified document spans with confidence telemetry.`,
      },
      {
        id: 'seg-5',
        seriesId: 'series-next26',
        title: 'Hardening Real-Time Systems: Threat Modeling & Rate Limiting',
        speakerName: 'Devon Takahashi',
        speakerRole: 'Director of Infrastructure Security',
        speakerBio: 'Former red-team lead specializing in WebSocket DDoS defense, fingerprint rotation attacks, and prompt injection mitigation.',
        speakerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '11:45',
        scheduledStart: new Date(now + 1000 * 60 * 135).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 5,
        adminToken: 'speaker_token_devon',
        graceWindowMinutes: 10,
        categories: ['Security', 'Rate Limiting', 'Prompt Injection', 'Authentication'],
        groundingContext: `Devon Takahashi - Live Security Architecture:
- Prompt Injection Defense: Secondary LLM guardrails classify input adversarial intent before context inclusion.
- Token Bucket Rate Limiting: 5 submissions/min sliding window combined with IP/Fingerprint velocity tracking.
- Client Fingerprinting: Canvas + WebGL + hardware fingerprinting prevents sybil voting spam with zero cookie dependency.`,
      },
      {
        id: 'seg-6',
        seriesId: 'series-next26',
        title: 'Executive Panel: The Future of Live Interactive AI Systems',
        speakerName: 'All Speakers & Guest Executives',
        speakerRole: 'Panel Moderator: Sarah Jenkins, Tech Journalist',
        speakerBio: 'Open 45-minute interactive panel tackling top audience questions across all morning sessions.',
        speakerAvatar: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80',
        type: 'PANEL',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '12:30',
        scheduledStart: new Date(now + 1000 * 60 * 180).toISOString(),
        scheduledDurationMinutes: 50,
        durationMinutes: 50,
        order: 6,
        adminToken: 'speaker_token_panel',
        graceWindowMinutes: 15,
        categories: ['Executive Strategy', 'Future of AI', 'Panel', 'Q&A'],
        groundingContext: `Executive Panel Combined Context:
- Synthesizing themes from Morning Keynote, Edge Caching, Dynamic Grounding, and Security Hardening.
- Answering carried-over parking-lot questions with high audience upvote momentum from prior segments.`,
      },
    ];

    const seriesNext26: Series = {
      id: 'series-next26',
      seriesCode: defaultCode,
      joinCode: defaultCode,
      title: 'Google Cloud Next 2026: Live Interactive Q&A Workshop Series',
      description: 'Full-day multi-speaker workshop on real-time systems, low-latency AI orchestration, edge caching, and live teleprompter synthesis.',
      contextData: `Google Cloud Next 2026 General Workshop Context:
- Venue: Moscone Center West & Global Live Stream
- Format: 6-hour interactive workshop with 6 featured technical segments
- Platform: AskQlive real-time interactive audience engagement system`,
      seriesContextData: `Google Cloud Next 2026 General Workshop Context:
- Venue: Moscone Center West & Global Live Stream
- Format: 6-hour interactive workshop with 6 featured technical segments
- Platform: AskQlive real-time interactive audience engagement system`,
      startDate: nowIso.split('T')[0],
      date: nowIso.split('T')[0],
      timezone: 'America/Los_Angeles',
      state: 'LIVE',
      organizerToken: 'organizer_secret_next26',
      autoAdvance: false,
      isActive: true,
      liveSegmentId: 'seg-1',
      activeSegmentId: 'seg-1',
      segmentIds: segments.map(s => s.id),
      segments,
      settings: {
        autoAdvance: false,
        graceWindowMinutes: 10,
        allowPreSubmit: true,
        allowSpeakerSelfEnd: false,
        autoParkUnanswered: false,
        cascadeScheduleShift: true,
        defaultModerationSensitivity: 'BALANCED',
        allowAnonymous: true,
        maxQuestionsPerMinute: 5,
        maxQuestionsPerSeriesPerHour: 30,
        showCrossSegmentSimilarHint: true,
      },
      revision: 1,
      createdAt: new Date(now - 1000 * 60 * 120).toISOString(),
      updatedAt: nowIso,
    };

    this.series.set(defaultCode, seriesNext26);
    this.sessionQuestions.set(defaultCode, []);
    this.participants.set(defaultCode, new Map());
    this.seriesParticipants.set(defaultCode, new Map());
    this.auditLogs.set(defaultCode, []);

    // Seed keynote root session for standalone backward compatibility
    const keynoteSession: Session = {
      id: 'session-next26',
      joinCode: defaultCode,
      adminToken: 'organizer_secret_next26',
      title: segments[0].title,
      description: seriesNext26.description,
      contextData: segments[0].groundingContext,
      isActive: true,
      createdAt: seriesNext26.createdAt,
      categories: segments[0].categories,
      seriesId: seriesNext26.id,
      seriesCode: defaultCode,
      segmentId: segments[0].id,
      settings: {
        moderationSensitivity: 'BALANCED',
        autoAiAnswers: true,
        allowAnonymous: true,
        maxQuestionsPerMinute: 5,
      },
    };
    this.sessions.set(defaultCode, keynoteSession);

    // Also register backing sessions for each segment
    segments.forEach((seg, idx) => {
      const backingCode = `${defaultCode}-S${idx + 1}`;
      const backingSession: Session = {
        id: 'session-' + seg.id,
        joinCode: backingCode,
        adminToken: seg.adminToken,
        title: seg.title,
        description: seg.speakerBio,
        contextData: seg.groundingContext,
        isActive: seg.state === 'LIVE',
        createdAt: seriesNext26.createdAt,
        categories: seg.categories,
        seriesId: seriesNext26.id,
        seriesCode: defaultCode,
        order: idx + 1,
        segmentType: seg.type,
        state: seg.state,
        speaker: seg.speaker,
        talkTitle: seg.talkTitle,
        scheduledStart: seg.scheduledStart,
        durationMinutes: seg.durationMinutes,
        segmentId: seg.id,
        settings: {
          moderationSensitivity: 'BALANCED',
          autoAiAnswers: true,
          allowAnonymous: true,
          maxQuestionsPerMinute: 5,
        },
      };
      this.sessions.set(backingCode, backingSession);
      this.sessionQuestions.set(backingCode, []);
    });

    // Seed demo questions
    const demoQuestions = [
      {
        id: 'q-demo-1',
        segmentId: 'seg-1',
        segmentTitle: 'Keynote: Multimodal AI & Live Interaction Systems',
        speakerName: 'Dr. Sundar Varma',
        authorName: 'Alex Rivera',
        isAnonymous: false,
        content: 'How does the teleprompter scoring algorithm prevent stale highly-upvoted questions from starving newly asked trending inquiries during a live keynote?',
        category: 'Performance',
        aiLine1: 'The scoring formula penalizes elapsed submission time with an exponential decay factor (T_now - T_sub + 2)^1.5.',
        aiLine2: 'This ensures emerging velocity spikes surpass static legacy questions within 3–4 minutes of activity.',
        aiConfidence: 0.96,
        aiStatus: 'READY' as const,
        upvotes: 42,
        isSpam: false,
        status: 'ANSWERED' as QuestionStatus,
        sentimentScore: 0.82,
        minutesAgo: 20,
      },
      {
        id: 'q-demo-2',
        segmentId: 'seg-1',
        segmentTitle: 'Keynote: Multimodal AI & Live Interaction Systems',
        speakerName: 'Dr. Sundar Varma',
        authorName: 'Priya Patel',
        isAnonymous: false,
        content: 'What is the benchmark sub-second latency for Gemini 2.5 Flash when generating structured two-line JSON answers during peak concurrency?',
        category: 'Gemini AI',
        aiLine1: 'Gemini 2.5 Flash achieves median latency under 450ms using strict responseSchema validation and edge POP routing.',
        aiLine2: 'Context caching further drops TTFT (Time to First Token) by up to 70% across repeated sessions.',
        aiConfidence: 0.94,
        aiStatus: 'READY' as const,
        upvotes: 28,
        isSpam: false,
        status: 'ANSWERING' as QuestionStatus,
        sentimentScore: 0.91,
        minutesAgo: 12,
      },
      {
        id: 'q-demo-3',
        segmentId: 'seg-1',
        segmentTitle: 'Keynote: Multimodal AI & Live Interaction Systems',
        speakerName: 'Dr. Sundar Varma',
        authorName: 'Marcus Vance',
        isAnonymous: true,
        content: 'Can audience question embeddings be cached across speakers to cluster related topics across the entire 6-hour event?',
        category: 'Architecture',
        aiLine1: 'Yes, question embeddings are indexed in real-time with cosine similarity thresholding at 0.88.',
        aiLine2: 'This enables both per-speaker deduplication and cross-talk topic trend synthesis in executive reporting.',
        aiConfidence: 0.92,
        aiStatus: 'READY' as const,
        upvotes: 19,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.74,
        minutesAgo: 8,
      },
      {
        id: 'q-demo-4',
        segmentId: 'seg-2',
        segmentTitle: 'Low-Latency Inference & Edge Caching Architecture',
        speakerName: 'Maya Chen',
        authorName: 'David Kim',
        isAnonymous: false,
        content: 'Pre-submitting for Maya: How does Cloud CDN handle TTL invalidation when a speaker live-edits their grounding context mid-talk?',
        category: 'Edge Workers',
        aiLine1: 'Cache invalidation tags (surrogate keys) purge edge POPs in <150ms upon speaker grounding updates.',
        aiLine2: 'Subsequent inference requests immediately fetch fresh context without stale response bleed.',
        aiConfidence: 0.89,
        aiStatus: 'READY' as const,
        upvotes: 14,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.65,
        minutesAgo: 5,
      },
      {
        id: 'q-demo-5',
        segmentId: 'seg-4',
        segmentTitle: 'Zero-Hallucination Grounding with Dynamic Vector Contexts',
        speakerName: 'Dr. Elena Rostova',
        authorName: 'Sarah Lin',
        isAnonymous: false,
        content: 'Pre-submitting for Elena: What is the optimal chunking window for real-time live speaker transcripts in dynamic RAG?',
        category: 'Grounding',
        aiLine1: 'A rolling 300-token semantic chunk window with 50-token overlap balances low-latency lookup with contextual completeness.',
        aiLine2: 'Dynamic hybrid ranking filters noise from spoken speech before LLM injection.',
        aiConfidence: 0.91,
        aiStatus: 'READY' as const,
        upvotes: 9,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.78,
        minutesAgo: 3,
      },
    ];

    for (const qData of demoQuestions) {
      const qTime = new Date(now - 1000 * 60 * qData.minutesAgo).toISOString();
      const question: Question = {
        id: qData.id,
        sessionId: keynoteSession.id,
        seriesId: seriesNext26.id,
        segmentId: qData.segmentId,
        segmentTitle: qData.segmentTitle,
        speakerName: qData.speakerName,
        clientFingerprint: `fp-${qData.authorName.toLowerCase().replace(/\s+/g, '-')}`,
        authorName: qData.authorName,
        isAnonymous: qData.isAnonymous,
        content: qData.content,
        category: qData.category,
        aiLine1: qData.aiLine1,
        aiLine2: qData.aiLine2,
        aiConfidence: qData.aiConfidence,
        aiStatus: qData.aiStatus || 'IDLE',
        upvotes: qData.upvotes,
        isSpam: qData.isSpam,
        status: qData.status,
        sentimentScore: qData.sentimentScore,
        createdAt: qTime,
        updatedAt: qTime,
      };

      this.questions.set(question.id, question);
      this.sessionQuestions.get(defaultCode)!.push(question.id);
    }

    // =========================================================================
    // Seed NVIDIA GTC 2026 Keynote & Workshop Series (Code: NVIDIA)
    // =========================================================================
    const nvidiaCode = 'NVIDIA';
    const nvidiaSegments: Segment[] = [
      {
        id: 'seg-nv-1',
        seriesId: 'series-nvidia',
        title: 'Keynote: Blackwell Architecture & The Next Computing Era',
        speakerName: 'Jensen Huang',
        speakerRole: 'Founder & CEO, NVIDIA',
        speakerBio: 'Pioneering accelerated computing, modern AI hardware architecture, and physical AI foundation models.',
        speakerAvatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'LIVE',
        state: 'LIVE',
        startTime: '09:00',
        scheduledStart: new Date(now - 1000 * 60 * 20).toISOString(),
        scheduledDurationMinutes: 60,
        durationMinutes: 60,
        actualStartTime: new Date(now - 1000 * 60 * 18).toISOString(),
        actualStart: new Date(now - 1000 * 60 * 18).toISOString(),
        order: 1,
        adminToken: 'speaker_token_jensen',
        graceWindowMinutes: 15,
        categories: ['Blackwell', 'Generative AI', 'NVLink', 'Inference', 'Physical AI'],
        groundingContext: `Jensen Huang Keynote Context:
- NVIDIA Blackwell B200 GPU: 208 billion transistors manufactured using custom 4NP TSMC process with dual-die design.
- Second-Generation Transformer Engine: Supports FP4 precision with micro-tensor scaling, delivering 20 petaflops of FP4 AI compute.
- NVLink 5 Interconnect: 1.8TB/s bidirectional throughput per GPU, scaling up to 576 GPUs in a single NVLink domain.
- GB200 NVL72: Liquid-cooled rack-scale system with 72 Blackwell GPUs and 36 Grace CPUs functioning as a unified 30TB shared-memory engine.
- Real-Time Live Audience Interaction: Connected to AskQlive platform at askqa-live.ai.studio with real-time speaker teleprompting.`,
      },
      {
        id: 'seg-nv-2',
        seriesId: 'series-nvidia',
        title: 'NVIDIA NIM Microservices: Scalable Enterprise Inference',
        speakerName: 'Ian Buck',
        speakerRole: 'VP of Hyperscale & HPC Computing',
        speakerBio: 'Creator of CUDA and architect of NVIDIA hyperscale inference microservices and acceleration libraries.',
        speakerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '10:15',
        scheduledStart: new Date(now + 1000 * 60 * 45).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 2,
        adminToken: 'speaker_token_ian',
        graceWindowMinutes: 10,
        categories: ['NIM Microservices', 'CUDA', 'TensorRT-LLM', 'Enterprise AI'],
        groundingContext: `Ian Buck - NIM Architecture Context:
- NVIDIA NIM: Pre-built, optimized inference containers supporting open models (Llama 3, Gemma, Mistral) and multimodal foundation models.
- Low-Latency Optimization: Integrates TensorRT-LLM, speculative decoding, and continuous batching with paged KV-cache sharing.
- Enterprise Portability: Standardized OCI container distribution for on-prem DGX SuperPODs and multi-cloud Kubernetes clusters.`,
      },
      {
        id: 'seg-nv-3',
        seriesId: 'series-nvidia',
        title: 'Project GR00T & Omniverse: Physical AI & Humanoid Robotics',
        speakerName: 'Rev Lebaredian',
        speakerRole: 'VP of Omniverse and Simulation Technology',
        speakerBio: 'Leading the development of NVIDIA Omniverse, digital twin technologies, and humanoid robotics physics simulation.',
        speakerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '11:15',
        scheduledStart: new Date(now + 1000 * 60 * 95).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 3,
        adminToken: 'speaker_token_rev',
        graceWindowMinutes: 10,
        categories: ['Omniverse', 'Robotics', 'GR00T', 'Digital Twins', 'PhysX'],
        groundingContext: `Rev Lebaredian - Omniverse & GR00T Context:
- Project GR00T: General-purpose multimodal foundation model for humanoid robot embodiment and dexterous manipulation.
- Isaac Sim: Cloud-native physics simulation utilizing RTX neural rendering, sensor simulation, and real-time PhysX collision dynamics.
- Synthetic Data Generation: Photorealistic domain randomization for zero-shot real-world policy transfer.`,
      },
      {
        id: 'seg-nv-4',
        seriesId: 'series-nvidia',
        title: 'Executive Panel & Developer Roundtable: Accelerated Computing Systems',
        speakerName: 'Jensen Huang & Engineering Leadership',
        speakerRole: 'Panel Moderator: Tiernan Ray, Technology Analyst',
        speakerBio: 'Open 45-minute interactive panel answering top audience questions across hardware, software, and physical AI.',
        speakerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        type: 'PANEL',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '12:15',
        scheduledStart: new Date(now + 1000 * 60 * 145).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 4,
        adminToken: 'speaker_token_nvidia_panel',
        graceWindowMinutes: 15,
        categories: ['Executive Strategy', 'Developer Q&A', 'Future of AI', 'Roundtable'],
        groundingContext: `Executive Roundtable Combined Context:
- Synthesizing themes from Blackwell Architecture, NIM Enterprise Deployment, and Omniverse Robotics Simulation.
- Live audience inquiries prioritized via AskQlive teleprompter scoring algorithm.`,
      },
    ];

    const seriesNvidia: Series = {
      id: 'series-nvidia',
      seriesCode: nvidiaCode,
      joinCode: nvidiaCode,
      title: 'NVIDIA GTC 2026: Accelerated Computing & Generative AI Keynote',
      description: 'Join Jensen Huang and NVIDIA engineering leadership for live Q&A on Blackwell architecture, NIM microservices, and physical AI.',
      contextData: `NVIDIA GTC 2026 General Keynote Context:
- Venue: SAP Center, San Jose & Global Live Broadcast
- Official Interactive Q&A: AskQlive live interactive engagement platform (askqa-live.ai.studio)
- Direct Join Code: NVIDIA`,
      seriesContextData: `NVIDIA GTC 2026 General Keynote Context:
- Venue: SAP Center, San Jose & Global Live Broadcast
- Official Interactive Q&A: AskQlive live interactive engagement platform (askqa-live.ai.studio)
- Direct Join Code: NVIDIA`,
      startDate: nowIso.split('T')[0],
      date: nowIso.split('T')[0],
      timezone: 'America/Los_Angeles',
      state: 'LIVE',
      organizerToken: 'organizer_secret_nvidia',
      autoAdvance: false,
      isActive: true,
      liveSegmentId: 'seg-nv-1',
      activeSegmentId: 'seg-nv-1',
      segmentIds: nvidiaSegments.map(s => s.id),
      segments: nvidiaSegments,
      settings: {
        autoAdvance: false,
        graceWindowMinutes: 10,
        allowPreSubmit: true,
        allowSpeakerSelfEnd: false,
        autoParkUnanswered: false,
        cascadeScheduleShift: true,
        defaultModerationSensitivity: 'BALANCED',
        allowAnonymous: true,
        maxQuestionsPerMinute: 5,
        maxQuestionsPerSeriesPerHour: 30,
        showCrossSegmentSimilarHint: true,
      },
      revision: 1,
      createdAt: new Date(now - 1000 * 60 * 120).toISOString(),
      updatedAt: nowIso,
    };

    this.series.set(nvidiaCode, seriesNvidia);
    this.sessionQuestions.set(nvidiaCode, []);
    this.participants.set(nvidiaCode, new Map());
    this.seriesParticipants.set(nvidiaCode, new Map());
    this.auditLogs.set(nvidiaCode, []);

    const keynoteNvidiaSession: Session = {
      id: 'session-nvidia',
      joinCode: nvidiaCode,
      adminToken: 'organizer_secret_nvidia',
      title: nvidiaSegments[0].title,
      description: seriesNvidia.description,
      contextData: nvidiaSegments[0].groundingContext,
      isActive: true,
      createdAt: seriesNvidia.createdAt,
      categories: nvidiaSegments[0].categories,
      seriesId: seriesNvidia.id,
      seriesCode: nvidiaCode,
      segmentId: nvidiaSegments[0].id,
      settings: {
        moderationSensitivity: 'BALANCED',
        autoAiAnswers: true,
        allowAnonymous: true,
        maxQuestionsPerMinute: 5,
      },
    };
    this.sessions.set(nvidiaCode, keynoteNvidiaSession);

    nvidiaSegments.forEach((seg, idx) => {
      const backingCode = `${nvidiaCode}-S${idx + 1}`;
      const backingSession: Session = {
        id: 'session-' + seg.id,
        joinCode: backingCode,
        adminToken: seg.adminToken,
        title: seg.title,
        description: seg.speakerBio,
        contextData: seg.groundingContext,
        isActive: seg.state === 'LIVE',
        createdAt: seriesNvidia.createdAt,
        categories: seg.categories,
        seriesId: seriesNvidia.id,
        seriesCode: nvidiaCode,
        order: idx + 1,
        segmentType: seg.type,
        state: seg.state,
        speaker: seg.speaker,
        talkTitle: seg.talkTitle,
        scheduledStart: seg.scheduledStart,
        durationMinutes: seg.durationMinutes,
        segmentId: seg.id,
        settings: {
          moderationSensitivity: 'BALANCED',
          autoAiAnswers: true,
          allowAnonymous: true,
          maxQuestionsPerMinute: 5,
        },
      };
      this.sessions.set(backingCode, backingSession);
      this.sessionQuestions.set(backingCode, []);
    });

    const nvidiaDemoQuestions = [
      {
        id: 'q-nv-1',
        segmentId: 'seg-nv-1',
        segmentTitle: 'Keynote: Blackwell Architecture & The Next Computing Era',
        speakerName: 'Jensen Huang',
        authorName: 'Marcus Vance',
        isAnonymous: false,
        content: 'How does the NVLink 5 interconnect in GB200 NVL72 eliminate communication bottlenecks during inference of multi-trillion parameter mixture-of-experts (MoE) models?',
        category: 'NVLink',
        aiLine1: 'NVLink 5 provides 1.8TB/s bidirectional bandwidth per GPU, allowing 72 Blackwell GPUs in GB200 NVL72 to operate as a unified 30TB coherent memory domain.',
        aiLine2: 'All-to-all expert routing executes at wire speed across copper backplanes, bypassing slower network interfaces entirely.',
        aiConfidence: 0.98,
        aiStatus: 'READY' as const,
        upvotes: 68,
        isSpam: false,
        status: 'ANSWERING' as QuestionStatus,
        sentimentScore: 0.88,
        minutesAgo: 15,
      },
      {
        id: 'q-nv-2',
        segmentId: 'seg-nv-1',
        segmentTitle: 'Keynote: Blackwell Architecture & The Next Computing Era',
        speakerName: 'Jensen Huang',
        authorName: 'Dr. Elena Rostova',
        isAnonymous: false,
        content: 'What quantization innovations enable FP4 precision on Blackwell Tensor Cores without degrading perplexity in complex coding and mathematical reasoning benchmarks?',
        category: 'Blackwell',
        aiLine1: 'Blackwell introduces a 2nd-gen Transformer Engine with micro-tensor scaling and dynamic block floating-point representation.',
        aiLine2: 'This preserves numerical precision across activation outliers, matching FP8 perplexity while delivering 2x higher token throughput.',
        aiConfidence: 0.96,
        aiStatus: 'READY' as const,
        upvotes: 52,
        isSpam: false,
        status: 'ANSWERED' as QuestionStatus,
        sentimentScore: 0.92,
        minutesAgo: 10,
      },
      {
        id: 'q-nv-3',
        segmentId: 'seg-nv-2',
        segmentTitle: 'NVIDIA NIM Microservices: Scalable Enterprise Inference',
        speakerName: 'Ian Buck',
        authorName: 'Kenji Sato',
        isAnonymous: true,
        content: 'How do NVIDIA NIM microservices coordinate KV-cache offloading and speculative decoding across heterogeneous clusters of H100 and B200 GPUs?',
        category: 'NIM Microservices',
        aiLine1: 'NIM abstracts inference execution through standardized OpenAI-compatible APIs backed by dynamic TensorRT-LLM runtimes.',
        aiLine2: 'Distributed KV-cache sharing and chunked prefill dynamically route draft and target verification phases across available hardware.',
        aiConfidence: 0.94,
        aiStatus: 'READY' as const,
        upvotes: 39,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.79,
        minutesAgo: 7,
      },
      {
        id: 'q-nv-4',
        segmentId: 'seg-nv-3',
        segmentTitle: 'Project GR00T & Omniverse: Physical AI & Humanoid Robotics',
        speakerName: 'Rev Lebaredian',
        authorName: 'Sarah Lin',
        isAnonymous: false,
        content: 'Pre-submitting for Rev: What fidelity benchmarks must Isaac Sim meet in Omniverse before synthetic simulation policies transfer successfully to physical humanoid robots?',
        category: 'Robotics',
        aiLine1: 'Isaac Sim uses RTX neural rendering and PhysX 5 to simulate multi-sensor RGB-D, tactile, and IMU feedback with extreme domain randomization.',
        aiLine2: 'Zero-shot sim-to-real transfer achieves over 92% success on dexterous manipulation without physical world fine-tuning.',
        aiConfidence: 0.93,
        aiStatus: 'READY' as const,
        upvotes: 27,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.85,
        minutesAgo: 4,
      },
    ];

    for (const qData of nvidiaDemoQuestions) {
      const qTime = new Date(now - 1000 * 60 * qData.minutesAgo).toISOString();
      const question: Question = {
        id: qData.id,
        sessionId: keynoteNvidiaSession.id,
        seriesId: seriesNvidia.id,
        segmentId: qData.segmentId,
        segmentTitle: qData.segmentTitle,
        speakerName: qData.speakerName,
        clientFingerprint: `fp-${qData.authorName.toLowerCase().replace(/\s+/g, '-')}`,
        authorName: qData.authorName,
        isAnonymous: qData.isAnonymous,
        content: qData.content,
        category: qData.category,
        aiLine1: qData.aiLine1,
        aiLine2: qData.aiLine2,
        aiConfidence: qData.aiConfidence,
        aiStatus: qData.aiStatus || 'IDLE',
        upvotes: qData.upvotes,
        isSpam: qData.isSpam,
        status: qData.status,
        sentimentScore: qData.sentimentScore,
        createdAt: qTime,
        updatedAt: qTime,
      };

      this.questions.set(question.id, question);
      this.sessionQuestions.get(nvidiaCode)!.push(question.id);
    }

    // =========================================================================
    // Seed Google Developer Groups Live Global Summit & Q&A (Code: GDGLIVE)
    // =========================================================================
    const gdgCode = 'GDGLIVE';
    const gdgSegments: Segment[] = [
      {
        id: 'seg-gdg-1',
        seriesId: 'series-gdglive',
        title: 'Keynote: Agentic AI Systems with Google AI Studio & Gemini 2.5',
        speakerName: 'Sarah Chen',
        speakerRole: 'Google Developer Expert & AI Architect',
        speakerBio: 'Leading developer education on multi-agent architectures, function calling with Gemini 2.5 Flash, and real-time live voice grounding.',
        speakerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'LIVE',
        state: 'LIVE',
        startTime: '09:30',
        scheduledStart: new Date(now - 1000 * 60 * 25).toISOString(),
        scheduledDurationMinutes: 50,
        durationMinutes: 50,
        actualStartTime: new Date(now - 1000 * 60 * 22).toISOString(),
        actualStart: new Date(now - 1000 * 60 * 22).toISOString(),
        order: 1,
        adminToken: 'speaker_token_gdg_sarah',
        graceWindowMinutes: 15,
        categories: ['Gemini 2.5', 'Agentic AI', 'Google AI Studio', 'Live Q&A', 'Grounding'],
        groundingContext: `Sarah Chen Keynote Context for GDG Live 2026:
- Google AI Studio: Rapid prototyping and deployment of agentic workflows with low-latency Gemini Flash and Pro models.
- AskQlive Platform: Built for live conference audiences at GDG events globally (askqa-live.ai.studio/?code=GDGLIVE).
- Sub-second inference: Real-time semantic deduplication, grounded RAG answers from speaker notes, and dynamic upvoting.
- Zero-Auth Attendance: Community members instantly join using URL ?code=GDGLIVE with no registration barrier.
- Speaker Teleprompter: Live confidence scoring that highlights high-velocity questions during the talk.`,
      },
      {
        id: 'seg-gdg-2',
        seriesId: 'series-gdglive',
        title: 'Modern Web Engineering: Angular 21, Zoneless & Signals',
        speakerName: 'Alex Rivera',
        speakerRole: 'Angular Core Contributor & GDE',
        speakerBio: 'Specializing in zoneless change detection, signal-based reactive state, and high-performance web components.',
        speakerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '10:30',
        scheduledStart: new Date(now + 1000 * 60 * 35).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 2,
        adminToken: 'speaker_token_gdg_alex',
        graceWindowMinutes: 10,
        categories: ['Angular 21', 'Zoneless', 'Signals', 'TypeScript', 'Performance'],
        groundingContext: `Alex Rivera Angular 21 Context:
- Angular 21 zoneless architecture eliminates Zone.js overhead for faster startup and smaller bundle sizes.
- Fine-grained signal primitives (computed, effect, linkedSignal) ensure sub-millisecond DOM reconciliation.
- Server-side rendering with Vite integration provides fast hydration and first contentful paint.`,
      },
      {
        id: 'seg-gdg-3',
        seriesId: 'series-gdglive',
        title: 'Production Scale: Serverless Cloud Run & Real-Time Sync',
        speakerName: 'Priya Patel',
        speakerRole: 'Google Cloud Principal Architect',
        speakerBio: 'Architecting distributed event-driven microservices, WebSocket clusters, and auto-scaling Cloud Run services.',
        speakerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        type: 'TALK',
        status: 'SCHEDULED',
        state: 'SCHEDULED',
        startTime: '11:30',
        scheduledStart: new Date(now + 1000 * 60 * 95).toISOString(),
        scheduledDurationMinutes: 45,
        durationMinutes: 45,
        order: 3,
        adminToken: 'speaker_token_gdg_priya',
        graceWindowMinutes: 10,
        categories: ['Cloud Run', 'GCP', 'WebSockets', 'Serverless', 'DevOps'],
        groundingContext: `Priya Patel Cloud Architecture Context:
- Cloud Run containers auto-scale to zero when idle and rapidly scale to handle thousands of concurrent attendees.
- Reverse proxy configurations forward WebSockets and HTTP traffic with sub-10ms proxy overhead.
- Multi-region deployment guarantees 99.99% availability for international developer summits.`,
      },
    ];

    const seriesGdgLive: Series = {
      id: 'series-gdglive',
      seriesCode: gdgCode,
      joinCode: gdgCode,
      title: 'GDG Live 2026: Google Developer Groups Global Summit & Live Q&A',
      description: 'Global community gathering for developers featuring live keynote Q&A, Gemini 2.5 agents, Angular 21 zoneless architectures, and cloud infrastructure.',
      contextData: `GDG Live 2026 Global Summit Context:
- Host: Google Developer Groups Global Community
- Event Link: https://askqa-live.ai.studio/?code=GDGLIVE
- Direct Join Code: GDGLIVE
- Features: Instant attendee entry via ?code=GDGLIVE, real-time AI grounded answers, multi-speaker schedule, teleprompter.`,
      seriesContextData: `GDG Live 2026 Global Summit Context:
- Host: Google Developer Groups Global Community
- Event Link: https://askqa-live.ai.studio/?code=GDGLIVE
- Direct Join Code: GDGLIVE
- Features: Instant attendee entry via ?code=GDGLIVE, real-time AI grounded answers, multi-speaker schedule, teleprompter.`,
      startDate: nowIso.split('T')[0],
      date: nowIso.split('T')[0],
      timezone: 'America/Los_Angeles',
      state: 'LIVE',
      organizerToken: 'organizer_secret_gdglive',
      autoAdvance: false,
      isActive: true,
      liveSegmentId: 'seg-gdg-1',
      activeSegmentId: 'seg-gdg-1',
      segmentIds: gdgSegments.map(s => s.id),
      segments: gdgSegments,
      settings: {
        autoAdvance: false,
        graceWindowMinutes: 10,
        allowPreSubmit: true,
        allowSpeakerSelfEnd: false,
        autoParkUnanswered: false,
        cascadeScheduleShift: true,
        defaultModerationSensitivity: 'BALANCED',
        allowAnonymous: true,
        maxQuestionsPerMinute: 5,
        maxQuestionsPerSeriesPerHour: 30,
        showCrossSegmentSimilarHint: true,
      },
      revision: 1,
      createdAt: new Date(now - 1000 * 60 * 90).toISOString(),
      updatedAt: nowIso,
    };

    this.series.set(gdgCode, seriesGdgLive);
    this.sessionQuestions.set(gdgCode, []);
    this.participants.set(gdgCode, new Map());
    this.seriesParticipants.set(gdgCode, new Map());
    this.auditLogs.set(gdgCode, []);

    const keynoteGdgSession: Session = {
      id: 'session-gdglive',
      joinCode: gdgCode,
      adminToken: 'organizer_secret_gdglive',
      title: gdgSegments[0].title,
      description: seriesGdgLive.description,
      contextData: gdgSegments[0].groundingContext,
      isActive: true,
      createdAt: seriesGdgLive.createdAt,
      categories: gdgSegments[0].categories,
      seriesId: seriesGdgLive.id,
      seriesCode: gdgCode,
      segmentId: gdgSegments[0].id,
      settings: {
        moderationSensitivity: 'BALANCED',
        autoAiAnswers: true,
        allowAnonymous: true,
        maxQuestionsPerMinute: 5,
      },
    };
    this.sessions.set(gdgCode, keynoteGdgSession);

    gdgSegments.forEach((seg, idx) => {
      const backingCode = `${gdgCode}-S${idx + 1}`;
      const backingSession: Session = {
        id: 'session-' + seg.id,
        joinCode: backingCode,
        adminToken: seg.adminToken,
        title: seg.title,
        description: seg.speakerBio,
        contextData: seg.groundingContext,
        isActive: seg.state === 'LIVE',
        createdAt: seriesGdgLive.createdAt,
        categories: seg.categories,
        seriesId: seriesGdgLive.id,
        seriesCode: gdgCode,
        order: idx + 1,
        segmentType: seg.type,
        state: seg.state,
        speaker: {
          name: seg.speakerName,
          title: seg.speakerRole,
          bio: seg.speakerBio,
          avatarUrl: seg.speakerAvatar,
        },
        talkTitle: seg.title,
        scheduledStart: seg.scheduledStart,
        durationMinutes: seg.durationMinutes,
        actualStart: seg.actualStart,
        segmentId: seg.id,
        settings: {
          moderationSensitivity: 'BALANCED',
          autoAiAnswers: true,
          allowAnonymous: true,
          maxQuestionsPerMinute: 5,
        },
      };
      this.sessions.set(backingCode, backingSession);
      this.sessionQuestions.set(backingCode, []);
    });

    const gdgDemoQuestions = [
      {
        id: 'q-gdg-1',
        segmentId: 'seg-gdg-1',
        segmentTitle: 'Keynote: Agentic AI Systems with Google AI Studio & Gemini 2.5',
        speakerName: 'Sarah Chen',
        authorName: 'Marcus Wong',
        isAnonymous: false,
        content: 'When deploying Gemini 2.5 Flash agents with function calling, what strategy best balances real-time streaming tokens with schema-validated tool executions?',
        category: 'Gemini 2.5',
        aiLine1: 'Stream intermediate thoughts to the client UI while buffering tool call parameters until the structured arguments block completes validation.',
        aiLine2: 'Executing tool calls server-side in parallel threads keeps UI latency below 350ms.',
        aiConfidence: 0.97,
        aiStatus: 'READY' as const,
        upvotes: 46,
        isSpam: false,
        status: 'ANSWERING' as QuestionStatus,
        sentimentScore: 0.91,
        minutesAgo: 12,
      },
      {
        id: 'q-gdg-2',
        segmentId: 'seg-gdg-1',
        segmentTitle: 'Keynote: Agentic AI Systems with Google AI Studio & Gemini 2.5',
        speakerName: 'Sarah Chen',
        authorName: 'Elena Rostova',
        isAnonymous: false,
        content: 'Can audience members share direct event join links like askqa-live.ai.studio/?code=GDGLIVE so attendees skip all room code entry?',
        category: 'Live Q&A',
        aiLine1: 'Yes, visiting askqa-live.ai.studio/?code=GDGLIVE automatically extracts the code and joins attendees directly with zero authentication barriers.',
        aiLine2: 'The URL code pre-fills the input field and enters the interactive live question queue instantly.',
        aiConfidence: 0.99,
        aiStatus: 'READY' as const,
        upvotes: 38,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.95,
        minutesAgo: 8,
      },
      {
        id: 'q-gdg-3',
        segmentId: 'seg-gdg-2',
        segmentTitle: 'Modern Web Engineering: Angular 21, Zoneless & Signals',
        speakerName: 'Alex Rivera',
        authorName: 'Carlos Gomez',
        isAnonymous: true,
        content: 'What is the performance delta when migrating a legacy Angular app using Zone.js to Angular 21 pure signals with OnPush change detection?',
        category: 'Angular 21',
        aiLine1: 'Benchmarks show 40% reduction in initial bundle footprint and up to 3x reduction in runtime micro-task churn.',
        aiLine2: 'Signal graphs only trigger re-rendering for components directly dependent on the mutated signal node.',
        aiConfidence: 0.94,
        aiStatus: 'READY' as const,
        upvotes: 29,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.88,
        minutesAgo: 5,
      },
      {
        id: 'q-gdg-4',
        segmentId: 'seg-gdg-3',
        segmentTitle: 'Production Scale: Serverless Cloud Run & Real-Time Sync',
        speakerName: 'Priya Patel',
        authorName: 'DevRel Community',
        isAnonymous: false,
        content: 'Pre-submitting for Priya: How do Cloud Run microVMs manage persistent WebSocket connections during background container scale-down?',
        category: 'Cloud Run',
        aiLine1: 'Cloud Run uses SIGTERM graceful shutdown hooks to drain active WebSocket connections before stopping containers.',
        aiLine2: 'Client clients automatically reconnect to active instances via DNS reverse proxy failover within 500ms.',
        aiConfidence: 0.92,
        aiStatus: 'READY' as const,
        upvotes: 19,
        isSpam: false,
        status: 'APPROVED' as QuestionStatus,
        sentimentScore: 0.86,
        minutesAgo: 2,
      },
    ];

    for (const qData of gdgDemoQuestions) {
      const qTime = new Date(now - 1000 * 60 * qData.minutesAgo).toISOString();
      const question: Question = {
        id: qData.id,
        sessionId: keynoteGdgSession.id,
        seriesId: seriesGdgLive.id,
        segmentId: qData.segmentId,
        segmentTitle: qData.segmentTitle,
        speakerName: qData.speakerName,
        clientFingerprint: `fp-${qData.authorName.toLowerCase().replace(/\s+/g, '-')}`,
        authorName: qData.authorName,
        isAnonymous: qData.isAnonymous,
        content: qData.content,
        category: qData.category,
        aiLine1: qData.aiLine1,
        aiLine2: qData.aiLine2,
        aiConfidence: qData.aiConfidence,
        aiStatus: qData.aiStatus || 'IDLE',
        upvotes: qData.upvotes,
        isSpam: qData.isSpam,
        status: qData.status,
        sentimentScore: qData.sentimentScore,
        createdAt: qTime,
        updatedAt: qTime,
      };

      this.questions.set(question.id, question);
      this.sessionQuestions.get(gdgCode)!.push(question.id);
    }
  }

  public async generateQuestionRagAnswer(joinCode: string, questionId: string): Promise<Question | null> {
    const q = this.questions.get(questionId);
    if (!q) return null;

    const series = this.getSeries(joinCode);
    const session = this.getSession(joinCode);
    const targetSegment = series?.segments.find(s => s.id === q.segmentId) ||
                          series?.segments.find(s => s.id === series.activeSegmentId) ||
                          series?.segments[0];

    q.aiStatus = 'GENERATING';
    const eventContext = series?.contextData || series?.seriesContextData || '';
    const speakerContext = targetSegment?.groundingContext || targetSegment?.contextData || session?.contextData || '';
    const speakerHeader = targetSegment?.speakerName ? `Speaker: ${targetSegment.speakerName} (${targetSegment.title})` : '';
    const mergedGrounding = [speakerHeader, speakerContext, eventContext].filter(Boolean).join('\n\n').substring(0, 10000);

    try {
      const aiResult = await generateTwoLineAnswer(q.content, mergedGrounding);
      q.aiLine1 = aiResult.firstLine;
      q.aiLine2 = aiResult.secondLine;
      q.aiConfidence = aiResult.confidenceScore;
      q.aiStatus = 'READY';
      q.updatedAt = new Date().toISOString();
      return q;
    } catch (err) {
      console.error('Manual RAG generation error:', err);
      q.aiStatus = 'FAILED';
      return q;
    }
  }
}

function newQuestionLine(q: Question, aiResult: { firstLine: string; secondLine: string; confidenceScore: number }) {
  q.aiLine1 = aiResult.firstLine;
  q.aiLine2 = aiResult.secondLine;
  q.aiConfidence = aiResult.confidenceScore;
  q.aiStatus = 'READY';
  q.updatedAt = new Date().toISOString();
}

export const qaStore = new QaStore(true);
