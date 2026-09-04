import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Session,
  SessionSettings,
  Question,
  TelemetryMetrics,
  WordFrequency,
  QuestionStatus,
  PostSessionReport,
  SessionSeries,
  Segment,
  UserRole,
  UserAccessInfo,
  SeriesReport,
  HostedSessionRecord,
  ActiveLiveRoomPreview,
} from '../models/qa.models';
import { FirebaseService } from './firebase.service';

@Injectable({
  providedIn: 'root',
})
export class QaService {
  public firebaseService = inject(FirebaseService);

  // Core reactive signals
  public currentSession = signal<Session | null>(null);
  public currentSeries = signal<SessionSeries | null>(null);
  public questions = signal<Question[]>([]);
  public userUpvotedIds = signal<Set<string>>(new Set());
  public telemetry = signal<TelemetryMetrics | null>(null);
  public wordCloudData = signal<WordFrequency[]>([]);
  public teleprompterQuestions = signal<Question[]>([]);

  // Featured / Active Live Room for 1-click Join (No code needed!)
  public activeLiveRoom = signal<ActiveLiveRoomPreview | null>(null);

  // Past hosted sessions history
  public hostedSessions = signal<HostedSessionRecord[]>([]);

  // Universal Share QR & Link modal state
  public shareModalData = signal<{
    joinCode: string;
    title: string;
    type?: 'single' | 'series';
    description?: string;
  } | null>(null);

  // User identity & Role signals (FR-SEC-1, FR-SEC-2)
  public userFingerprint = signal<string>('');
  public userName = signal<string>('');
  public userRole = signal<UserRole>('attendee');
  public userAuthToken = signal<string | null>(null);
  public userAuthScope = signal<string[]>([]);
  public speakerSegmentId = signal<string | null>(null);

  // Derived role signals (Server-verified, NEVER client toggle)
  public isAdmin = computed(() => this.userRole() === 'organizer' || this.userRole() === 'moderator');
  public isOrganizer = computed(() => this.userRole() === 'organizer');
  public isSpeaker = computed(() => this.userRole() === 'speaker');
  public isStaff = computed(() => this.userRole() === 'organizer' || this.userRole() === 'speaker' || this.userRole() === 'moderator');

  public isLoading = signal<boolean>(false);
  public errorMessage = signal<string | null>(null);
  public successMessage = signal<string | null>(null);

  // Deep-link URL Room Code Detection & Auto-Join
  public autoJoinCode = signal<string | null>(null);
  public isAutoJoiningFromUrl = signal<boolean>(false);

  // Top-level View navigation when outside an active session ('join' | 'auth' | 'host-studio')
  public currentView = signal<'join' | 'auth' | 'host-studio'>('join');

  // Navigation & filtering signals
  public activeTab = signal<
    'feed' | 'lobby' | 'series-control' | 'teleprompter' | 'analytics' | 'moderation' | 'grounding' | 'report' | 'schedule'
  >('feed');
  public filterCategory = signal<string>('ALL');
  public filterStatus = signal<string>('ALL');
  public selectedSegmentFilter = signal<string>('ALL'); // 'ALL' or specific segmentId
  public searchQuery = signal<string>('');
  public sortBy = signal<'popular' | 'trending' | 'recent' | 'top'>('popular');

  // Translations cache: `${questionId}:${lang}` -> { line1: string, line2: string }
  public translations = signal<Map<string, { line1: string; line2: string }>>(new Map());

  // Active segment computed
  public activeSegment = computed<Segment | null>(() => {
    const series = this.currentSeries();
    if (!series) return null;
    if (series.activeSegmentId) {
      return series.segments.find(s => s.id === series.activeSegmentId) || null;
    }
    return series.segments.find(s => s.status === 'LIVE') || null;
  });

  // Segments list sorted by order
  public segments = computed<Segment[]>(() => {
    const series = this.currentSeries();
    if (!series || !series.segments) return [];
    return [...series.segments].sort((a, b) => a.order - b.order);
  });

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initUserIdentity();
    this.checkUrlForTokens();
    this.loadHostedSessionHistory();
    this.fetchActiveLiveRoom();
  }

  private initUserIdentity(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      let fp = localStorage.getItem('live_qa_fingerprint');
      if (!fp) {
        fp = 'fp-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
        localStorage.setItem('live_qa_fingerprint', fp);
      }
      this.userFingerprint.set(fp);

      const savedName = localStorage.getItem('live_qa_username');
      if (savedName) {
        this.userName.set(savedName);
      }

      const savedToken = localStorage.getItem('live_qa_auth_token');
      if (savedToken) {
        this.userAuthToken.set(savedToken);
      }
    } else {
      this.userFingerprint.set('fp-guest-' + Math.random().toString(36).substring(2, 8));
    }
  }

  // Extract event room code from full URL (?code=..., ?room=..., #/?code=..., hash routes, etc.)
  public extractUrlCode(): string | null {
    if (typeof window === 'undefined' || !window.location) return null;
    try {
      const fullHref = window.location.href;

      // 1. Direct searchParams on window.location.search (e.g. ?code=GDGLIVE)
      const searchParams = new URLSearchParams(window.location.search);
      let rawCode =
        searchParams.get('code') ||
        searchParams.get('join') ||
        searchParams.get('room') ||
        searchParams.get('session') ||
        searchParams.get('joinCode') ||
        searchParams.get('series');

      // 2. Query parameters inside hash (e.g. #/?code=GDGLIVE or #/join?code=GDGLIVE)
      if (!rawCode && window.location.hash) {
        const hash = window.location.hash;
        const qIndex = hash.indexOf('?');
        if (qIndex !== -1) {
          const hashParams = new URLSearchParams(hash.substring(qIndex + 1));
          rawCode =
            hashParams.get('code') ||
            hashParams.get('join') ||
            hashParams.get('room') ||
            hashParams.get('session') ||
            hashParams.get('joinCode') ||
            hashParams.get('series');
        }

        // 3. Regex match for ?code=... or &code=... in full URL
        if (!rawCode) {
          const match =
            fullHref.match(/[?&#]code=([A-Za-z0-9_-]+)/i) ||
            fullHref.match(/[?&#]room=([A-Za-z0-9_-]+)/i) ||
            fullHref.match(/[?&#]join=([A-Za-z0-9_-]+)/i) ||
            fullHref.match(/[?&#]session=([A-Za-z0-9_-]+)/i);
          if (match && match[1]) {
            rawCode = match[1];
          }
        }

        // 4. Check direct hash route segment like #GDGLIVE or #/GDGLIVE
        if (!rawCode) {
          const cleanHash = hash.replace(/^#\/?/, '').trim();
          const reserved = [
            'JOIN',
            'AUTH',
            'HOST-STUDIO',
            'FEED',
            'ANALYTICS',
            'TELEPROMPTER',
            'MODERATION',
            'GROUNDING',
            'REPORT',
            'SCHEDULE',
            'LOBBY',
          ];
          if (
            cleanHash &&
            !cleanHash.includes('?') &&
            !cleanHash.includes('/') &&
            !cleanHash.includes('&')
          ) {
            const upper = cleanHash.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
            if (upper.length >= 2 && upper.length <= 16 && !reserved.includes(upper)) {
              rawCode = upper;
            }
          }
        }
      }

      // 5. Check window.location.pathname e.g. /room/GDGLIVE or /series/GDGLIVE
      if (!rawCode && window.location.pathname) {
        const pathMatch = window.location.pathname.match(
          /\/(?:room|series|code|session)\/([A-Za-z0-9_-]+)/i
        );
        if (pathMatch && pathMatch[1]) {
          rawCode = pathMatch[1];
        }
      }

      if (rawCode && rawCode.trim()) {
        const clean = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (clean.length >= 2 && clean.length <= 16) {
          return clean;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  // Detect ?token=... or ?code=... in URL and trigger zero-friction auto-join
  private checkUrlForTokens(): void {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        this.userAuthToken.set(urlToken);
        localStorage.setItem('live_qa_auth_token', urlToken);
      }

      const detectedCode = this.extractUrlCode();
      if (detectedCode) {
        this.autoJoinCode.set(detectedCode);
        this.isAutoJoiningFromUrl.set(true);
        // Ensure attendee role
        this.userRole.set('attendee');
        this.userAuthToken.set(null);
        // Automatically join the session
        setTimeout(() => {
          this.joinSession(detectedCode, this.userName() || 'Attendee')
            .then((success) => {
              this.isAutoJoiningFromUrl.set(false);
              if (success) {
                this.showToast(`Entered Event Room #${detectedCode}`);
              }
            })
            .catch(() => {
              this.isAutoJoiningFromUrl.set(false);
            });
        }, 80);
      }
    }
  }

  // Computed filtered questions
  public filteredQuestions = computed(() => {
    const list = this.questions();
    const cat = this.filterCategory();
    const status = this.filterStatus();
    const segFilter = this.selectedSegmentFilter();
    const search = this.searchQuery().toLowerCase().trim();
    const sort = this.sortBy();
    const userFp = this.userFingerprint();
    const upvoted = this.userUpvotedIds();

    let result = list.filter(q => {
      // Do not show rejected or spam unless viewing in moderation tab
      if (this.activeTab() !== 'moderation') {
        if (q.status === 'REJECTED' || (q.status === 'PENDING_REVIEW' && q.clientFingerprint !== userFp)) {
          return false;
        }
      }

      // Segment filtering
      if (segFilter !== 'ALL') {
        if (q.segmentId !== segFilter) return false;
      }

      if (cat !== 'ALL' && q.category !== cat) return false;

      if (status === 'MY_QUESTIONS') {
        if (q.clientFingerprint !== userFp) return false;
      } else if (status === 'UPVOTED') {
        if (!upvoted.has(q.id)) return false;
      } else if (status === 'AI_ANSWERED') {
        if (!q.aiLine1 || q.aiStatus !== 'READY') return false;
      } else if (status !== 'ALL' && q.status !== status) {
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

    // Sorting: Popularity (highest thumbs-up votes), Recent, or Trending
    if (sort === 'popular' || sort === 'top') {
      result = [...result].sort((a, b) => {
        // Keep live answering question in active spotlight
        if (a.status === 'ANSWERING' && b.status !== 'ANSWERING') return -1;
        if (b.status === 'ANSWERING' && a.status !== 'ANSWERING') return 1;
        // Primary criterion: highest upvotes/thumbs-up first
        if (b.upvotes !== a.upvotes) {
          return b.upvotes - a.upvotes;
        }
        // Tie-breaker: newest question first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } else if (sort === 'recent') {
      result = [...result].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else {
      // Trending: prioritizes upvotes + recency momentum
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
  });

  public pendingModerationQuestions = computed(() => {
    return this.questions().filter(q => q.status === 'PENDING_REVIEW' || q.isSpam);
  });

  // Top prioritized popular questions
  public topPrioritizedQuestions = computed(() => {
    return this.questions()
      .filter(q => (q.status === 'APPROVED' || q.status === 'ANSWERING') && q.upvotes > 0)
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, 3);
  });

  // ==========================================
  // Role Authentication (FR-SEC-1, FR-SEC-2)
  // ==========================================

  public async authenticateRole(token: string): Promise<UserAccessInfo> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return { role: 'attendee', scope: [] };

    try {
      const res = await fetch(`/api/sessions/${code}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      const authInfo: UserAccessInfo = await res.json();
      this.userRole.set(authInfo.role);
      this.userAuthScope.set(authInfo.scope || []);
      this.userAuthToken.set(token.trim());
      if (authInfo.segmentId) {
        this.speakerSegmentId.set(authInfo.segmentId);
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('live_qa_auth_token', token.trim());
      }

      if (authInfo.role === 'organizer') {
        this.showToast('Authenticated as Event Organizer. Control room enabled.');
      } else if (authInfo.role === 'speaker') {
        this.showToast('Authenticated as Speaker. Speaker green room enabled.');
      } else {
        this.showToast('Switched to Attendee view.');
      }

      return authInfo;
    } catch (err) {
      console.error('Auth verification failed:', err);
      return { role: 'attendee', scope: [] };
    }
  }

  public logoutRole(): void {
    this.userRole.set('attendee');
    this.userAuthToken.set(null);
    this.userAuthScope.set([]);
    this.speakerSegmentId.set(null);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('live_qa_auth_token');
    }
    this.showToast('Switched to Attendee view.');
  }

  // ==========================================
  // Host Past Session History & Sharing
  // ==========================================

  public loadHostedSessionHistory(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const stored = localStorage.getItem('live_qa_hosted_sessions_history');
      if (stored) {
        const parsed: HostedSessionRecord[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.hostedSessions.set(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load hosted session history from localStorage:', e);
    }
  }

  public saveHostedSession(record: {
    joinCode: string;
    title: string;
    description?: string;
    type: 'single' | 'series';
    adminToken?: string;
    status?: 'ACTIVE' | 'CONCLUDED' | 'SCHEDULED';
    segmentCount?: number;
    questionCount?: number;
  }): void {
    const code = record.joinCode.toUpperCase().trim();
    const current = this.hostedSessions();
    const existingIndex = current.findIndex(s => s.joinCode === code);
    const now = new Date().toISOString();

    let updated: HostedSessionRecord[];
    if (existingIndex >= 0) {
      const existing = current[existingIndex];
      const merged: HostedSessionRecord = {
        ...existing,
        ...record,
        id: code,
        joinCode: code,
        title: record.title || existing.title,
        description: record.description !== undefined ? record.description : existing.description,
        type: record.type || existing.type,
        adminToken: record.adminToken || existing.adminToken,
        status: record.status || existing.status || 'ACTIVE',
        lastAccessedAt: now,
        segmentCount: record.segmentCount !== undefined ? record.segmentCount : existing.segmentCount,
        questionCount: record.questionCount !== undefined ? record.questionCount : existing.questionCount,
      };
      updated = [merged, ...current.filter((_, i) => i !== existingIndex)];
    } else {
      const newEntry: HostedSessionRecord = {
        id: code,
        joinCode: code,
        title: record.title || `Session ${code}`,
        description: record.description || '',
        type: record.type || 'single',
        adminToken: record.adminToken || '',
        createdAt: now,
        lastAccessedAt: now,
        status: record.status || 'ACTIVE',
        segmentCount: record.segmentCount,
        questionCount: record.questionCount || 0,
      };
      updated = [newEntry, ...current];
    }

    this.hostedSessions.set(updated);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('live_qa_hosted_sessions_history', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save hosted sessions to localStorage:', e);
      }
    }
  }

  public removeHostedSession(joinCode: string): void {
    const code = joinCode.toUpperCase().trim();
    const filtered = this.hostedSessions().filter(s => s.joinCode !== code);
    this.hostedSessions.set(filtered);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('live_qa_hosted_sessions_history', JSON.stringify(filtered));
    }
    this.showToast(`Session #${code} removed from past session history.`);
  }

  public clearHostedSessions(): void {
    this.hostedSessions.set([]);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('live_qa_hosted_sessions_history');
    }
    this.showToast('Past session history cleared.');
  }

  public async reenterAsHost(record: HostedSessionRecord): Promise<boolean> {
    this.isLoading.set(true);
    const code = record.joinCode.toUpperCase().trim();

    // Store admin token in service and localStorage if present
    if (record.adminToken) {
      this.userAuthToken.set(record.adminToken);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('live_qa_auth_token', record.adminToken);
      }
    }

    try {
      const joined = await this.joinSession(code, this.userName() || 'Organizer');
      if (joined) {
        if (record.adminToken) {
          await this.authenticateRole(record.adminToken);
        } else {
          this.userRole.set('organizer');
        }

        // Bump lastAccessedAt in history
        this.saveHostedSession({
          joinCode: code,
          title: record.title,
          type: record.type,
          adminToken: record.adminToken,
          status: 'ACTIVE',
        });

        if (record.type === 'series') {
          this.activeTab.set('series-control');
        } else {
          this.activeTab.set('feed');
        }

        this.showToast(`Re-entered #${code} as Event Host.`);
        this.isLoading.set(false);
        return true;
      }
      this.isLoading.set(false);
      return false;
    } catch (err: unknown) {
      this.isLoading.set(false);
      const msg = err instanceof Error ? err.message : 'Could not re-enter session as host';
      this.errorMessage.set(msg);
      return false;
    }
  }

  // Universal Share QR & Link modal openers
  public openShareModal(joinCode: string, title?: string, type?: 'single' | 'series', description?: string): void {
    if (!joinCode) return;
    this.shareModalData.set({
      joinCode: joinCode.toUpperCase().trim(),
      title: title || `Session #${joinCode.toUpperCase().trim()}`,
      type: type || 'single',
      description: description || '',
    });
  }

  public closeShareModal(): void {
    this.shareModalData.set(null);
  }

  // ==========================================
  // Active Live Room Direct Discovery & 1-Click Join (No Code Needed!)
  // ==========================================

  public async fetchActiveLiveRoom(): Promise<ActiveLiveRoomPreview | null> {
    try {
      const res = await fetch('/api/live-room');
      if (res.ok) {
        const data: ActiveLiveRoomPreview = await res.json();
        this.activeLiveRoom.set(data);
        return data;
      }
    } catch {
      // Ignore network errors on initial boot
    }
    // Fallback default keynote room preview
    const fallback: ActiveLiveRoomPreview = {
      type: 'series',
      joinCode: 'NEXT26',
      title: 'Google Cloud Next 2026: Multimodal AI & Live Interaction Systems',
      description: 'Annual enterprise keynote on low-latency Gemini Flash inference and live grounded Q&A systems.',
      state: 'LIVE',
      activeSpeaker: 'Dr. Sundar Varma',
      activeSpeakerRole: 'VP of Machine Learning, Google DeepMind',
      activeTalk: 'Keynote: Multimodal AI & Live Interaction Systems',
      participantCount: 38,
      categories: ['Gemini AI', 'Architecture', 'Performance', 'Grounding', 'General'],
    };
    this.activeLiveRoom.set(fallback);
    return fallback;
  }

  /**
   * Direct 1-Click Join without entering any room code!
   * Attendees do NOT need authentication or room codes.
   */
  public async joinLiveRoomDirectly(opts?: { name?: string; email?: string; anonymous?: boolean }): Promise<boolean> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let room = this.activeLiveRoom();
    if (!room) {
      room = await this.fetchActiveLiveRoom();
    }
    const code = room?.joinCode || 'NEXT26';

    const attendeeName = opts?.anonymous
      ? 'Anonymous'
      : (opts?.name?.trim() || this.userName() || 'Attendee');

    // Ensure attendee role (Zero auth required)
    this.userRole.set('attendee');
    this.userAuthToken.set(null);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('live_qa_auth_token');
      if (opts?.name && !opts.anonymous) {
        localStorage.setItem('live_qa_username', opts.name.trim());
      }
    }

    const success = await this.joinSession(code, attendeeName);
    if (success) {
      this.activeTab.set('feed');
      this.showToast(`Joined Live Room #${code} as ${attendeeName}`);
    }
    this.isLoading.set(false);
    return success;
  }

  /**
   * Request Grounded RAG AI Answer for a specific question on demand
   */
  public async requestRagAnswer(questionId: string): Promise<Question | null> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.seriesCode || 'NEXT26';
    try {
      // Optimistic status update
      this.questions.update(items =>
        items.map(q => (q.id === questionId ? { ...q, aiStatus: 'GENERATING' } : q))
      );

      const res = await fetch(`/api/series/${code}/questions/${questionId}/rag-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          const updated: Question = data.question;
          this.questions.update(items =>
            items.map(q => (q.id === questionId ? { ...q, ...updated } : q))
          );
          this.showToast('Grounded RAG Answer synthesized!');
          return updated;
        }
      }
    } catch (err) {
      console.error('Failed to generate RAG answer:', err);
    }
    this.questions.update(items =>
      items.map(q => (q.id === questionId ? { ...q, aiStatus: 'FAILED' } : q))
    );
    return null;
  }

  // ==========================================
  // Join & Create Session Series
  // ==========================================

  public async joinSession(joinCode: string, name?: string): Promise<boolean> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const code = joinCode.toUpperCase().trim();

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = localStorage.getItem(`askqlive_upvoted_${code}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            this.userUpvotedIds.set(new Set(parsed));
          }
        }
      } catch {
        // ignore
      }
    }

    try {
      if (name) {
        this.userName.set(name);
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('live_qa_username', name);
        }
      }

      const res = await fetch(`/api/sessions/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprint: this.userFingerprint(),
          name: this.userName() || 'Attendee',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Session not found or invalid room code');
      }

      const data = await res.json();
      this.currentSession.set(data.session);

      // Also load Series metadata if available
      try {
        const seriesRes = await fetch(`/api/series/${code}`);
        if (seriesRes.ok) {
          const sData = await seriesRes.json();
          this.currentSeries.set(sData.series);
        }
      } catch {
        // Single session fallback
      }

      // Verify any saved token
      const existingToken = this.userAuthToken();
      if (existingToken) {
        await this.authenticateRole(existingToken);
      }

      // Initialize real-time Firestore listeners
      this.setupFirestoreListeners(code);

      await this.refreshSessionData();
      this.startPolling();
      this.isLoading.set(false);
      return true;
    } catch (err: unknown) {
      this.isLoading.set(false);
      const msg = err instanceof Error ? err.message : 'Failed to join session';
      this.errorMessage.set(msg);
      return false;
    }
  }

  public async createSession(payload: {
    title: string;
    customJoinCode?: string;
    contextData?: string;
    settings?: SessionSettings;
  }): Promise<Session | null> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const data = await res.json();
      const session: Session = data.session || data;
      this.currentSession.set(session);
      this.currentSeries.set(null);
      this.userRole.set('organizer');
      this.userAuthToken.set(session.adminToken);

      if (typeof window !== 'undefined' && window.localStorage && session.adminToken) {
        localStorage.setItem('live_qa_auth_token', session.adminToken);
      }

      // Record in Host Past Session History
      this.saveHostedSession({
        joinCode: session.joinCode,
        title: session.title,
        description: session.description,
        type: 'single',
        adminToken: session.adminToken,
        status: 'ACTIVE',
        questionCount: 0,
      });

      this.setupFirestoreListeners(session.joinCode);
      await this.refreshSessionData();
      this.startPolling();
      this.isLoading.set(false);
      this.showToast(`Session #${session.joinCode} launched successfully! You are the Presenter.`);
      return session;
    } catch (err: unknown) {
      this.isLoading.set(false);
      const msg = err instanceof Error ? err.message : 'Failed to create session';
      this.errorMessage.set(msg);
      return null;
    }
  }

  public async createSeries(payload: {
    title: string;
    description?: string;
    seriesContextData?: string;
    date?: string;
    timezone?: string;
    autoAdvance?: boolean;
    customJoinCode?: string;
    segments?: Partial<Segment>[];
  }): Promise<SessionSeries | null> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create workshop series');
      }

      const data = await res.json();
      const series: SessionSeries = data.series || data;
      this.currentSeries.set(series);
      this.userRole.set('organizer');
      this.userAuthToken.set(series.organizerToken);

      if (typeof window !== 'undefined' && window.localStorage && series.organizerToken) {
        localStorage.setItem('live_qa_auth_token', series.organizerToken);
      }

      // Also load synthetic session
      const sessionRes = await fetch(`/api/sessions/${series.joinCode}`);
      if (sessionRes.ok) {
        const sessData = await sessionRes.json();
        this.currentSession.set(sessData.session);
      }

      // Record in Host Past Session History
      this.saveHostedSession({
        joinCode: series.joinCode,
        title: series.title,
        description: series.description,
        type: 'series',
        adminToken: series.organizerToken,
        status: 'ACTIVE',
        segmentCount: series.segments?.length || 0,
        questionCount: 0,
      });

      this.setupFirestoreListeners(series.joinCode);
      await this.refreshSessionData();
      this.startPolling();
      this.isLoading.set(false);
      this.showToast('Workshop Series created! You are the Event Organizer.');
      return series;
    } catch (err: unknown) {
      this.isLoading.set(false);
      const msg = err instanceof Error ? err.message : 'Failed to create series';
      this.errorMessage.set(msg);
      return null;
    }
  }

  public async checkCodeAvailability(code: string): Promise<{ available: boolean; error?: string }> {
    const clean = code.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    if (!clean || clean.length < 3) {
      return { available: false, error: 'Code must be at least 3 characters' };
    }
    try {
      const res = await fetch(`/api/check-code/${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        return { available: !!data.available, error: data.error };
      }
      return { available: true };
    } catch {
      return { available: true };
    }
  }

  public async generateSuggestedCode(prefix = ''): Promise<string> {
    try {
      const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
      const res = await fetch(`/api/generate-code${query}`);
      if (res.ok) {
        const data = await res.json();
        if (data.code) return data.code;
      }
    } catch {
      // Fallback local random generator
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return (prefix || 'ROOM') + rand.slice(0, 4);
  }

  // Setup Firestore real-time snapshot listeners
  private setupFirestoreListeners(joinCode: string): void {
    this.firebaseService.clearListeners();

    this.firebaseService.listenToQuestions(joinCode, (firestoreQuestions) => {
      if (firestoreQuestions && firestoreQuestions.length > 0) {
        this.questions.set(firestoreQuestions);
      }
    });

    this.firebaseService.listenToSession(joinCode, (updatedSession) => {
      if (updatedSession) {
        this.currentSession.update(curr => curr ? { ...curr, ...updatedSession } : updatedSession);
      }
    });
  }

  public navigateToJoin(): void {
    this.currentView.set('join');
  }

  public navigateToAuth(): void {
    this.currentView.set('auth');
  }

  public navigateToHostStudio(): void {
    this.currentView.set('host-studio');
  }

  public leaveSession(): void {
    this.firebaseService.clearListeners();
    this.stopPolling();
    this.currentSession.set(null);
    this.currentSeries.set(null);
    this.questions.set([]);
    this.userUpvotedIds.set(new Set());
    this.telemetry.set(null);
    this.wordCloudData.set([]);
    this.teleprompterQuestions.set([]);
    this.activeTab.set('feed');
    this.currentView.set('join');
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      this.refreshSessionData(true);
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Refresh data
  public async refreshSessionData(silent = false): Promise<void> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return;

    try {
      const fp = this.userFingerprint();
      const segId = this.selectedSegmentFilter();
      const segQuery = segId && segId !== 'ALL' ? `&segmentId=${segId}` : '';

      const [questionsRes, telemetryRes, teleprompterRes, wordcloudRes, seriesRes] = await Promise.all([
        fetch(`/api/sessions/${code}/questions?fingerprint=${fp}${segQuery}`),
        fetch(`/api/sessions/${code}/telemetry?fingerprint=${fp}${segQuery}`),
        fetch(`/api/sessions/${code}/teleprompter?${segQuery}`),
        fetch(`/api/sessions/${code}/wordcloud?${segQuery}`),
        fetch(`/api/series/${code}`),
      ]);

      if (questionsRes.ok) {
        const qData = await questionsRes.json();
        this.questions.set(qData.questions || []);
        if (Array.isArray(qData.userUpvotedIds)) {
          this.userUpvotedIds.set(new Set(qData.userUpvotedIds));
        }
      }

      if (telemetryRes.ok) {
        const tData = await telemetryRes.json();
        this.telemetry.set(tData);
      }

      if (teleprompterRes.ok) {
        const tpData = await teleprompterRes.json();
        this.teleprompterQuestions.set(tpData);
      }

      if (wordcloudRes.ok) {
        const wcData = await wordcloudRes.json();
        this.wordCloudData.set(wcData);
      }

      if (seriesRes.ok) {
        const sData = await seriesRes.json();
        this.currentSeries.set(sData.series);
      }
    } catch (err) {
      if (!silent) {
        console.error('Failed to sync session data:', err);
      }
    }
  }

  // ==========================================
  // Segment Lifecycle Management
  // ==========================================

  public async startSegment(segmentId: string): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      const res = await fetch(`/api/series/${code}/segments/${segmentId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start segment');
      }

      const data = await res.json();
      if (data.series) {
        this.currentSeries.set(data.series);
      }
      this.showToast('Segment is now LIVE on stage!');
      await this.refreshSessionData(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error starting segment';
      this.errorMessage.set(msg);
      return false;
    }
  }

  public async endSegment(segmentId: string): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      const res = await fetch(`/api/series/${code}/segments/${segmentId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to end segment');
      }

      const data = await res.json();
      if (data.series) {
        this.currentSeries.set(data.series);
      }
      this.showToast('Segment concluded. Grace window active for final questions.');
      await this.refreshSessionData(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error ending segment';
      this.errorMessage.set(msg);
      return false;
    }
  }

  public async updateSegment(segmentId: string, payload: Partial<Segment>): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      const res = await fetch(`/api/series/${code}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, token }),
      });

      if (!res.ok) throw new Error('Failed to update segment');
      this.showToast('Segment details saved successfully');
      await this.refreshSessionData(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating segment';
      this.errorMessage.set(msg);
      return false;
    }
  }

  public async addSegment(payload: Partial<Segment>): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      const res = await fetch(`/api/series/${code}/segments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, token }),
      });

      if (!res.ok) throw new Error('Failed to add segment');
      this.showToast('New segment added to run of show');
      await this.refreshSessionData(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error adding segment';
      this.errorMessage.set(msg);
      return false;
    }
  }

  public async reorderSegments(segmentIds: string[]): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      const res = await fetch(`/api/series/${code}/segments/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ segmentIds, token }),
      });

      if (!res.ok) throw new Error('Failed to reorder segments');
      this.showToast('Schedule order updated');
      await this.refreshSessionData(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reordering segments';
      this.errorMessage.set(msg);
      return false;
    }
  }

  public async moveQuestionToSegment(questionId: string, targetSegmentId: string): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      const res = await fetch(`/api/series/${code}/questions/${questionId}/move-segment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ targetSegmentId, token }),
      });

      if (!res.ok) throw new Error('Failed to move question');
      this.showToast('Question routed to new segment queue');
      await this.refreshSessionData(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error moving question';
      this.errorMessage.set(msg);
      return false;
    }
  }

  // ==========================================
  // Question Submission with Segment Routing
  // ==========================================

  public async submitQuestion(
    content: string,
    category = 'General',
    isAnonymous = false,
    segmentId?: string,
    authorName?: string
  ): Promise<{ success: boolean; deduplicated?: boolean; message?: string }> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return { success: false, message: 'No active session' };

    try {
      const res = await fetch(`/api/sessions/${code}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientFingerprint: this.userFingerprint(),
          authorName: authorName || this.userName() || 'Attendee',
          isAnonymous,
          content,
          category,
          segmentId: segmentId || this.activeSegment()?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit question');
      }

      if (data.deduplicated) {
        this.showToast(data.message || 'Similar inquiry merged! Upvoted primary question.');
        await this.refreshSessionData(true);
        return { success: true, deduplicated: true, message: data.message };
      }

      if (data.question) {
        this.firebaseService.syncQuestionToFirestore(code, data.question);
      }

      this.showToast(
        data.question?.status === 'PENDING_REVIEW'
          ? 'Submitted! Question is held for moderation review.'
          : 'Question submitted successfully!'
      );
      await this.refreshSessionData(true);
      return { success: true, deduplicated: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting question';
      this.errorMessage.set(msg);
      return { success: false, message: msg };
    }
  }

  // Optimistic Upvote Toggle
  public async toggleUpvote(questionId: string): Promise<void> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return;

    const currentUpvoted = new Set(this.userUpvotedIds());
    const isCurrentlyUpvoted = currentUpvoted.has(questionId);
    let newUpvoteCount = 0;

    if (isCurrentlyUpvoted) {
      currentUpvoted.delete(questionId);
    } else {
      currentUpvoted.add(questionId);
    }
    this.userUpvotedIds.set(currentUpvoted);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(
          `askqlive_upvoted_${code}`,
          JSON.stringify(Array.from(currentUpvoted))
        );
      } catch {
        // ignore
      }
    }

    this.questions.update(list =>
      list.map(q => {
        if (q.id === questionId) {
          newUpvoteCount = isCurrentlyUpvoted ? Math.max(0, q.upvotes - 1) : q.upvotes + 1;
          return {
            ...q,
            upvotes: newUpvoteCount,
          };
        }
        return q;
      })
    );

    this.firebaseService.updateQuestionInFirestore(code, questionId, {
      upvotes: newUpvoteCount,
    });

    if (!isCurrentlyUpvoted) {
      this.showToast('👍 Thumbs-up recorded! Question boosted in popularity.');
    } else {
      this.showToast('Thumbs-up vote removed.');
    }

    try {
      const res = await fetch(`/api/sessions/${code}/questions/${questionId}/upvote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientFingerprint: this.userFingerprint(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof data.upvotes === 'number') {
          this.questions.update(list =>
            list.map(q => (q.id === questionId ? { ...q, upvotes: data.upvotes } : q))
          );
          this.firebaseService.updateQuestionInFirestore(code, questionId, {
            upvotes: data.upvotes,
          });
        }
      } else {
        await this.refreshSessionData(true);
      }
    } catch (err) {
      console.error('Error toggling upvote:', err);
      await this.refreshSessionData(true);
    }
  }

  // Update Question Status (Approved, Answering, Answered, Rejected)
  public async updateQuestionStatus(questionId: string, status: QuestionStatus): Promise<void> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return;

    this.questions.update(list =>
      list.map(q => (q.id === questionId ? { ...q, status } : q))
    );
    this.firebaseService.updateQuestionInFirestore(code, questionId, { status });

    try {
      await fetch(`/api/sessions/${code}/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          isAdmin: this.isAdmin() || this.isSpeaker(),
          clientFingerprint: this.userFingerprint(),
        }),
      });
      await this.refreshSessionData(true);
    } catch (err) {
      console.error('Error updating question status:', err);
    }
  }

  // Edit Question Content
  public async editQuestionContent(questionId: string, newContent: string): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    this.firebaseService.updateQuestionInFirestore(code, questionId, { content: newContent });

    try {
      const res = await fetch(`/api/sessions/${code}/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          clientFingerprint: this.userFingerprint(),
          isAdmin: this.isAdmin(),
        }),
      });
      if (res.ok) {
        this.showToast('Question updated');
        await this.refreshSessionData(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error editing question:', err);
      return false;
    }
  }

  // Delete Question
  public async deleteQuestion(questionId: string): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    this.questions.update(list => list.filter(q => q.id !== questionId));
    this.firebaseService.deleteQuestionFromFirestore(code, questionId);

    try {
      const res = await fetch(`/api/sessions/${code}/questions/${questionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientFingerprint: this.userFingerprint(),
          isAdmin: this.isAdmin(),
        }),
      });
      if (res.ok) {
        this.showToast('Question deleted');
        return true;
      }
      await this.refreshSessionData(true);
      return false;
    } catch (err) {
      console.error('Error deleting question:', err);
      await this.refreshSessionData(true);
      return false;
    }
  }

  // Update Grounding Context
  public async updateGroundingContext(contextData: string): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    try {
      const res = await fetch(`/api/sessions/${code}/grounding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextData }),
      });
      if (res.ok) {
        this.currentSession.update(s => (s ? { ...s, contextData } : null));
        const updated = this.currentSession();
        if (updated) {
          this.firebaseService.syncSessionToFirestore(updated);
        }
        this.showToast('Speaker grounding context saved!');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error updating grounding context:', err);
      return false;
    }
  }

  // Update Session Settings
  public async updateSettings(settings: Partial<Session['settings']>): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    try {
      const res = await fetch(`/api/sessions/${code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        this.currentSession.update(s =>
          s ? { ...s, settings: { ...s.settings, ...settings } } : null
        );
        this.showToast('Session settings updated');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error updating settings:', err);
      return false;
    }
  }

  // Multilingual Translation
  public async translateText(
    questionId: string,
    text: string,
    targetLanguage: string
  ): Promise<string> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return text;

    const cacheKey = `${questionId}:${targetLanguage}`;
    const map = this.translations();
    if (map.has(cacheKey)) {
      return map.get(cacheKey)!.line1;
    }

    try {
      const res = await fetch(`/api/sessions/${code}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage }),
      });
      const data = await res.json();
      return data.translatedText || text;
    } catch (err) {
      console.error('Translation failed:', err);
      return text;
    }
  }

  // Generate Executive Post-Session Report
  public async generatePostSessionReport(): Promise<PostSessionReport | null> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return null;

    this.isLoading.set(true);
    try {
      const res = await fetch(`/api/sessions/${code}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Report generation failed');
      const report: PostSessionReport = await res.json();
      this.isLoading.set(false);
      return report;
    } catch (err: unknown) {
      this.isLoading.set(false);
      const msg = err instanceof Error ? err.message : 'Failed to generate executive report';
      this.errorMessage.set(msg);
      return null;
    }
  }

  // Generate Workshop Series Executive Report
  public async fetchSeriesReport(): Promise<SeriesReport | null> {
    const code = this.currentSeries()?.joinCode || this.currentSession()?.joinCode;
    if (!code) return null;

    this.isLoading.set(true);
    try {
      const res = await fetch(`/api/series/${code}/report`);
      if (!res.ok) throw new Error('Series report generation failed');
      const report: SeriesReport = await res.json();
      this.isLoading.set(false);
      return report;
    } catch (err: unknown) {
      this.isLoading.set(false);
      const msg = err instanceof Error ? err.message : 'Failed to generate series executive report';
      this.errorMessage.set(msg);
      return null;
    }
  }

  // Ban participant
  public async banParticipant(fingerprint: string, banned: boolean): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    try {
      const res = await fetch(`/api/sessions/${code}/participants/${fingerprint}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned }),
      });
      return res.ok;
    } catch (err) {
      console.error('Error banning participant:', err);
      return false;
    }
  }

  // Simulate Live Traffic
  public async simulateTraffic(): Promise<void> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return;

    try {
      await fetch(`/api/sessions/${code}/simulate-traffic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      this.showToast('Audience interaction simulated!');
      await this.refreshSessionData(true);
    } catch (err) {
      console.error('Error simulating traffic:', err);
    }
  }

  // Helper toast notification
  public showToast(msg: string): void {
    this.successMessage.set(msg);
    setTimeout(() => {
      if (this.successMessage() === msg) {
        this.successMessage.set(null);
      }
    }, 4000);
  }
}

