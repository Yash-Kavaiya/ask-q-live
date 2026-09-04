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
  onSnapshot,
  query,
  orderBy,
  Unsubscribe,
  limit,
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  signInAnonymously,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import firebaseConfigData from '../../../firebase-applet-config.json';
import { Question, Session, QuestionStatus } from '../models/qa.models';

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  public app: FirebaseApp | null = null;
  public db: Firestore | null = null;
  public auth: Auth | null = null;

  public currentUser = signal<User | null>(null);
  public isConnected = signal<boolean>(false);
  public connectionStatus = signal<'initializing' | 'connected' | 'offline' | 'error'>('initializing');
  public lastError = signal<string | null>(null);

  private activeUnsubscribes: Unsubscribe[] = [];

  constructor() {
    this.initFirebase();
  }

  private async initFirebase(): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        return;
      }

      if (!firebaseConfigData || !firebaseConfigData.projectId) {
        this.connectionStatus.set('offline');
        return;
      }

      // Initialize Firebase App
      this.app = getApps().length ? getApp() : initializeApp(firebaseConfigData);

      // Initialize Firestore with specific database ID if provided
      if (firebaseConfigData.firestoreDatabaseId) {
        this.db = getFirestore(this.app, firebaseConfigData.firestoreDatabaseId);
      } else {
        this.db = getFirestore(this.app);
      }

      // Initialize Auth
      this.auth = getAuth(this.app);

      onAuthStateChanged(this.auth, (user) => {
        this.currentUser.set(user);
        if (user) {
          this.isConnected.set(true);
          this.connectionStatus.set('connected');
        }
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
      this.isConnected.set(false);
      this.connectionStatus.set('offline');
      this.lastError.set(err instanceof Error ? err.message : 'Firebase initialization failed');
    }
  }

  // Organizer Authentication Check: Must be logged in and NOT anonymous
  public isOrganizerLoggedIn(): boolean {
    const user = this.currentUser();
    return !!user && !user.isAnonymous;
  }

  // Google Sign-In helper (for organizers and presenters)
  public async signInWithGoogle(): Promise<User | null> {
    if (!this.auth) return null;
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.auth, provider);
      this.currentUser.set(result.user);
      return result.user;
    } catch (err: unknown) {
      console.warn('Google sign-in error:', err);
      throw err;
    }
  }

  // Email & Password Sign In for Organizers
  public async signInWithEmail(email: string, pass: string): Promise<User | null> {
    if (!this.auth) return null;
    try {
      const result = await signInWithEmailAndPassword(this.auth, email.trim(), pass);
      this.currentUser.set(result.user);
      return result.user;
    } catch (err: unknown) {
      console.warn('Email sign-in error:', err);
      throw err;
    }
  }

  // Email & Password Sign Up for Organizers
  public async signUpWithEmail(email: string, pass: string, displayName?: string): Promise<User | null> {
    if (!this.auth) return null;
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email.trim(), pass);
      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
      }
      this.currentUser.set(result.user);
      return result.user;
    } catch (err: unknown) {
      console.warn('Email sign-up error:', err);
      throw err;
    }
  }

  // Sign out
  public async logOut(): Promise<void> {
    if (!this.auth) return;
    try {
      await signOut(this.auth);
      this.currentUser.set(null);
      await signInAnonymously(this.auth);
    } catch (err) {
      console.warn('Sign out error:', err);
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
          upvotes: question.upvotes || 0,
          isSpam: question.isSpam || false,
          spamScore: question.spamScore ?? 0,
          flagReason: question.flagReason || '',
          status: question.status || 'APPROVED',
          sentimentScore: question.sentimentScore ?? 0,
          clusteredWithId: question.clusteredWithId || '',
          clusterCount: question.clusterCount ?? 0,
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
