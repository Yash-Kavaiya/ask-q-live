import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
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
  SpeakerInviteRecord,
  ActiveLiveRoomPreview,
  GroundingFileMeta,
} from '../models/qa.models';
import { FirebaseService } from './firebase.service';
import { ClientStorageService } from './client-storage.service';
import { SessionApiClient } from './session-api.client';
import { filterAndSortQuestions, selectPendingModerationQuestions, selectTopPrioritizedQuestions } from '../utils/question-filters';

export type ActiveTab =
  | 'feed' | 'lobby' | 'series-control' | 'manage' | 'teleprompter' | 'analytics'
  | 'moderation' | 'grounding' | 'report' | 'schedule';

const ROUTABLE_TABS: ActiveTab[] = [
  'feed', 'series-control', 'manage', 'teleprompter', 'analytics', 'moderation', 'grounding', 'report',
];

// ActiveTab -> URL path segment. Everything is 1:1 except the Run of Show tab,
// whose route segment reads better as 'run-of-show'.
const TAB_URL_SEGMENTS: Partial<Record<ActiveTab, string>> = {
  'series-control': 'run-of-show',
};

/** Excludes empty/placeholder tokens — some upstream calls stringify a missing token as "undefined"/"null". */
function isValidToken(token: string | null | undefined): token is string {
  return !!token && token !== 'undefined' && token !== 'null';
}

@Injectable({
  providedIn: 'root',
})
export class QaService {
  public firebaseService = inject(FirebaseService);
  private router = inject(Router);
  private storage = inject(ClientStorageService);
  private api = inject(SessionApiClient);

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
  public speakerInvites = signal<SpeakerInviteRecord[]>([]);

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
  public userEmail = signal<string>('');
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

  // Navigation & filtering signals.
  //
  // activeTab is DERIVED FROM THE URL and is therefore read-only to the outside
  // world: <router-outlet /> renders whatever the router matched, so writing to
  // this signal directly would only desynchronise the header highlight from the
  // view actually on screen. Use navigateToTab() to switch tabs; the router
  // event subscription in applyRouteToViewState() writes the backing signal.
  private _activeTab = signal<ActiveTab>('feed');
  public activeTab: Signal<ActiveTab> = this._activeTab.asReadonly();
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

  // Segments list sorted by order (speakers only see their own assigned talk)
  public segments = computed<Segment[]>(() => {
    const series = this.currentSeries();
    if (!series || !series.segments) return [];
    const sorted = [...series.segments].sort((a, b) => a.order - b.order);
    if (this.isSpeaker()) {
      const mine = this.speakerSegmentId();
      if (mine) return sorted.filter(s => s.id === mine);
      const scope = this.userAuthScope();
      if (scope.length > 0) return sorted.filter(s => scope.includes(s.id));
    }
    return sorted;
  });

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initUserIdentity();
    this.checkUrlForTokens();
    this.loadHostedSessionHistory();
    this.fetchActiveLiveRoom();
    this.syncNavigationWithRouter();

    // Attendee access guard: attendees can only view the live feed.
    // Route-time access is enforced by staffTabGuard/adminTabGuard; this effect
    // is the reactive fallback for a role that changes *after* landing on a tab.
    effect(() => {
      const isStaffMember = this.isStaff();
      const currentTab = this.activeTab();
      if (!isStaffMember && currentTab !== 'feed') {
        const session = this.currentSession();
        const series = this.currentSeries();
        const code = session?.joinCode || series?.joinCode;
        if (code) {
          const isSeries = series?.joinCode === code;
          this.router.navigate([isSeries ? '/series' : '/session', code, 'feed'], { replaceUrl: true });
        } else {
          // No session/series to navigate within — reset the derived state directly.
          this._activeTab.set('feed');
        }
      }
    });

    // Push the URL forward to the canonical /session/:code or /series/:code form
    // whenever session state changes outside of a route navigation (join-by-code
    // form, host creating/re-entering a session, legacy ?code= auto-join).
    //
    // Signals are read unconditionally (before the getCurrentNavigation() guard)
    // so this effect stays subscribed to currentSession/currentSeries even on a
    // run where it bails early — Angular's effect() re-derives its dependency set
    // from whichever signals were actually read on that run, so returning before
    // any signal read would silently stop this effect from ever running again.
    effect(() => {
      const session = this.currentSession();
      const series = this.currentSeries();
      const code = session?.joinCode || series?.joinCode;
      if (!code) return;

      // A navigation already in flight (e.g. sessionGuard awaiting
      // joinSession() on a fresh deep link) owns getting the URL to its final
      // state. router.url doesn't update until that navigation resolves
      // (default deferred urlUpdateStrategy), so acting here would race it and
      // briefly detour through the wrong /session/:code URL. Let it finish.
      if (this.router.getCurrentNavigation()) return;

      const isSeries = series?.joinCode === code;
      const currentUrl = this.router.url.split('?')[0].split('#')[0];
      const expectedPrefix = `/${isSeries ? 'series' : 'session'}/${code}`;
      if (!currentUrl.startsWith(expectedPrefix)) {
        // Preserve whichever tab the URL is already on. This effect also re-runs
        // on every poll cycle (refreshSessionData() hands currentSession /
        // currentSeries fresh object references), so hardcoding 'feed' here would
        // yank a staff member off Analytics/Report whenever the prefix needs
        // correcting (e.g. a case-mismatched :code in a hand-typed deep link).
        const tab = currentUrl.match(/^\/(?:session|series)\/[^/]+\/([^/]+)/)?.[1] ?? 'feed';
        this.router.navigate([isSeries ? '/series' : '/session', code, tab], { replaceUrl: true });
      }
    });
  }

  // Keeps currentView/activeTab in sync with the router (source of truth is the URL).
  private syncNavigationWithRouter(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.applyRouteToViewState(this.router.url));
    this.applyRouteToViewState(this.router.url);
  }

  private applyRouteToViewState(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    if (path === '/' || path === '') {
      this.currentView.set('join');
    } else if (path.startsWith('/auth')) {
      this.currentView.set('auth');
    } else if (path.startsWith('/host')) {
      this.currentView.set('host-studio');
    }

    const tabMatch = path.match(/^\/(?:session|series)\/[^/]+\/([^/]+)/);
    if (tabMatch) {
      const segment = tabMatch[1] === 'run-of-show' ? 'series-control' : tabMatch[1];
      if ((ROUTABLE_TABS as string[]).includes(segment)) {
        // Canonical URL -> view state write. This is the single source of truth
        // for activeTab; everything else navigates and lets this run.
        this._activeTab.set(segment as ActiveTab);
      }
    }
  }

  private initUserIdentity(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      let fp = this.storage.getFingerprint();
      if (!fp) {
        fp = 'fp-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
        this.storage.setFingerprint(fp);
      }
      this.userFingerprint.set(fp);

      const savedName = this.storage.getUsername();
      if (savedName) {
        this.userName.set(savedName);
      }

      const savedEmail = this.storage.getEmail();
      if (savedEmail) {
        this.userEmail.set(savedEmail);
      }

      const savedToken = this.storage.getAuthToken();
      if (savedToken) {
        this.userAuthToken.set(savedToken);
      }
    } else {
      this.userFingerprint.set('fp-guest-' + Math.random().toString(36).substring(2, 8));
    }
  }

  public setAttendeeIdentity(name: string, email?: string): void {
    if (name) {
      this.userName.set(name);
      this.storage.setUsername(name);
    }
    if (email !== undefined) {
      this.userEmail.set(email);
      this.storage.setEmail(email);
    }
  }

  // Extract event room code from full URL (?code=..., ?room=..., #/?code=..., hash routes, etc.)
  public extractUrlCode(): string | null {
    if (typeof window === 'undefined' || !window.location) return null;
    try {
      const fullHref = window.location.href;

      // 1. Direct searchParams on window.location.search (e.g. ?code=ROOM123)
      const searchParams = new URLSearchParams(window.location.search);
      let rawCode =
        searchParams.get('code') ||
        searchParams.get('join') ||
        searchParams.get('room') ||
        searchParams.get('session') ||
        searchParams.get('joinCode') ||
        searchParams.get('series');

      // 2. Query parameters inside hash (e.g. #/?code=ROOM123 or #/join?code=ROOM123)
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

        // 4. Check direct hash route segment like #ROOM123 or #/ROOM123
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

      // 5. Check window.location.pathname e.g. /room/ROOM123 or /series/ROOM123
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
      // A staff ?token= is honoured on every URL shape, canonical or legacy.
      const params = new URLSearchParams(window.location.search);
      const trimmedToken = params.get('token')?.trim();
      const urlToken = isValidToken(trimmedToken) ? trimmedToken : null;
      if (urlToken) {
        this.userAuthToken.set(urlToken);
        this.storage.setAuthToken(urlToken);
      }

      // /session/:code and /series/:code are handled by sessionGuard — skip
      // the legacy auto-join here to avoid a duplicate joinSession() call
      // racing the guard's.
      if (/^\/(session|series)\/[A-Za-z0-9_-]+/i.test(window.location.pathname)) {
        return;
      }

      const detectedCode = this.extractUrlCode();
      if (detectedCode) {
        this.autoJoinCode.set(detectedCode);
        this.isAutoJoiningFromUrl.set(true);
        // Only default to attendee role if no staff token was provided in URL
        if (!urlToken) {
          this.userRole.set('attendee');
          this.userAuthToken.set(null);
        }
        // Automatically join the session
        setTimeout(() => {
          this.joinSession(detectedCode, this.userName() || (urlToken ? 'Speaker' : 'Attendee'))
            .then((success) => {
              this.isAutoJoiningFromUrl.set(false);
              if (success) {
                this.showToast(`Entered Event Room #${detectedCode}`);
                if (urlToken && this.isSpeaker()) {
                  this.selectedSegmentFilter.set(this.speakerSegmentId() || 'ALL');
                  this.navigateToTab('series-control');
                }
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
    return filterAndSortQuestions(this.questions(), {
      category: this.filterCategory(),
      status: this.filterStatus(),
      segmentFilter: this.selectedSegmentFilter(),
      search: this.searchQuery(),
      sort: this.sortBy(),
      userFingerprint: this.userFingerprint(),
      upvotedIds: this.userUpvotedIds(),
      isModerationView: this.activeTab() === 'moderation',
      isSpeaker: this.isSpeaker(),
      speakerSegmentId: this.speakerSegmentId(),
    });
  });

  public pendingModerationQuestions = computed(() => selectPendingModerationQuestions(this.questions()));

  // Top prioritized popular questions
  public topPrioritizedQuestions = computed(() => selectTopPrioritizedQuestions(this.questions()));

  // ==========================================
  // Role Authentication (FR-SEC-1, FR-SEC-2)
  // ==========================================

  public async authenticateRole(token: string): Promise<UserAccessInfo> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return { role: 'attendee', scope: [] };

    try {
      const authInfo = await this.api.authenticateRole(code, token.trim());
      this.userRole.set(authInfo.role);
      this.userAuthScope.set(authInfo.scope || []);
      this.userAuthToken.set(token.trim());
      if (authInfo.segmentId) {
        this.speakerSegmentId.set(authInfo.segmentId);
      }

      this.storage.setAuthToken(token.trim());

      if (authInfo.role === 'organizer') {
        this.showToast('Authenticated as Event Organizer. Control room enabled.');
      } else if (authInfo.role === 'speaker') {
        this.showToast('Authenticated as Speaker. Speaker green room enabled.');
        if (authInfo.segmentId) {
          this.selectedSegmentFilter.set(authInfo.segmentId);
        }
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
    this.storage.clearAuthToken();
    this.showToast('Switched to Attendee view.');
  }

  // ==========================================
  // Host Past Session History & Sharing
  // ==========================================

  public loadHostedSessionHistory(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const stored = this.storage.getHostedSessionsHistory();
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
    try {
      this.storage.setHostedSessionsHistory(JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save hosted sessions to localStorage:', e);
    }
  }

  public removeHostedSession(joinCode: string): void {
    const code = joinCode.toUpperCase().trim();
    const filtered = this.hostedSessions().filter(s => s.joinCode !== code);
    this.hostedSessions.set(filtered);
    this.storage.setHostedSessionsHistory(JSON.stringify(filtered));
    this.showToast(`Session #${code} removed from past session history.`);
  }

  public clearHostedSessions(): void {
    this.hostedSessions.set([]);
    this.storage.clearHostedSessionsHistory();
    this.showToast('Past session history cleared.');
  }

  public loadQuestionsLocally(joinCode: string): Question[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const code = joinCode.toUpperCase().trim();
      const raw = this.storage.getCachedQuestions(code);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  }

  public saveQuestionsLocally(joinCode: string, questions: Question[]): void {
    try {
      const code = joinCode.toUpperCase().trim();
      this.storage.setCachedQuestions(code, JSON.stringify(questions));
    } catch {
      // ignore
    }
  }

  public async reenterAsHost(record: HostedSessionRecord): Promise<boolean> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const code = record.joinCode.toUpperCase().trim();

    // 1. Reset all filters and search so the host sees ALL questions
    this.filterCategory.set('ALL');
    this.filterStatus.set('ALL');
    this.selectedSegmentFilter.set('ALL');
    this.searchQuery.set('');

    // 2. Pre-load local questions cache immediately
    const cachedQuestions = this.loadQuestionsLocally(code);
    if (cachedQuestions.length > 0) {
      this.questions.set(cachedQuestions);
    }

    // 3. Set host role and token immediately so isStaff() and isAdmin() are true
    this.userRole.set('organizer');
    this.userAuthScope.set(['*']);
    if (record.adminToken) {
      this.userAuthToken.set(record.adminToken);
      this.storage.setAuthToken(record.adminToken);
    }

    try {
      // 4. Join session passing full metadata so server can restore if needed
      const joined = await this.joinSession(code, this.userName() || 'Organizer', {
        adminToken: record.adminToken,
        title: record.title,
        description: record.description,
        type: record.type,
      });

      if (joined) {
        // 5. Authenticate / claim role on backend
        if (record.adminToken) {
          try {
            await this.authenticateRole(record.adminToken);
          } catch {
            // fallback
          }
        }
        // Past hosted session entry ALWAYS grants host/organizer role for the entire event dashboard
        this.userRole.set('organizer');
        this.userAuthScope.set(['*']);

        // 6. Update record in history with latest question count and timestamp
        const totalQ = this.questions().length || record.questionCount || 0;
        this.saveHostedSession({
          joinCode: code,
          title: record.title,
          description: record.description,
          type: record.type,
          adminToken: record.adminToken || this.userAuthToken() || '',
          status: 'ACTIVE',
          segmentCount: record.segmentCount,
          questionCount: totalQ,
        });

        // 7. Activate appropriate tab (via the router, not a direct signal write —
        // activeTab is router-derived; a direct .set() here would just get raced
        // and overwritten by the next NavigationEnd/bridging-effect correction).
        const isSeries = record.type === 'series';
        this.router.navigate(
          [isSeries ? '/series' : '/session', code, isSeries ? 'run-of-show' : 'feed'],
          { replaceUrl: true },
        );

        this.showToast(`Opened #${code} as Event Host. Session dashboard is ready.`);
        this.isLoading.set(false);
        return true;
      }
      this.isLoading.set(false);
      return false;
    } catch (err: unknown) {
      this.isLoading.set(false);
      const msg = err instanceof Error ? err.message : 'Could not open session as host';
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
      const data = await this.api.fetchActiveLiveRoom();
      if (data) {
        this.activeLiveRoom.set(data);
        return data;
      }
    } catch {
      // Ignore network errors on initial boot
    }
    this.activeLiveRoom.set(null);
    return null;
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
    const code = room?.joinCode;
    if (!code) {
      this.errorMessage.set('No live event is currently running. Please enter an event room code to join.');
      this.isLoading.set(false);
      return false;
    }

    const attendeeName = opts?.anonymous
      ? 'Anonymous'
      : (opts?.name?.trim() || this.userName() || 'Attendee');

    // Ensure attendee role (Zero auth required)
    this.userRole.set('attendee');
    this.userAuthToken.set(null);
    this.storage.clearAuthToken();
    if (opts?.name && !opts.anonymous) {
      this.storage.setUsername(opts.name.trim());
    }

    const success = await this.joinSession(code, attendeeName);
    if (success) {
      this.navigateToTab('feed');
      this.showToast(`Joined Live Room #${code} as ${attendeeName}`);
    }
    this.isLoading.set(false);
    return success;
  }

  /**
   * Request Grounded RAG AI Answer for a specific question on demand
   */
  public async requestRagAnswer(questionId: string): Promise<Question | null> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.seriesCode;
    if (!code) return null;
    try {
      // Optimistic status update
      this.questions.update(items =>
        items.map(q => (q.id === questionId ? { ...q, aiStatus: 'GENERATING' } : q))
      );

      const data = await this.api.requestRagAnswer(code, questionId);
      if (data?.question) {
        const updated: Question = data.question;
        this.questions.update(items =>
          items.map(q => (q.id === questionId ? { ...q, ...updated } : q))
        );
        if (updated.isGroundedOnDeck) {
          this.showToast('Grounded RAG Answer synthesized from presentation deck!');
        } else {
          this.showToast('AI Answer synthesized (Generic • Not Grounded on Deck)');
        }
        return updated;
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

  public async joinSession(
    joinCode: string,
    name?: string,
    metadata?: {
      adminToken?: string;
      title?: string;
      description?: string;
      type?: 'single' | 'series';
    }
  ): Promise<boolean> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const code = joinCode.toUpperCase().trim();

    // Reset filters so all questions are immediately visible
    this.filterCategory.set('ALL');
    this.filterStatus.set('ALL');
    this.selectedSegmentFilter.set('ALL');
    this.searchQuery.set('');

    // Pre-load local questions cache immediately
    const cached = this.loadQuestionsLocally(code);
    if (cached.length > 0) {
      this.questions.set(cached);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = this.storage.getUpvotedIds(code);
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
        this.storage.setUsername(name);
      }

      const data = await this.api.joinSession(code, {
        fingerprint: this.userFingerprint(),
        name: this.userName() || 'Attendee',
        adminToken: metadata?.adminToken || this.userAuthToken() || undefined,
        title: metadata?.title,
        description: metadata?.description,
        type: metadata?.type,
      });

      this.currentSession.set(data.session);

      // Also load Series metadata if available. A plain single-session join MUST
      // clear any series left over from a previous visit, otherwise header
      // navigation would keep building /series/<single-session-code>/... URLs.
      try {
        const sData = await this.api.getSeries(code);
        if (sData) {
          let series = sData.series as SessionSeries | undefined;
          if (series) {
            series = await this.mergePrivilegedSegmentTokens(code, series);
            series = await this.mergeFirestoreSeriesProfile(code, series);
            this.currentSeries.set(series);
          } else {
            this.currentSeries.set(null);
          }
        } else {
          this.currentSeries.set(null);
        }
      } catch {
        // Single session fallback
        this.currentSeries.set(null);
      }

      // Verify any saved token
      const existingToken = this.userAuthToken();
      if (isValidToken(existingToken)) {
        await this.authenticateRole(existingToken);
        if (this.isSpeaker() && this.speakerSegmentId()) {
          this.selectedSegmentFilter.set(this.speakerSegmentId()!);
        }
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
      const session = await this.api.createSession(payload);
      this.currentSession.set(session);
      this.currentSeries.set(null);
      this.userRole.set('organizer');
      this.userAuthToken.set(session.adminToken);

      if (session.adminToken) {
        this.storage.setAuthToken(session.adminToken);
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
    geminiApiKey?: string;
    segments?: Partial<Segment>[];
  }): Promise<SessionSeries | null> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const series = await this.api.createSeries(payload);
      // Keep host Gemini key server-side only — do not retain in browser state.
      if (series.geminiApiKey) {
        delete series.geminiApiKey;
      }
      this.currentSeries.set(series);
      this.userRole.set('organizer');
      this.userAuthToken.set(series.organizerToken);

      if (series.organizerToken) {
        this.storage.setAuthToken(series.organizerToken);
      }

      // Also load synthetic session
      const sessData = await this.api.getSession(series.joinCode);
      if (sessData) {
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
      // Persist structured series + segments + speaker invite index to Firestore
      void this.firebaseService.syncSeriesToFirestore(series, {
        hasCustomGeminiKey: !!(payload.geminiApiKey && payload.geminiApiKey.trim()),
      });
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
    return this.api.checkCodeAvailability(clean);
  }

  public async generateSuggestedCode(prefix = ''): Promise<string> {
    try {
      const data = await this.api.generateSuggestedCode(prefix);
      if (data.code) return data.code;
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
        this.saveQuestionsLocally(joinCode, firestoreQuestions);
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
    this.router.navigate(['/']);
  }

  public navigateToAuth(): void {
    this.currentView.set('auth');
    this.router.navigate(['/auth']);
  }

  public navigateToHostStudio(): void {
    this.currentView.set('host-studio');
    this.router.navigate(['/host']);
  }

  /**
   * Switch tabs inside the active session/series by performing a real router
   * navigation. activeTab is derived from the URL, so this — not a signal
   * write — is what actually changes the view behind <router-outlet />.
   * No-ops when there is no active session/series to navigate within.
   */
  public navigateToTab(tab: ActiveTab): void {
    if (!ROUTABLE_TABS.includes(tab)) return;

    // Base and code are resolved together from one source of truth (same rule as
    // header.ts's nav()) so they can never disagree and build a /series/<single-
    // session-code>/... URL that doesn't exist.
    const series = this.currentSeries();
    const session = this.currentSession();
    const base = series ? '/series' : '/session';
    const code = series?.joinCode ?? session?.joinCode;
    if (!code) return;

    const segment = TAB_URL_SEGMENTS[tab] || tab;
    this.router.navigate([base, code, segment]);
  }

  public leaveSession(): void {
    this.teardownSessionState();
    this.currentView.set('join');
    this.router.navigate(['/']);
  }

  /** Leave the live room and return to Host Studio (used by host Back button). */
  public leaveSessionToHostStudio(): void {
    this.teardownSessionState();
    this.navigateToHostStudio();
  }

  private teardownSessionState(): void {
    this.firebaseService.clearListeners();
    this.stopPolling();
    this.currentSession.set(null);
    this.currentSeries.set(null);
    this.questions.set([]);
    this.userUpvotedIds.set(new Set());
    this.telemetry.set(null);
    this.wordCloudData.set([]);
    this.teleprompterQuestions.set([]);
    this.filterCategory.set('ALL');
    this.filterStatus.set('ALL');
    this.selectedSegmentFilter.set('ALL');
    this.searchQuery.set('');
    // Full teardown: there is no session left to navigate within, so reset the
    // derived tab state directly before heading back.
    this._activeTab.set('feed');
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

      const [qData, tData, tpData, wcData, sData] = await Promise.all([
        this.api.getQuestions(code, fp, segQuery),
        this.api.getTelemetry(code, fp, segQuery),
        this.api.getTeleprompterQueue(code, segQuery),
        this.api.getWordCloud(code, segQuery),
        this.api.getSeries(code),
      ]);

      if (qData) {
        const serverQuestions: Question[] = qData.questions || [];
        if (serverQuestions.length > 0) {
          this.questions.set(serverQuestions);
          this.saveQuestionsLocally(code, serverQuestions);
        } else {
          // If server returned 0 questions (e.g. backend reset or cold start), restore from local cache
          const cached = this.loadQuestionsLocally(code);
          if (cached.length > 0) {
            this.questions.set(cached);
          } else {
            this.questions.set([]);
          }
        }
        if (Array.isArray(qData.userUpvotedIds)) {
          this.userUpvotedIds.set(new Set(qData.userUpvotedIds));
        }
      }

      if (tData) {
        this.telemetry.set(tData);
      }

      if (tpData) {
        this.teleprompterQuestions.set(tpData);
      }

      if (wcData) {
        this.wordCloudData.set(wcData);
      }

      if (sData) {
        let series = sData.series as SessionSeries | undefined;
        if (series) {
          series = await this.mergePrivilegedSegmentTokens(code, series);
          this.currentSeries.set(series);
        }
      }
    } catch (err) {
      if (!silent) {
        console.error('Failed to sync session data:', err);
      }
    }
  }

  /**
   * Public GET /api/series strips adminTokens. Organizers/speakers need them
   * for Speaker Link copy — rehydrate from the privileged segments endpoint.
   */
  private async mergePrivilegedSegmentTokens(
    code: string,
    series: SessionSeries
  ): Promise<SessionSeries> {
    const token = this.userAuthToken();
    if (!token || !series.segments?.length) return series;
    if (!this.isOrganizer() && !this.isSpeaker()) return series;

    const data = await this.api.getPrivilegedSegments(code, token);
    if (!data?.segments?.length) return series;

    const byId = new Map(data.segments.map(s => [s.id, s]));
    const merged = series.segments.map(seg => {
      const full = byId.get(seg.id);
      if (!full) return seg;
      return {
        ...seg,
        adminToken: full.adminToken || seg.adminToken,
        speakerEmail: full.speakerEmail ?? seg.speakerEmail,
        speakerX: full.speakerX ?? seg.speakerX,
        speakerLinkedIn: full.speakerLinkedIn ?? seg.speakerLinkedIn,
        speakerWebsite: full.speakerWebsite ?? seg.speakerWebsite,
        sessionDescription: full.sessionDescription ?? seg.sessionDescription,
        topicSummary: full.topicSummary ?? seg.topicSummary,
      };
    });
    return { ...series, segments: merged };
  }

  /**
   * Merge durable Firestore speaker profiles into in-memory series
   * (survives server restarts when API is memory-backed).
   */
  private async mergeFirestoreSeriesProfile(
    code: string,
    series: SessionSeries
  ): Promise<SessionSeries> {
    try {
      const loaded = await this.firebaseService.loadSeriesFromFirestore(code);
      if (!loaded?.segments?.length) return series;

      const byId = new Map(loaded.segments.map(s => [s.id, s]));
      const mergedSegs = (series.segments || []).map(seg => {
        const fs = byId.get(seg.id);
        if (!fs) return seg;
        return {
          ...seg,
          speakerName: seg.speakerName || fs.speakerName,
          speakerRole: seg.speakerRole || fs.speakerRole,
          speakerOrg: seg.speakerOrg || fs.speakerOrg,
          speakerBio: seg.speakerBio || fs.speakerBio,
          speakerEmail: seg.speakerEmail || fs.speakerEmail,
          speakerX: seg.speakerX || fs.speakerX,
          speakerLinkedIn: seg.speakerLinkedIn || fs.speakerLinkedIn,
          speakerWebsite: seg.speakerWebsite || fs.speakerWebsite,
          sessionDescription: seg.sessionDescription || fs.sessionDescription,
          topicSummary: seg.topicSummary || fs.topicSummary,
          // adminToken is intentionally absent from the public segment doc — see
          // firestore-series.mapper.ts's FirestoreSegmentDoc comment.
          speaker: {
            ...(fs.speaker || {}),
            ...(seg.speaker || {}),
            name: seg.speakerName || fs.speakerName,
            xUrl: seg.speakerX || fs.speakerX || seg.speaker?.xUrl || fs.speaker?.xUrl,
            linkedinUrl:
              seg.speakerLinkedIn ||
              fs.speakerLinkedIn ||
              seg.speaker?.linkedinUrl ||
              fs.speaker?.linkedinUrl,
            websiteUrl:
              seg.speakerWebsite ||
              fs.speakerWebsite ||
              seg.speaker?.websiteUrl ||
              fs.speaker?.websiteUrl,
          },
        };
      });

      return {
        ...series,
        description: series.description || loaded.series.description,
        title: series.title || loaded.series.title || series.title,
        segments: mergedSegs,
      };
    } catch {
      return series;
    }
  }

  /** Fetch segment invites registered to this speaker's Gmail. */
  public async fetchSpeakerInvites(email?: string): Promise<SpeakerInviteRecord[]> {
    const resolved = (email || this.userEmail() || '').trim().toLowerCase();
    if (!resolved || !resolved.includes('@')) {
      this.speakerInvites.set([]);
      return [];
    }

    try {
      const [data, firestoreClaims] = await Promise.all([
        this.api.fetchSpeakerInvites(resolved),
        this.firebaseService.loadSpeakerInvitesFromFirestore(resolved),
      ]);

      const byKey = new Map<string, SpeakerInviteRecord>();

      const invitesFromApi: SpeakerInviteRecord[] = Array.isArray(data.invites) ? data.invites : [];
      for (const inv of invitesFromApi) {
        byKey.set(`${inv.joinCode}_${inv.segmentId}`, inv);
      }

      for (const claim of firestoreClaims) {
        const key = `${claim.joinCode}_${claim.segmentId}`;
        if (!byKey.has(key) && claim.adminToken) {
          byKey.set(key, {
            joinCode: claim.joinCode,
            seriesTitle: claim.seriesTitle,
            seriesState: claim.seriesState,
            segmentId: claim.segmentId,
            segmentTitle: claim.segmentTitle,
            speakerName: claim.speakerName,
            speakerEmail: claim.speakerEmail,
            adminToken: claim.adminToken,
            status: claim.status,
            order: claim.order,
          });
        }
      }

      const invites = Array.from(byKey.values()).sort((a, b) => a.order - b.order);
      this.speakerInvites.set(invites);
      return invites;
    } catch (err) {
      console.warn('Failed to load speaker invites:', err);
      this.speakerInvites.set([]);
      return [];
    }
  }

  /** Join a series as an invited speaker using their segment adminToken. */
  public async joinAsInvitedSpeaker(invite: SpeakerInviteRecord): Promise<boolean> {
    if (!invite?.joinCode || !invite.adminToken) return false;

    this.userAuthToken.set(invite.adminToken);
    this.storage.setAuthToken(invite.adminToken);

    const ok = await this.joinSession(invite.joinCode, invite.speakerName || this.userName() || 'Speaker', {
      adminToken: invite.adminToken,
      type: 'series',
      title: invite.seriesTitle,
    });

    if (ok) {
      this.speakerSegmentId.set(invite.segmentId);
      this.selectedSegmentFilter.set(invite.segmentId);
      // Claim server-side speaker scope (same staff portal path moderators use after role select)
      const auth = await this.authenticateRole(invite.adminToken);
      if (auth.role !== 'speaker') {
        this.userRole.set('speaker');
        this.userAuthScope.set([invite.segmentId]);
      }
      this.navigateToTab('series-control');
    }
    return ok;
  }

  /** Resolve a real speaker adminToken for a segment (never rely on sanitized series state). */
  public async resolveSpeakerAdminToken(segmentId: string): Promise<string | null> {
    const code = this.currentSeries()?.joinCode || this.currentSession()?.joinCode;
    const token = this.userAuthToken();
    if (!code || !token) return null;

    const cached = this.currentSeries()?.segments?.find(s => s.id === segmentId)?.adminToken;
    if (isValidToken(cached)) return cached;

    const data = await this.api.getPrivilegedSegments(code, token);
    const seg = data?.segments?.find(s => s.id === segmentId);
    return isValidToken(seg?.adminToken) ? seg.adminToken : null;
  }

  /** Resolve a segment's speaker admin token, copy its join link to the clipboard, and toast the result. */
  public async copySpeakerLink(seg: Segment): Promise<void> {
    const code = this.currentSeries()?.joinCode || this.currentSession()?.joinCode;
    if (!code) return;

    const adminToken = await this.resolveSpeakerAdminToken(seg.id);
    if (!adminToken) {
      this.showToast('Could not resolve speaker token. Re-authenticate as organizer and try again.');
      return;
    }

    // Cache the resolved token in local series state so subsequent copies
    // work even if a public poll has stripped it in the meantime.
    this.patchSegmentInCurrentSeries(seg.id, s => ({ ...s, adminToken }));

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/?joinCode=${code}&token=${adminToken}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      this.showToast(`Speaker link copied for ${seg.speakerName}`);
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
      const data = await this.api.startSegment(code, segmentId, token);
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
      const data = await this.api.endSegment(code, segmentId, token);
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

  public async updateSeries(payload: {
    title?: string;
    description?: string;
    geminiApiKey?: string;
    contextData?: string;
  }): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      const data = await this.api.updateSeries(code, payload, token);
      if (data.series) {
        const merged = await this.mergePrivilegedSegmentTokens(code, data.series);
        this.currentSeries.set(merged);
        void this.firebaseService.syncSeriesToFirestore(merged);
      }
      this.showToast('Series settings saved');
      await this.refreshSessionData(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating series';
      this.errorMessage.set(msg);
      this.showToast(msg);
      return false;
    }
  }

  public async updateSegment(segmentId: string, payload: Partial<Segment>): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      await this.api.updateSegment(code, segmentId, payload, token);

      this.applyOptimisticSegmentPatch(segmentId, payload);
      this.showToast('Segment details saved successfully');
      await this.refreshSessionData(true);
      await this.reapplySegmentOverrides(segmentId, payload);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating segment';
      this.errorMessage.set(msg);
      return false;
    }
  }

  private patchSegmentInCurrentSeries(
    segmentId: string,
    patch: (segment: Segment) => Segment
  ): SessionSeries | null {
    const series = this.currentSeries();
    if (!series?.segments) return null;
    const next: SessionSeries = {
      ...series,
      segments: series.segments.map(s => (s.id === segmentId ? patch(s) : s)),
    };
    this.currentSeries.set(next);
    return next;
  }

  /** Keep socials / session blurb visible immediately, since the next poll may lag behind the PATCH. */
  private applyOptimisticSegmentPatch(segmentId: string, payload: Partial<Segment>): void {
    this.patchSegmentInCurrentSeries(segmentId, s => ({
      ...s,
      ...payload,
      speaker: {
        ...(s.speaker || { name: s.speakerName }),
        name: payload.speakerName || s.speakerName,
        title: payload.speakerRole ?? s.speakerRole,
        org: payload.speakerOrg ?? s.speakerOrg,
        bio: payload.speakerBio ?? s.speakerBio,
        xUrl: payload.speakerX ?? s.speakerX,
        linkedinUrl: payload.speakerLinkedIn ?? s.speakerLinkedIn,
        websiteUrl: payload.speakerWebsite ?? s.speakerWebsite,
      },
    }));
  }

  /**
   * The refresh right after a save re-fetches the public (sanitized) series,
   * which can lag behind or drop fields the PATCH just set. Re-apply the same
   * payload on top, then sync the result — with a resolved adminToken — to Firestore.
   */
  private async reapplySegmentOverrides(segmentId: string, payload: Partial<Segment>): Promise<void> {
    const mergedSeries = this.patchSegmentInCurrentSeries(segmentId, s => ({
      ...s,
      speakerEmail: payload.speakerEmail ?? s.speakerEmail,
      speakerX: payload.speakerX ?? s.speakerX,
      speakerLinkedIn: payload.speakerLinkedIn ?? s.speakerLinkedIn,
      speakerWebsite: payload.speakerWebsite ?? s.speakerWebsite,
      sessionDescription: payload.sessionDescription ?? s.sessionDescription,
      topicSummary: payload.topicSummary ?? s.topicSummary,
    }));
    if (!mergedSeries) return;

    const seg = mergedSeries.segments.find(s => s.id === segmentId);
    if (!seg) return;
    const withToken = {
      ...seg,
      adminToken: seg.adminToken || (await this.resolveSpeakerAdminToken(segmentId)) || '',
    };
    void this.firebaseService.syncSegmentToFirestore(mergedSeries, withToken);
  }

  public async addSegment(payload: Partial<Segment>): Promise<boolean> {
    const code = this.currentSeries()?.joinCode;
    if (!code) return false;

    const token = this.userAuthToken();
    try {
      await this.api.addSegment(code, payload, token);
      this.showToast('New segment added to run of show');
      await this.refreshSessionData(true);
      const series = this.currentSeries();
      if (series) {
        void this.firebaseService.syncSeriesToFirestore(series);
      }
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
      await this.api.reorderSegments(code, segmentIds, token);
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
      await this.api.moveQuestionToSegment(code, questionId, targetSegmentId, token);
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
      const data = await this.api.submitQuestion(code, {
        clientFingerprint: this.userFingerprint(),
        authorName: authorName || this.userName() || 'Attendee',
        isAnonymous,
        content,
        category,
        segmentId: segmentId || this.activeSegment()?.id,
      });

      if (data.deduplicated) {
        this.showToast(data.message || 'Similar inquiry merged! Upvoted primary question.');
        await this.refreshSessionData(true);
        return { success: true, deduplicated: true, message: data.message };
      }

      if (data.question) {
        this.firebaseService.syncQuestionToFirestore(code, data.question);
        this.saveQuestionsLocally(code, [data.question, ...this.questions()]);
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

    try {
      this.storage.setUpvotedIds(code, JSON.stringify(Array.from(currentUpvoted)));
    } catch {
      // ignore
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
      const data = await this.api.toggleUpvote(code, questionId, this.userFingerprint());
      if (data) {
        const upvotes = data.upvotes;
        if (typeof upvotes === 'number') {
          this.questions.update(list =>
            list.map(q => (q.id === questionId ? { ...q, upvotes } : q))
          );
          this.firebaseService.updateQuestionInFirestore(code, questionId, {
            upvotes,
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
      await this.api.updateQuestionStatus(code, questionId, {
        status,
        isAdmin: this.isAdmin() || this.isSpeaker(),
        clientFingerprint: this.userFingerprint(),
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
      const ok = await this.api.editQuestionContent(code, questionId, {
        content: newContent,
        clientFingerprint: this.userFingerprint(),
        isAdmin: this.isAdmin(),
      });
      if (ok) {
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
      const ok = await this.api.deleteQuestion(code, questionId, {
        clientFingerprint: this.userFingerprint(),
        isAdmin: this.isAdmin(),
      });
      if (ok) {
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

  // Submit Human Answer to Question (Speaker, Organizer, Moderator, or Attendee)
  public async submitHumanAnswer(questionId: string, content: string): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;
    if (!content.trim()) return false;

    const role: UserRole = this.userRole();
    const authorName = this.userName() || (this.isSpeaker() ? 'Speaker' : this.isOrganizer() ? 'Host' : this.userRole() === 'moderator' ? 'Moderator' : 'Attendee');

    try {
      const data = await this.api.submitHumanAnswer(code, questionId, {
        authorName,
        authorRole: role,
        authorEmail: this.userEmail() || undefined,
        content: content.trim(),
        clientFingerprint: this.userFingerprint(),
      });

      if (data) {
        const updated = data.question;
        if (updated) {
          this.questions.update(list => list.map(q => q.id === questionId ? updated : q));
          this.firebaseService.updateQuestionInFirestore(code, questionId, {
            humanAnswers: updated.humanAnswers,
          });
        }
        this.showToast('Answer posted!');
        await this.refreshSessionData(true);
        return true;
      }
      this.showToast('Failed to post answer');
      return false;
    } catch (err) {
      console.error('Error submitting answer:', err);
      return false;
    }
  }

  // Delete Human Answer
  public async deleteHumanAnswer(questionId: string, answerId: string): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    try {
      const data = await this.api.deleteHumanAnswer(code, questionId, answerId, {
        clientFingerprint: this.userFingerprint(),
        isAdmin: this.isAdmin() || this.isSpeaker(),
      });

      if (data) {
        const updated = data.question;
        if (updated) {
          this.questions.update(list => list.map(q => q.id === questionId ? updated : q));
          this.firebaseService.updateQuestionInFirestore(code, questionId, {
            humanAnswers: updated.humanAnswers,
          });
        }
        this.showToast('Answer deleted');
        await this.refreshSessionData(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error deleting answer:', err);
      return false;
    }
  }

  // Update Grounding Context
  public async updateGroundingContext(contextData: string): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    try {
      const ok = await this.api.updateGroundingContext(code, contextData);
      if (ok) {
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

  /**
   * Extract grounding text from a file and persist the original binary to
   * Firebase Storage. Metadata is merged onto the session Firestore doc when
   * a join code is available.
   */
  public async ingestGroundingFile(
    file: File,
    opts?: { sessionCode?: string }
  ): Promise<{
    text: string;
    method: 'plain' | 'gemini-ocr' | 'openxml';
    charCount: number;
    storage: GroundingFileMeta | null;
  }> {
    const { extractGroundingTextFromFile, resolveClientMimeType } = await import(
      '../utils/document-extract'
    );
    const extracted = await extractGroundingTextFromFile(file);
    const code =
      opts?.sessionCode ||
      this.currentSession()?.joinCode ||
      this.currentSeries()?.joinCode ||
      'PENDING';

    let storage: GroundingFileMeta | null = null;
    try {
      storage = await this.firebaseService.uploadGroundingFile(code, file, {
        contentType: resolveClientMimeType(file),
        extractionMethod: extracted.method,
        charCount: extracted.charCount,
      });
      if (storage && code !== 'PENDING') {
        await this.firebaseService.appendGroundingFileMeta(code, storage);
        this.currentSession.update((s) =>
          s
            ? {
                ...s,
                groundingFiles: [...(s.groundingFiles || []).filter((f) => f.id !== storage!.id), storage!],
              }
            : null
        );
      }
    } catch (err) {
      console.warn('Grounding Storage upload skipped:', err);
    }

    return {
      text: extracted.text,
      method: extracted.method,
      charCount: extracted.charCount,
      storage,
    };
  }

  // Update Session Settings
  public async updateSettings(settings: Partial<Session['settings']>): Promise<boolean> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return false;

    try {
      const ok = await this.api.updateSettings(code, settings);
      if (ok) {
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

    return this.api.translateText(code, text, targetLanguage);
  }

  // Generate Executive Post-Session Report
  public async generatePostSessionReport(): Promise<PostSessionReport | null> {
    const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
    if (!code) return null;

    this.isLoading.set(true);
    try {
      const report = await this.api.generatePostSessionReport(code);
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
      const report = await this.api.fetchSeriesReport(code);
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
      return await this.api.banParticipant(code, fingerprint, banned);
    } catch (err) {
      console.error('Error banning participant:', err);
      return false;
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

