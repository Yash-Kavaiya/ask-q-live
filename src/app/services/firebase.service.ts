import { Injectable, signal } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  Unsubscribe,
  limit,
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  User,
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import firebaseConfigData from '../../../firebase-applet-config.json';
import { resolveFirebaseApiKey } from '../firebase';
import { Question, Session, QuestionStatus, Segment, Series, SessionSeries } from '../models/qa.models';
import {
  clean,
  fromFirestoreSeries,
  fromFirestoreSegment,
  normalizeInviteEmail,
  speakerInviteDocId,
  toFirestoreSegment,
  toFirestoreSeries,
  FirestoreSeriesDoc,
  FirestoreSpeakerInviteClaim,
} from './firestore-series.mapper';

export { formatFirebaseAuthError } from './firebase-auth-errors';

/** Minimal organizer identity used by UI + guards (Firebase User or local fallback). */
export interface OrganizerAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
}

interface LocalAccountRecord {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  /** Absent means a legacy unsalted SHA-256 hash; upgraded on next successful sign-in. */
  passwordSalt?: string;
  createdAt: string;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  public app: FirebaseApp | null = null;
  public db: Firestore | null = null;
  public auth: Auth | null = null;

  public currentUser = signal<OrganizerAuthUser | null>(null);
  public isConnected = signal<boolean>(false);
  public connectionStatus = signal<'initializing' | 'connected' | 'offline' | 'error'>('initializing');
  public lastError = signal<string | null>(null);
  /** True when Firebase Auth is unavailable and browser-local host accounts are used. */
  public localAuthFallback = signal<boolean>(false);

  private activeUnsubscribes: Unsubscribe[] = [];

  private static readonly AUTH_READY_TIMEOUT_MS = 5000;
  private static readonly LOCAL_ACCOUNTS_KEY = 'askq_local_organizer_accounts';
  private static readonly LOCAL_SESSION_KEY = 'askq_local_organizer_session';
  private static readonly PBKDF2_ITERATIONS = 100_000;
  private static readonly PBKDF2_KEY_LENGTH_BITS = 256;
  private static readonly MIN_LOCAL_PASSWORD_LENGTH = 6;

  // Resolves once Firebase has had a chance to rehydrate persisted auth (i.e.
  // on the FIRST onAuthStateChanged emission), or after AUTH_READY_TIMEOUT_MS
  // if Firebase is unreachable/misconfigured so navigation never hangs.
  // Route guards await this before reading isOrganizerLoggedIn(), otherwise a
  // cold boot on /host would bounce a genuinely signed-in organizer to /auth.
  private resolveAuthReady: (() => void) | null = null;
  public readonly authReady: Promise<void> = new Promise<void>((resolve) => {
    this.resolveAuthReady = resolve;
  });

  constructor() {
    this.initFirebase();
  }

  private markAuthReady(): void {
    const resolve = this.resolveAuthReady;
    if (resolve) {
      this.resolveAuthReady = null;
      resolve();
    }
  }

  private enableLocalAuthFallback(reason: string): void {
    this.auth = null;
    this.localAuthFallback.set(true);
    this.isConnected.set(false);
    this.connectionStatus.set('offline');
    this.lastError.set(reason);
    this.restoreLocalSession();
    console.warn('Local organizer auth fallback active:', reason);
  }

  private restoreLocalSession(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(FirebaseService.LOCAL_SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw) as OrganizerAuthUser;
      if (session?.uid && session.email && !session.isAnonymous) {
        this.currentUser.set({
          uid: session.uid,
          email: session.email,
          displayName: session.displayName || null,
          isAnonymous: false,
        });
      }
    } catch {
      localStorage.removeItem(FirebaseService.LOCAL_SESSION_KEY);
    }
  }

  private persistLocalSession(user: OrganizerAuthUser): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(FirebaseService.LOCAL_SESSION_KEY, JSON.stringify(user));
  }

  private clearLocalSession(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(FirebaseService.LOCAL_SESSION_KEY);
  }

  private readLocalAccounts(): LocalAccountRecord[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(FirebaseService.LOCAL_ACCOUNTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as LocalAccountRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeLocalAccounts(accounts: LocalAccountRecord[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(FirebaseService.LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  /** Legacy unsalted hash, kept only to verify accounts created before salting was added. */
  private async hashPasswordLegacy(password: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return bytesToHex(digest);
  }

  private async hashPassword(password: string, salt: string): Promise<string> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(salt),
        iterations: FirebaseService.PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      FirebaseService.PBKDF2_KEY_LENGTH_BITS
    );
    return bytesToHex(bits);
  }

  private generateSalt(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  private async signUpLocally(
    email: string,
    pass: string,
    displayName?: string
  ): Promise<OrganizerAuthUser> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !pass || pass.length < FirebaseService.MIN_LOCAL_PASSWORD_LENGTH) {
      throw new Error(
        `Please provide a valid email and a password of at least ${FirebaseService.MIN_LOCAL_PASSWORD_LENGTH} characters.`
      );
    }

    const accounts = this.readLocalAccounts();
    if (accounts.some((a) => a.email === normalizedEmail)) {
      throw new Error('An account with this email already exists. Try signing in instead.');
    }

    const user: OrganizerAuthUser = {
      uid: 'local_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20),
      email: normalizedEmail,
      displayName: (displayName || '').trim() || normalizedEmail.split('@')[0],
      isAnonymous: false,
    };

    const salt = this.generateSalt();
    accounts.push({
      uid: user.uid,
      email: normalizedEmail,
      displayName: user.displayName || normalizedEmail.split('@')[0],
      passwordHash: await this.hashPassword(pass, salt),
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    });
    this.writeLocalAccounts(accounts);
    this.persistLocalSession(user);
    this.currentUser.set(user);
    return user;
  }

  private async signInLocally(email: string, pass: string): Promise<OrganizerAuthUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const accounts = this.readLocalAccounts();
    const account = accounts.find((a) => a.email === normalizedEmail);
    if (!account) {
      throw new Error('No account found for this email. Create a host account first.');
    }

    const isMatch = account.passwordSalt
      ? (await this.hashPassword(pass, account.passwordSalt)) === account.passwordHash
      : (await this.hashPasswordLegacy(pass)) === account.passwordHash;
    if (!isMatch) {
      throw new Error('Incorrect password. Please try again.');
    }

    if (!account.passwordSalt) {
      // Transparently upgrade legacy unsalted accounts on next successful sign-in.
      const salt = this.generateSalt();
      account.passwordSalt = salt;
      account.passwordHash = await this.hashPassword(pass, salt);
      this.writeLocalAccounts(accounts);
    }

    const user: OrganizerAuthUser = {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      isAnonymous: false,
    };
    this.persistLocalSession(user);
    this.currentUser.set(user);
    return user;
  }

  private async initFirebase(): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        // SSR: there is no persisted auth to wait for.
        this.markAuthReady();
        return;
      }

      // Safety net: resolve anyway if Firebase never calls back.
      setTimeout(() => this.markAuthReady(), FirebaseService.AUTH_READY_TIMEOUT_MS);

      if (!firebaseConfigData || !firebaseConfigData.projectId) {
        this.enableLocalAuthFallback('Firebase project config is missing');
        this.markAuthReady();
        return;
      }

      // Resolve apiKey: SSR inject, firebase-runtime-config.js (ng serve), or process.env
      const apiKey = resolveFirebaseApiKey();

      if (!apiKey) {
        this.enableLocalAuthFallback('Firebase API key is not configured');
        this.markAuthReady();
        return;
      }

      const config = { ...firebaseConfigData, apiKey };

      // Initialize Firebase App
      this.app = getApps().length ? getApp() : initializeApp(config);


      // Initialize Firestore with specific database ID if provided
      if (firebaseConfigData.firestoreDatabaseId) {
        this.db = getFirestore(this.app, firebaseConfigData.firestoreDatabaseId);
      } else {
        this.db = getFirestore(this.app);
      }

      // Initialize Auth
      this.auth = getAuth(this.app);

      onAuthStateChanged(this.auth, (user) => {
        this.currentUser.set(user ? this.toOrganizerAuthUser(user) : null);
        if (user) {
          this.isConnected.set(true);
          this.connectionStatus.set('connected');
        }
        // First emission means persisted auth (if any) has been restored.
        this.markAuthReady();
      });

      // Sign in anonymously if not authenticated
      if (!this.auth.currentUser) {
        try {
          await signInAnonymously(this.auth);
        } catch (authErr) {
          console.warn('Anonymous auth note (fallback mode active):', authErr);
        }
      }

      this.isConnected.set(true);
      this.connectionStatus.set('connected');
    } catch (err: unknown) {
      console.warn('Firebase initialization note (hybrid fallback active):', err);
      this.enableLocalAuthFallback(
        err instanceof Error ? err.message : 'Firebase initialization failed'
      );
      this.markAuthReady();
    }
  }

  // Organizer Authentication Check: Must be logged in and NOT anonymous
  public isOrganizerLoggedIn(): boolean {
    const user = this.currentUser();
    return !!user && !user.isAnonymous;
  }

  private toOrganizerAuthUser(user: User, displayNameOverride?: string): OrganizerAuthUser {
    return {
      uid: user.uid,
      email: user.email,
      displayName: displayNameOverride || user.displayName,
      isAnonymous: user.isAnonymous,
    };
  }

  // Google Sign-In helper (for organizers and presenters)
  public async signInWithGoogle(): Promise<OrganizerAuthUser | null> {
    if (!this.auth) {
      throw new Error(
        'Google sign-in needs Firebase Auth. Add FIREBASE_API_KEY to .env (or Cloud Run secrets), restart the app, then try again. Email/password still works offline via local host accounts.'
      );
    }
    try {
      // Drop any local-only session so Firebase Google identity becomes the source of truth.
      this.clearLocalSession();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      provider.addScope('profile');
      provider.addScope('email');
      const result = await signInWithPopup(this.auth, provider);
      const user = this.toOrganizerAuthUser(result.user);
      this.currentUser.set(user);
      this.localAuthFallback.set(false);
      this.connectionStatus.set('connected');
      this.isConnected.set(true);
      return user;
    } catch (err: unknown) {
      console.warn('Google sign-in error:', err);
      throw err;
    }
  }

  // Email & Password Sign In for Organizers
  public async signInWithEmail(email: string, pass: string): Promise<OrganizerAuthUser | null> {
    if (!this.auth) {
      return this.signInLocally(email, pass);
    }
    try {
      const result = await signInWithEmailAndPassword(this.auth, email.trim(), pass);
      const user = this.toOrganizerAuthUser(result.user);
      this.currentUser.set(user);
      return user;
    } catch (err: unknown) {
      console.warn('Email sign-in error:', err);
      throw err;
    }
  }

  // Email & Password Sign Up for Organizers
  public async signUpWithEmail(
    email: string,
    pass: string,
    displayName?: string
  ): Promise<OrganizerAuthUser | null> {
    if (!this.auth) {
      return this.signUpLocally(email, pass, displayName);
    }
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email.trim(), pass);
      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
      }
      const user = this.toOrganizerAuthUser(result.user, displayName);
      this.currentUser.set(user);
      return user;
    } catch (err: unknown) {
      console.warn('Email sign-up error:', err);
      throw err;
    }
  }

  // Sign out
  public async logOut(): Promise<void> {
    this.clearLocalSession();
    if (!this.auth) {
      this.currentUser.set(null);
      return;
    }
    try {
      await signOut(this.auth);
      this.currentUser.set(null);
      await signInAnonymously(this.auth);
    } catch (err) {
      console.warn('Sign out error:', err);
      this.currentUser.set(null);
    }
  }

  // --- Real-time Firestore Listeners ---

  /**
   * Listen to real-time questions in a session
   */
  public listenToQuestions(
    sessionId: string,
    callback: (questions: Question[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe | null {
    if (!this.db) return null;
    const cleanSessionId = sessionId.toUpperCase().trim();

    try {
      const questionsCol = collection(this.db, 'sessions', cleanSessionId, 'questions');
      const qQuery = query(questionsCol, orderBy('createdAt', 'desc'), limit(200));

      const unsub = onSnapshot(
        qQuery,
        (snapshot) => {
          const questions: Question[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            questions.push({
              id: docSnap.id,
              sessionId: cleanSessionId,
              clientFingerprint: data['clientFingerprint'] || '',
              authorName: data['authorName'] || 'Attendee',
              isAnonymous: data['isAnonymous'] || false,
              content: data['content'] || '',
              category: data['category'] || 'General',
              aiLine1: data['aiLine1'],
              aiLine2: data['aiLine2'],
              aiConfidence: data['aiConfidence'],
              aiStatus: data['aiStatus'] || 'IDLE',
              isGroundedOnDeck: data['isGroundedOnDeck'] !== undefined ? !!data['isGroundedOnDeck'] : false,
              ragModel: data['ragModel'],
              topSimilarity: data['topSimilarity'],
              upvotes: Number(data['upvotes']) || 0,
              isSpam: !!data['isSpam'],
              spamScore: data['spamScore'],
              flagReason: data['flagReason'],
              status: (data['status'] as QuestionStatus) || 'APPROVED',
              sentimentScore: data['sentimentScore'],
              clusteredWithId: data['clusteredWithId'],
              clusterCount: data['clusterCount'],
              createdAt: data['createdAt'] || new Date().toISOString(),
              updatedAt: data['updatedAt'] || data['createdAt'] || new Date().toISOString(),
            });
          });
          callback(questions);
        },
        (error) => {
          console.warn('Firestore questions listener notice:', error);
          if (onError) onError(error);
        }
      );

      this.activeUnsubscribes.push(unsub);
      return unsub;
    } catch (err: unknown) {
      console.warn('Could not establish Firestore questions listener:', err);
      return null;
    }
  }

  /**
   * Listen to real-time session metadata updates (title, grounding context, settings)
   */
  public listenToSession(
    sessionId: string,
    callback: (session: Session | null) => void
  ): Unsubscribe | null {
    if (!this.db) return null;
    const cleanSessionId = sessionId.toUpperCase().trim();

    try {
      const sessionDocRef = doc(this.db, 'sessions', cleanSessionId);
      const unsub = onSnapshot(
        sessionDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const session: Session = {
              id: snapshot.id,
              joinCode: data['joinCode'] || cleanSessionId,
              adminToken: data['adminToken'] || '',
              title: data['title'] || 'Live Q&A Session',
              description: data['description'] || '',
              contextData: data['contextData'] || '',
              isActive: data['isActive'] !== false,
              createdAt: data['createdAt'] || new Date().toISOString(),
              categories: data['categories'] || ['General', 'Technical', 'Product', 'Business'],
              settings: data['settings'] || {
                autoAiAnswers: true,
                autoClustering: true,
                autoModeration: true,
                allowAnonymous: true,
                showTeleprompter: true,
                sentimentAnalysis: true,
              },
            };
            callback(session);
          } else {
            callback(null);
          }
        },
        (error) => {
          console.warn('Firestore session listener notice:', error);
        }
      );

      this.activeUnsubscribes.push(unsub);
      return unsub;
    } catch (err: unknown) {
      console.warn('Could not establish Firestore session listener:', err);
      return null;
    }
  }

  /**
   * Direct Firestore write helpers (mirroring / augmenting backend)
   */
  public async syncSessionToFirestore(session: Session): Promise<boolean> {
    if (!this.db || !session) return false;
    try {
      const sessionRef = doc(this.db, 'sessions', session.joinCode);
      await setDoc(
        sessionRef,
        {
          id: session.id,
          joinCode: session.joinCode,
          adminToken: session.adminToken || '',
          title: session.title,
          description: session.description || '',
          contextData: session.contextData || '',
          isActive: session.isActive,
          createdAt: session.createdAt,
          categories: session.categories || ['General'],
          settings: session.settings || {},
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return true;
    } catch (err) {
      console.warn('Firestore syncSession note:', err);
      return false;
    }
  }

  public async syncQuestionToFirestore(sessionId: string, question: Question): Promise<boolean> {
    if (!this.db) return false;
    try {
      const cleanSessionId = sessionId.toUpperCase().trim();
      const questionRef = doc(this.db, 'sessions', cleanSessionId, 'questions', question.id);
      await setDoc(
        questionRef,
        {
          id: question.id,
          sessionId: cleanSessionId,
          clientFingerprint: question.clientFingerprint,
          authorName: question.authorName,
          isAnonymous: question.isAnonymous,
          content: question.content,
          category: question.category,
          aiLine1: question.aiLine1 || '',
          aiLine2: question.aiLine2 || '',
          aiConfidence: question.aiConfidence ?? 0,
          aiStatus: question.aiStatus || 'IDLE',
          isGroundedOnDeck: question.isGroundedOnDeck ?? false,
          ragModel: question.ragModel || '',
          topSimilarity: question.topSimilarity ?? 0,
          upvotes: question.upvotes || 0,
          isSpam: question.isSpam || false,
          spamScore: question.spamScore ?? 0,
          flagReason: question.flagReason || '',
          status: question.status || 'APPROVED',
          sentimentScore: question.sentimentScore ?? 0,
          clusteredWithId: question.clusteredWithId || '',
          clusterCount: question.clusterCount ?? 0,
          humanAnswers: question.humanAnswers || [],
          createdAt: question.createdAt,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return true;
    } catch (err) {
      console.warn('Firestore syncQuestion note:', err);
      return false;
    }
  }

  public async updateQuestionInFirestore(
    sessionId: string,
    questionId: string,
    updates: Partial<Question>
  ): Promise<boolean> {
    if (!this.db) return false;
    try {
      const cleanSessionId = sessionId.toUpperCase().trim();
      const questionRef = doc(this.db, 'sessions', cleanSessionId, 'questions', questionId);
      await updateDoc(questionRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      console.warn('Firestore updateQuestion note:', err);
      return false;
    }
  }

  public async deleteQuestionFromFirestore(sessionId: string, questionId: string): Promise<boolean> {
    if (!this.db) return false;
    try {
      const cleanSessionId = sessionId.toUpperCase().trim();
      const questionRef = doc(this.db, 'sessions', cleanSessionId, 'questions', questionId);
      await deleteDoc(questionRef);
      return true;
    } catch (err) {
      console.warn('Firestore deleteQuestion note:', err);
      return false;
    }
  }

  // --- Series / Segment persistence (structured Firestore layout) ---
  //
  // series/{JOINCODE}                      series metadata (no raw Gemini key)
  // series/{JOINCODE}/segments/{segId}     talk + nested speaker profile
  // speakerInvites/{email}/claims/{id}     email → segment claim index

  /**
   * Persist a full series document + every segment in one batch.
   * Does NOT write geminiApiKey (server-only secret).
   */
  public async syncSeriesToFirestore(
    series: Series | SessionSeries,
    options?: { hasCustomGeminiKey?: boolean }
  ): Promise<boolean> {
    if (!this.db || !series?.joinCode) return false;

    try {
      const joinCode = series.joinCode.toUpperCase().trim();
      const nowIso = new Date().toISOString();
      const batch = writeBatch(this.db);
      const seriesRef = doc(this.db, 'series', joinCode);
      const seriesDoc = toFirestoreSeries(series, {
        hasCustomGeminiKey: options?.hasCustomGeminiKey,
        creatorUid: this.currentUser()?.uid || series.creatorUid,
      });

      batch.set(seriesRef, seriesDoc, { merge: true });

      for (const seg of series.segments || []) {
        const segDoc = toFirestoreSegment({ id: series.id, joinCode }, seg, nowIso);
        const segRef = doc(this.db, 'series', joinCode, 'segments', seg.id);
        batch.set(segRef, segDoc, { merge: true });

        if (segDoc.speaker.email) {
          const inviteRef = doc(
            this.db,
            'speakerInvites',
            normalizeInviteEmail(segDoc.speaker.email),
            'claims',
            speakerInviteDocId(joinCode, seg.id)
          );
          const claim: FirestoreSpeakerInviteClaim = {
            joinCode,
            seriesTitle: seriesDoc.title,
            seriesState: seriesDoc.state,
            segmentId: seg.id,
            segmentTitle: segDoc.title,
            speakerName: segDoc.speaker.name,
            speakerEmail: segDoc.speaker.email,
            adminToken: clean(seg.adminToken),
            status: segDoc.status,
            order: segDoc.order,
            updatedAt: nowIso,
          };
          batch.set(inviteRef, claim, { merge: true });
        }
      }

      // Keep the mirrored session shell in sync for Q&A listeners
      const sessionRef = doc(this.db, 'sessions', joinCode);
      batch.set(
        sessionRef,
        {
          id: series.id || joinCode,
          joinCode,
          title: seriesDoc.title,
          description: seriesDoc.description,
          isActive: seriesDoc.state === 'LIVE' || seriesDoc.state === 'SCHEDULED',
          type: 'series',
          seriesId: series.id || joinCode,
          updatedAt: nowIso,
          createdAt: seriesDoc.createdAt,
        },
        { merge: true }
      );

      await batch.commit();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Firestore syncSeries failed';
      console.warn('Firestore syncSeries note:', err);
      this.lastError.set(message);
      return false;
    }
  }

  /** Persist one segment (+ speaker invite index when email present). */
  public async syncSegmentToFirestore(
    series: Pick<Series, 'id' | 'joinCode' | 'title' | 'state'>,
    seg: Segment
  ): Promise<boolean> {
    if (!this.db || !series?.joinCode || !seg?.id) return false;

    try {
      const joinCode = series.joinCode.toUpperCase().trim();
      const nowIso = new Date().toISOString();
      const segDoc = toFirestoreSegment({ id: series.id, joinCode }, seg, nowIso);
      const batch = writeBatch(this.db);

      batch.set(doc(this.db, 'series', joinCode, 'segments', seg.id), segDoc, { merge: true });
      batch.set(
        doc(this.db, 'series', joinCode),
        {
          updatedAt: nowIso,
          revision: Date.now(),
        },
        { merge: true }
      );

      const email = segDoc.speaker.email;
      if (email) {
        const claim: FirestoreSpeakerInviteClaim = {
          joinCode,
          seriesTitle: series.title || joinCode,
          seriesState: series.state || 'SCHEDULED',
          segmentId: seg.id,
          segmentTitle: segDoc.title,
          speakerName: segDoc.speaker.name,
          speakerEmail: email,
          adminToken: clean(seg.adminToken),
          status: segDoc.status,
          order: segDoc.order,
          updatedAt: nowIso,
        };
        batch.set(
          doc(
            this.db,
            'speakerInvites',
            normalizeInviteEmail(email),
            'claims',
            speakerInviteDocId(joinCode, seg.id)
          ),
          claim,
          { merge: true }
        );
      }

      await batch.commit();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Firestore syncSegment failed';
      console.warn('Firestore syncSegment note:', err);
      this.lastError.set(message);
      return false;
    }
  }

  /** Load series metadata + segments from Firestore (for cold recovery / merge). */
  public async loadSeriesFromFirestore(joinCode: string): Promise<{
    series: Partial<Series>;
    segments: Segment[];
  } | null> {
    if (!this.db) return null;
    const code = joinCode.toUpperCase().trim();

    try {
      const seriesSnap = await getDoc(doc(this.db, 'series', code));
      if (!seriesSnap.exists()) return null;

      const data = seriesSnap.data() as Partial<FirestoreSeriesDoc>;
      const segsSnap = await getDocs(
        query(collection(this.db, 'series', code, 'segments'), orderBy('order', 'asc'))
      );
      const segments = segsSnap.docs.map(d =>
        fromFirestoreSegment({ ...(d.data() as object), id: d.id }, d.id)
      );

      return {
        series: fromFirestoreSeries(data, code, segments),
        segments,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Firestore loadSeries failed';
      console.warn('Firestore loadSeries note:', err);
      this.lastError.set(message);
      return null;
    }
  }

  /** Email-indexed speaker claims (mirrors /api/speaker/invites when online). */
  public async loadSpeakerInvitesFromFirestore(email: string): Promise<FirestoreSpeakerInviteClaim[]> {
    if (!this.db) return [];
    const normalized = normalizeInviteEmail(email);
    if (!normalized.includes('@')) return [];

    try {
      const snap = await getDocs(collection(this.db, 'speakerInvites', normalized, 'claims'));
      return snap.docs
        .map(d => d.data() as FirestoreSpeakerInviteClaim)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Firestore loadSpeakerInvites failed';
      console.warn('Firestore loadSpeakerInvites note:', err);
      this.lastError.set(message);
      return [];
    }
  }

  /**
   * Clean up all active Firestore listeners
   */
  public clearListeners(): void {
    this.activeUnsubscribes.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
    this.activeUnsubscribes = [];
  }
}
