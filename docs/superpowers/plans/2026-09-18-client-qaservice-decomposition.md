# Client QaService Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the three framework/infrastructure concerns woven through `src/app/services/qa.service.ts` (2,279 lines: 38 raw `fetch` calls, 25 raw `localStorage` calls, filtering/sorting business logic inline in computed signals) out into dedicated, independently unit-testable pieces, so `QaService`'s own logic can eventually be tested without a live network, a real `localStorage`, or the Angular test harness.

**Architecture:** A pure module (`question-filters.ts`) holds the filtering/sorting rules with zero Angular dependency. An injectable `ClientStorageService` wraps every `localStorage` key behind typed methods (SSR-safe by construction — the `typeof window` guard lives in one place instead of 25). An injectable `SessionApiClient` wraps every `/api/*` call behind typed methods that do nothing but fetch, parse, and throw on failure — no signals, no toasts, no Firestore sync, no business decisions. `QaService` keeps every signal, every toast, every Firestore-sync call, every piece of orchestration logic it has today; it just calls `this.filters.*`, `this.storage.*`, and `this.api.*` instead of touching `fetch`/`localStorage` inline.

**Tech Stack:** Angular 21 (standalone services via `providedIn: 'root'`), TypeScript, Vitest. There is currently **no unit test coverage** for `qa.service.ts` (only a placeholder `app.spec.ts`) — this plan's tests are the first ones written against this code, so each task's tests are the safety net, not a supplement to an existing one. Be conservative: prefer an extra assertion over skipping one.

**Spec:** No separate spec doc — this plan argues from the clean-architecture audit performed earlier in this session (chat transcript), which cites exact file:line locations in `qa.service.ts` for every call site listed below.

## Global Constraints

- Every task ends with `npm test` green and `npx tsc -p tsconfig.app.json --noEmit` clean.
- No behavior changes: request URLs, HTTP methods, headers, and request/response bodies must stay byte-for-byte identical to what `qa.service.ts` sends today. This is a structural refactor. If a gateway method's shape doesn't match what a step below shows, re-check the current `qa.service.ts` source rather than "improving" it.
- `QaService`'s public method signatures (the ones components call: `joinSession`, `createSession`, `createSeries`, `submitQuestion`, `toggleUpvote`, etc.) do not change. Only their internal implementation changes.
- `localStorage` and `fetch` access must remain SSR-safe: every current call site is guarded by `typeof window !== 'undefined' && window.localStorage` (for storage) or is already inside client-only code paths (for fetch, since `QaService`'s network methods are only ever invoked from browser event handlers/effects, never during SSR render). `ClientStorageService` must preserve the same guard; `SessionApiClient` doesn't need one since `fetch` exists in both server and browser Node runtimes used here, and none of these calls happen during SSR render today (verify this assumption holds for each method as you migrate it — if you find one that's called during SSR, flag it rather than silently changing behavior).
- Do not touch `src/app/services/firebase.service.ts` — Firestore sync calls inside `QaService` stay exactly where they are; only `fetch`/`localStorage`/filter logic move.
- **Out of scope, by design:** `QaService`'s direct use of Angular's `Router` (the two `effect()` blocks and `syncNavigationWithRouter`/`navigateToTab`/etc.) is not extracted behind a port in this plan. Angular already ships `RouterTestingModule`/`provideRouter` specifically so router-coupled code can be unit-tested without a real browser — wrapping `Router` in a bespoke interface here would add a layer Angular's own tooling already makes unnecessary, for a framework dependency that (unlike `fetch`/`localStorage`) is idiomatic to depend on directly in an Angular service. If this changes (e.g. `QaService`'s navigation logic needs to run outside Angular), revisit as a separate plan.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/utils/question-filters.ts` (new) | Pure functions: filter + sort the question list, select pending-moderation questions, select top-prioritized questions. Zero Angular imports. |
| `src/app/utils/question-filters.spec.ts` (new) | Unit tests for the above, run with plain Vitest (no Angular TestBed needed). |
| `src/app/services/client-storage.service.ts` (new) | Injectable wrapping every `localStorage` key used by `QaService` today. |
| `src/app/services/client-storage.service.spec.ts` (new) | Unit tests, mocking `window.localStorage`. |
| `src/app/services/session-api.client.ts` (new) | Injectable wrapping every `/api/*` fetch call used by `QaService` today. Pure I/O: parses JSON, throws `Error(serverMessage)` on a non-ok response, no side effects. |
| `src/app/services/session-api.client.spec.ts` (new) | Unit tests, mocking `global.fetch`. |
| `src/app/services/qa.service.ts` (modified) | Injects the three new services; every `fetch(...)`, `localStorage.*`, and inline filter/sort block is replaced by a call into one of them. No other behavior changes. |

---

### Task 1: Extract pure question filtering/sorting logic

**Files:**
- Create: `src/app/utils/question-filters.ts`
- Create: `src/app/utils/question-filters.spec.ts`
- Modify: `src/app/services/qa.service.ts`

**Context:** `qa.service.ts`'s `filteredQuestions` computed signal (today lines 425-504), `pendingModerationQuestions` (506-508), and `topPrioritizedQuestions` (511-516) contain the app's actual question-ranking business rules, but they're `computed()` closures inside an `@Injectable` that also does routing and network I/O — untestable without spinning up Angular's DI and signal system. None of this logic touches Angular or the DOM; it's ordinary array filtering/sorting.

**Interfaces:**
- Produces:
  ```ts
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

  export function filterAndSortQuestions(questions: Question[], state: QuestionFilterState): Question[];
  export function selectPendingModerationQuestions(questions: Question[]): Question[];
  export function selectTopPrioritizedQuestions(questions: Question[]): Question[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/utils/question-filters.spec.ts
import { describe, it, expect } from 'vitest';
import { filterAndSortQuestions, selectPendingModerationQuestions, selectTopPrioritizedQuestions, QuestionFilterState } from './question-filters';
import type { Question } from '../models/qa.models';

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q1',
    sessionId: 'S1',
    clientFingerprint: 'fp1',
    authorName: 'Attendee',
    isAnonymous: false,
    content: 'Why does this happen?',
    category: 'General',
    aiStatus: 'IDLE',
    isGroundedOnDeck: false,
    upvotes: 0,
    isSpam: false,
    status: 'APPROVED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Question;
}

const baseState: QuestionFilterState = {
  category: 'ALL',
  status: 'ALL',
  segmentFilter: 'ALL',
  search: '',
  sort: 'popular',
  userFingerprint: 'fp1',
  upvotedIds: new Set(),
  isModerationView: false,
  isSpeaker: false,
  speakerSegmentId: null,
};

describe('filterAndSortQuestions', () => {
  it('hides REJECTED questions outside the moderation view', () => {
    const questions = [makeQuestion({ id: 'q1', status: 'REJECTED' }), makeQuestion({ id: 'q2', status: 'APPROVED' })];
    const result = filterAndSortQuestions(questions, baseState);
    expect(result.map(q => q.id)).toEqual(['q2']);
  });

  it('hides other attendees\' PENDING_REVIEW questions but shows your own', () => {
    const questions = [
      makeQuestion({ id: 'mine', status: 'PENDING_REVIEW', clientFingerprint: 'fp1' }),
      makeQuestion({ id: 'other', status: 'PENDING_REVIEW', clientFingerprint: 'fp2' }),
    ];
    const result = filterAndSortQuestions(questions, baseState);
    expect(result.map(q => q.id)).toEqual(['mine']);
  });

  it('shows REJECTED and PENDING_REVIEW questions in the moderation view', () => {
    const questions = [makeQuestion({ id: 'q1', status: 'REJECTED' }), makeQuestion({ id: 'q2', status: 'PENDING_REVIEW', clientFingerprint: 'fp2' })];
    const result = filterAndSortQuestions(questions, { ...baseState, isModerationView: true });
    expect(result.map(q => q.id).sort()).toEqual(['q1', 'q2']);
  });

  it('filters a speaker to only their assigned segment, ignoring segmentFilter', () => {
    const questions = [makeQuestion({ id: 'mine', segmentId: 'seg-1' }), makeQuestion({ id: 'other', segmentId: 'seg-2' })];
    const result = filterAndSortQuestions(questions, { ...baseState, isSpeaker: true, speakerSegmentId: 'seg-1', segmentFilter: 'seg-2' });
    expect(result.map(q => q.id)).toEqual(['mine']);
  });

  it('filters by category', () => {
    const questions = [makeQuestion({ id: 'a', category: 'Technical' }), makeQuestion({ id: 'b', category: 'General' })];
    const result = filterAndSortQuestions(questions, { ...baseState, category: 'Technical' });
    expect(result.map(q => q.id)).toEqual(['a']);
  });

  it('MY_QUESTIONS status filter matches by clientFingerprint', () => {
    const questions = [makeQuestion({ id: 'mine', clientFingerprint: 'fp1' }), makeQuestion({ id: 'other', clientFingerprint: 'fp2' })];
    const result = filterAndSortQuestions(questions, { ...baseState, status: 'MY_QUESTIONS' });
    expect(result.map(q => q.id)).toEqual(['mine']);
  });

  it('UPVOTED status filter matches the upvotedIds set', () => {
    const questions = [makeQuestion({ id: 'up' }), makeQuestion({ id: 'down' })];
    const result = filterAndSortQuestions(questions, { ...baseState, status: 'UPVOTED', upvotedIds: new Set(['up']) });
    expect(result.map(q => q.id)).toEqual(['up']);
  });

  it('AI_ANSWERED status filter requires a READY aiLine1', () => {
    const questions = [
      makeQuestion({ id: 'answered', aiLine1: 'Because.', aiStatus: 'READY' }),
      makeQuestion({ id: 'unanswered' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, status: 'AI_ANSWERED' });
    expect(result.map(q => q.id)).toEqual(['answered']);
  });

  it('search matches content, authorName, speakerName, or AI answer lines', () => {
    const questions = [
      makeQuestion({ id: 'byContent', content: 'What about latency?' }),
      makeQuestion({ id: 'byAuthor', authorName: 'Latency Larry' }),
      makeQuestion({ id: 'noMatch', content: 'Unrelated' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, search: 'latency' });
    expect(result.map(q => q.id).sort()).toEqual(['byAuthor', 'byContent']);
  });

  it('sorts by popular: ANSWERING first, then highest upvotes, then newest', () => {
    const questions = [
      makeQuestion({ id: 'low', upvotes: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeQuestion({ id: 'high', upvotes: 10, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeQuestion({ id: 'answering', upvotes: 0, status: 'ANSWERING', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, sort: 'popular' });
    expect(result.map(q => q.id)).toEqual(['answering', 'high', 'low']);
  });

  it('sorts by recent: newest createdAt first', () => {
    const questions = [
      makeQuestion({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeQuestion({ id: 'new', createdAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const result = filterAndSortQuestions(questions, { ...baseState, sort: 'recent' });
    expect(result.map(q => q.id)).toEqual(['new', 'old']);
  });
});

describe('selectPendingModerationQuestions', () => {
  it('selects questions that are PENDING_REVIEW or flagged as spam', () => {
    const questions = [
      makeQuestion({ id: 'pending', status: 'PENDING_REVIEW' }),
      makeQuestion({ id: 'spam', isSpam: true }),
      makeQuestion({ id: 'clean' }),
    ];
    expect(selectPendingModerationQuestions(questions).map(q => q.id).sort()).toEqual(['pending', 'spam']);
  });
});

describe('selectTopPrioritizedQuestions', () => {
  it('selects up to 3 APPROVED/ANSWERING questions with upvotes, highest first', () => {
    const questions = [
      makeQuestion({ id: 'a', status: 'APPROVED', upvotes: 5 }),
      makeQuestion({ id: 'b', status: 'APPROVED', upvotes: 10 }),
      makeQuestion({ id: 'c', status: 'APPROVED', upvotes: 0 }),
      makeQuestion({ id: 'd', status: 'REJECTED', upvotes: 100 }),
      makeQuestion({ id: 'e', status: 'ANSWERING', upvotes: 3 }),
      makeQuestion({ id: 'f', status: 'APPROVED', upvotes: 20 }),
    ];
    const result = selectTopPrioritizedQuestions(questions);
    expect(result.map(q => q.id)).toEqual(['f', 'b', 'a']);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/utils/question-filters.spec.ts`
Expected: FAIL — `Cannot find module './question-filters'`

- [ ] **Step 3: Implement `question-filters.ts`**, copying the exact logic from `qa.service.ts`'s current `filteredQuestions`/`pendingModerationQuestions`/`topPrioritizedQuestions` computed signals verbatim (only the reactive-signal reads become plain parameters):

```ts
// src/app/utils/question-filters.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/utils/question-filters.spec.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Rewire `qa.service.ts`'s three computed signals**

Add the import: `import { filterAndSortQuestions, selectPendingModerationQuestions, selectTopPrioritizedQuestions } from '../utils/question-filters';`

Replace the body of `filteredQuestions` (today lines 425-504):
```ts
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
```

Replace the body of `pendingModerationQuestions` (today lines 506-508):
```ts
public pendingModerationQuestions = computed(() => selectPendingModerationQuestions(this.questions()));
```

Replace the body of `topPrioritizedQuestions` (today lines 511-516):
```ts
public topPrioritizedQuestions = computed(() => selectTopPrioritizedQuestions(this.questions()));
```

- [ ] **Step 6: Run the full suite**

Run: `npm test` — expect the 12 new tests plus the existing `app.spec.ts`/server tests to pass (this task doesn't touch server files).
Run: `npx tsc -p tsconfig.app.json --noEmit`.

Then run `npm run dev`, open the app, join or create a session, and manually confirm the question feed still filters/sorts/searches correctly (this signal renders on every list view — `question-feed.ts`, `moderation-queue.ts`, `teleprompter.ts` all read it).

- [ ] **Step 7: Commit**

```bash
git add src/app/utils/question-filters.ts src/app/utils/question-filters.spec.ts src/app/services/qa.service.ts
git commit -m "refactor: extract pure question filtering/sorting logic out of QaService"
```

---

### Task 2: `ClientStorageService`

**Files:**
- Create: `src/app/services/client-storage.service.ts`
- Create: `src/app/services/client-storage.service.spec.ts`
- Modify: `src/app/services/qa.service.ts`

**Context:** 25 `localStorage.*` call sites in `qa.service.ts` today, each individually guarded by `typeof window !== 'undefined' && window.localStorage`, touching these keys: `live_qa_fingerprint`, `live_qa_username`, `live_qa_email`, `live_qa_auth_token`, `live_qa_hosted_sessions_history`, and the per-session keys `askqlive_questions_${code}` / `askqlive_upvoted_${code}`.

**Interfaces:**
- Produces:
  ```ts
  @Injectable({ providedIn: 'root' })
  class ClientStorageService {
    getFingerprint(): string | null;
    setFingerprint(fp: string): void;
    getUsername(): string | null;
    setUsername(name: string): void;
    getEmail(): string | null;
    setEmail(email: string): void;
    getAuthToken(): string | null;
    setAuthToken(token: string): void;
    clearAuthToken(): void;
    getHostedSessionsHistory(): string | null;
    setHostedSessionsHistory(json: string): void;
    clearHostedSessionsHistory(): void;
    getCachedQuestions(joinCode: string): string | null;
    setCachedQuestions(joinCode: string, json: string): void;
    getUpvotedIds(joinCode: string): string | null;
    setUpvotedIds(joinCode: string, json: string): void;
  }
  ```
  Every method internally checks `typeof window !== 'undefined' && window.localStorage` and no-ops (returning `null` for getters) when unavailable — this centralizes the SSR guard that's currently repeated 25 times. Methods take/return raw strings (not parsed JSON) — `qa.service.ts` already does its own `JSON.parse`/`JSON.stringify` with try/catch around each call today; this task doesn't change that division of labor, it only moves the raw storage access.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/services/client-storage.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientStorageService } from './client-storage.service';

describe('ClientStorageService', () => {
  let service: ClientStorageService;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
    service = new ClientStorageService();
  });

  it('round-trips the fingerprint', () => {
    expect(service.getFingerprint()).toBeNull();
    service.setFingerprint('fp-abc123');
    expect(service.getFingerprint()).toBe('fp-abc123');
    expect(store['live_qa_fingerprint']).toBe('fp-abc123');
  });

  it('round-trips the auth token and clears it', () => {
    service.setAuthToken('org_secret');
    expect(service.getAuthToken()).toBe('org_secret');
    service.clearAuthToken();
    expect(service.getAuthToken()).toBeNull();
  });

  it('round-trips hosted-sessions-history and clears it', () => {
    service.setHostedSessionsHistory('[{"joinCode":"ABC"}]');
    expect(service.getHostedSessionsHistory()).toBe('[{"joinCode":"ABC"}]');
    service.clearHostedSessionsHistory();
    expect(service.getHostedSessionsHistory()).toBeNull();
  });

  it('scopes cached questions and upvoted ids by join code', () => {
    service.setCachedQuestions('ABC', '[{"id":"q1"}]');
    service.setCachedQuestions('XYZ', '[{"id":"q2"}]');
    expect(service.getCachedQuestions('ABC')).toBe('[{"id":"q1"}]');
    expect(service.getCachedQuestions('XYZ')).toBe('[{"id":"q2"}]');

    service.setUpvotedIds('ABC', '["q1"]');
    expect(service.getUpvotedIds('ABC')).toBe('["q1"]');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/services/client-storage.service.spec.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/app/services/client-storage.service.ts
import { Injectable } from '@angular/core';

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

@Injectable({ providedIn: 'root' })
export class ClientStorageService {
  private getItem(key: string): string | null {
    if (!hasLocalStorage()) return null;
    return localStorage.getItem(key);
  }

  private setItem(key: string, value: string): void {
    if (!hasLocalStorage()) return;
    localStorage.setItem(key, value);
  }

  private removeItem(key: string): void {
    if (!hasLocalStorage()) return;
    localStorage.removeItem(key);
  }

  getFingerprint(): string | null { return this.getItem('live_qa_fingerprint'); }
  setFingerprint(fp: string): void { this.setItem('live_qa_fingerprint', fp); }

  getUsername(): string | null { return this.getItem('live_qa_username'); }
  setUsername(name: string): void { this.setItem('live_qa_username', name); }

  getEmail(): string | null { return this.getItem('live_qa_email'); }
  setEmail(email: string): void { this.setItem('live_qa_email', email); }

  getAuthToken(): string | null { return this.getItem('live_qa_auth_token'); }
  setAuthToken(token: string): void { this.setItem('live_qa_auth_token', token); }
  clearAuthToken(): void { this.removeItem('live_qa_auth_token'); }

  getHostedSessionsHistory(): string | null { return this.getItem('live_qa_hosted_sessions_history'); }
  setHostedSessionsHistory(json: string): void { this.setItem('live_qa_hosted_sessions_history', json); }
  clearHostedSessionsHistory(): void { this.removeItem('live_qa_hosted_sessions_history'); }

  getCachedQuestions(joinCode: string): string | null { return this.getItem(`askqlive_questions_${joinCode}`); }
  setCachedQuestions(joinCode: string, json: string): void { this.setItem(`askqlive_questions_${joinCode}`, json); }

  getUpvotedIds(joinCode: string): string | null { return this.getItem(`askqlive_upvoted_${joinCode}`); }
  setUpvotedIds(joinCode: string, json: string): void { this.setItem(`askqlive_upvoted_${joinCode}`, json); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/services/client-storage.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Rewire every `localStorage.*` call site in `qa.service.ts`**

Add `private storage = inject(ClientStorageService);` alongside the existing `private router = inject(Router);` field, and the import `import { ClientStorageService } from './client-storage.service';`.

Migrate each of today's 25 call sites (grep with `grep -n "localStorage\." src/app/services/qa.service.ts` to re-locate them after Task 1's edits shift line numbers):

- `initUserIdentity` (fingerprint/username/email/authToken reads + the fingerprint write when generating a new one): `localStorage.getItem('live_qa_fingerprint')` → `this.storage.getFingerprint()`; `localStorage.setItem('live_qa_fingerprint', fp)` → `this.storage.setFingerprint(fp)`; `localStorage.getItem('live_qa_username')` → `this.storage.getUsername()`; `localStorage.getItem('live_qa_email')` → `this.storage.getEmail()`; `localStorage.getItem('live_qa_auth_token')` → `this.storage.getAuthToken()`. Note the `typeof window !== 'undefined' && window.localStorage` guard wrapping this whole block in `initUserIdentity` can stay (it also gates non-storage logic in that method) — just replace the inner calls; `ClientStorageService`'s own internal guard makes the double-check harmless.
- `setAttendeeIdentity`: the two `localStorage.setItem('live_qa_username'|'live_qa_email', ...)` calls → `this.storage.setUsername(name)` / `this.storage.setEmail(email)`.
- `checkUrlForTokens`: `localStorage.setItem('live_qa_auth_token', urlToken)` → `this.storage.setAuthToken(urlToken)`.
- `authenticateRole`: `localStorage.setItem('live_qa_auth_token', token.trim())` → `this.storage.setAuthToken(token.trim())`.
- `logoutRole`: `localStorage.removeItem('live_qa_auth_token')` → `this.storage.clearAuthToken()`.
- `loadHostedSessionHistory`: `localStorage.getItem('live_qa_hosted_sessions_history')` → `this.storage.getHostedSessionsHistory()`.
- `saveHostedSession`: `localStorage.setItem('live_qa_hosted_sessions_history', JSON.stringify(updated))` → `this.storage.setHostedSessionsHistory(JSON.stringify(updated))`.
- `removeHostedSession`: `localStorage.setItem('live_qa_hosted_sessions_history', JSON.stringify(filtered))` → `this.storage.setHostedSessionsHistory(JSON.stringify(filtered))`.
- `clearHostedSessions`: `localStorage.removeItem('live_qa_hosted_sessions_history')` → `this.storage.clearHostedSessionsHistory()`.
- `loadQuestionsLocally`: `localStorage.getItem(\`askqlive_questions_${code}\`)` → `this.storage.getCachedQuestions(code)`.
- `saveQuestionsLocally`: `localStorage.setItem(\`askqlive_questions_${code}\`, JSON.stringify(questions))` → `this.storage.setCachedQuestions(code, JSON.stringify(questions))`.
- `reenterAsHost`: `localStorage.setItem('live_qa_auth_token', record.adminToken)` → `this.storage.setAuthToken(record.adminToken)`.
- `joinLiveRoomDirectly`: `localStorage.removeItem('live_qa_auth_token')` → `this.storage.clearAuthToken()`; the conditional `localStorage.setItem('live_qa_username', opts.name.trim())` → `this.storage.setUsername(opts.name.trim())`.
- `joinSession`: the upvoted-ids read (`localStorage.getItem(\`askqlive_upvoted_${code}\`)`) → `this.storage.getUpvotedIds(code)`; `localStorage.setItem('live_qa_username', name)` → `this.storage.setUsername(name)`.
- `createSession`: `localStorage.setItem('live_qa_auth_token', session.adminToken)` → `this.storage.setAuthToken(session.adminToken)`.
- `createSeries`: `localStorage.setItem('live_qa_auth_token', series.organizerToken)` → `this.storage.setAuthToken(series.organizerToken)`.
- `joinAsInvitedSpeaker`: `localStorage.setItem('live_qa_auth_token', invite.adminToken)` → `this.storage.setAuthToken(invite.adminToken)`.
- `toggleUpvote`: `localStorage.setItem(\`askqlive_upvoted_${code}\`, JSON.stringify(...))` → `this.storage.setUpvotedIds(code, JSON.stringify(...))`.

For every call site above that today is wrapped in its own `if (typeof window !== 'undefined' && window.localStorage) { ... }` block with no other logic inside, remove that wrapping `if` entirely — `ClientStorageService`'s methods already no-op safely when storage is unavailable. Where the `if` also wraps other non-storage logic, leave the `if` in place and just swap the inner call.

Confirm zero remaining matches: `grep -n "localStorage\." src/app/services/qa.service.ts` should return nothing.

- [ ] **Step 6: Run the full suite and a manual smoke check**

Run: `npm test` and `npx tsc -p tsconfig.app.json --noEmit`.

Then `npm run dev`: join a session as an attendee, refresh the page, and confirm your name/identity persisted. Log in as an organizer, refresh, confirm the organizer token persisted (you're still recognized as organizer). Check the "past hosted sessions" list still populates after creating a session and reloading.

- [ ] **Step 7: Commit**

```bash
git add src/app/services/client-storage.service.ts src/app/services/client-storage.service.spec.ts src/app/services/qa.service.ts
git commit -m "refactor: extract localStorage access from QaService into ClientStorageService"
```

---

### Task 3: `SessionApiClient` — identity, session, series & segment lifecycle

**Files:**
- Create: `src/app/services/session-api.client.ts`
- Create: `src/app/services/session-api.client.spec.ts`
- Modify: `src/app/services/qa.service.ts`

**Context:** This task covers the first half of `qa.service.ts`'s 33 `fetch` call sites — everything through segment lifecycle actions. Task 4 covers the rest (questions/analytics). Split this way because each is independently substantial and independently testable; migrating one half doesn't block or interfere with the other.

**Interfaces:**
- Produces (methods needed by this task; Task 4 adds more to the same class):
  ```ts
  @Injectable({ providedIn: 'root' })
  class SessionApiClient {
    authenticateRole(code: string, token: string): Promise<UserAccessInfo>;
    joinSession(code: string, body: { fingerprint: string; name: string; adminToken?: string; title?: string; description?: string; type?: 'single' | 'series' }): Promise<{ session: Session; series?: SessionSeries }>;
    getSeries(code: string): Promise<{ series?: SessionSeries } | null>;
    getSession(code: string): Promise<{ session: Session } | null>;
    createSession(payload: { title: string; customJoinCode?: string; contextData?: string; settings?: SessionSettings }): Promise<Session>;
    createSeries(payload: object): Promise<SessionSeries>;
    checkCodeAvailability(code: string): Promise<{ available: boolean; error?: string }>;
    generateSuggestedCode(prefix: string): Promise<{ code?: string }>;
    fetchActiveLiveRoom(): Promise<ActiveLiveRoomPreview | null>;
    fetchSpeakerInvites(email: string): Promise<{ invites: SpeakerInviteRecord[] }>;
    getPrivilegedSegments(code: string, token: string): Promise<{ segments: Segment[] } | null>;
    startSegment(code: string, segmentId: string, token: string | null): Promise<{ series?: SessionSeries }>;
    endSegment(code: string, segmentId: string, token: string | null): Promise<{ series?: SessionSeries }>;
    updateSeries(code: string, payload: object, token: string | null): Promise<{ series?: SessionSeries }>;
    updateSegment(code: string, segmentId: string, payload: object, token: string | null): Promise<void>;
    addSegment(code: string, payload: object, token: string | null): Promise<void>;
    reorderSegments(code: string, segmentIds: string[], token: string | null): Promise<void>;
  }
  ```
  Every method throws `new Error(message)` on a non-ok response, where `message` is `data.error` from the parsed JSON body when present, otherwise a method-specific fallback string matching what `qa.service.ts` throws today at that call site (check each one individually — the fallback strings differ per call site today; preserve them exactly). Methods that today just check `res.ok` and act on a boolean (rather than throwing) — like `checkCodeAvailability` and `generateSuggestedCode`, which have their own `try/catch` returning a fallback — keep that "return a value, don't throw" behavior; don't force every method into the same throw-on-failure shape if the current call site doesn't do that.

- [ ] **Step 1: Write the failing tests** (a representative subset — one per distinct response-handling shape used above; add more as you implement each method if you want extra confidence, but these four patterns cover every case in this task):

```ts
// src/app/services/session-api.client.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionApiClient } from './session-api.client';

describe('SessionApiClient', () => {
  let client: SessionApiClient;

  beforeEach(() => {
    client = new SessionApiClient();
  });

  it('authenticateRole posts the token and returns the parsed UserAccessInfo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: 'organizer', scope: ['*'] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.authenticateRole('ABC123', 'org_secret');

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/ABC123/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'org_secret' }),
    });
    expect(result).toEqual({ role: 'organizer', scope: ['*'] });
  });

  it('joinSession throws the server-provided error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Session not found or invalid room code' }),
    }));

    await expect(client.joinSession('ABC123', { fingerprint: 'fp1', name: 'Ada' }))
      .rejects.toThrow('Session not found or invalid room code');
  });

  it('checkCodeAvailability returns { available: true } on a network error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await client.checkCodeAvailability('ABC');
    expect(result).toEqual({ available: true });
  });

  it('getPrivilegedSegments sends the Bearer token and returns null on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.getPrivilegedSegments('ABC123', 'org_secret');

    expect(fetchMock).toHaveBeenCalledWith('/api/series/ABC123/segments', {
      headers: { Authorization: 'Bearer org_secret' },
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/services/session-api.client.spec.ts`

- [ ] **Step 3: Implement each method**, copying the exact `fetch` call, headers, body, and error-handling from `qa.service.ts`'s current source (re-locate each with `grep -n "fetch(" src/app/services/qa.service.ts` — line numbers will have shifted from the ones in the original audit after Tasks 1–2's edits). Two fully worked examples to set the pattern — implement the rest the same way, method by method, checking the corresponding current call site each time rather than guessing:

```ts
// src/app/services/session-api.client.ts
import { Injectable } from '@angular/core';
import {
  ActiveLiveRoomPreview, Segment, Session, SessionSeries, SessionSettings, SpeakerInviteRecord, UserAccessInfo,
} from '../models/qa.models';

@Injectable({ providedIn: 'root' })
export class SessionApiClient {
  async authenticateRole(code: string, token: string): Promise<UserAccessInfo> {
    const res = await fetch(`/api/sessions/${code}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return res.json();
  }

  async checkCodeAvailability(code: string): Promise<{ available: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/check-code/${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json();
        return { available: !!data.available, error: data.error };
      }
      return { available: true };
    } catch {
      return { available: true };
    }
  }

  async getPrivilegedSegments(code: string, token: string): Promise<{ segments: Segment[] } | null> {
    try {
      const res = await fetch(`/api/series/${code}/segments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  async joinSession(code: string, body: {
    fingerprint: string; name: string; adminToken?: string; title?: string; description?: string; type?: 'single' | 'series';
  }): Promise<{ session: Session; series?: SessionSeries }> {
    const res = await fetch(`/api/sessions/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Session not found or invalid room code');
    }
    return res.json();
  }

  // ...continue for getSeries, getSession, createSession, createSeries,
  // generateSuggestedCode, fetchActiveLiveRoom, fetchSpeakerInvites,
  // startSegment, endSegment, updateSeries, updateSegment, addSegment,
  // reorderSegments — each copied from its current qa.service.ts call site,
  // preserving that call site's exact URL, method, headers, body, and
  // success/failure handling.
}
```

For `startSegment`/`endSegment`/`updateSeries`/`updateSegment`/`addSegment`/`reorderSegments`, the current call sites all send `Authorization: Bearer ${token}` plus the token duplicated inside the JSON body (e.g. `body: JSON.stringify({ ...payload, token })`) — copy that duplication exactly as-is even though it looks redundant; that's existing server-side behavior (`extractBearerToken` falls back to a body/query token) and changing it is out of scope for this refactor.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/services/session-api.client.spec.ts`

- [ ] **Step 5: Rewire the corresponding `qa.service.ts` methods**

Add `private api = inject(SessionApiClient);` and the import. For each method below, replace the inline `fetch(...)` + response handling with a call to `this.api.*`, keeping every surrounding line (signal writes, toasts, Firestore sync, localStorage via `this.storage`) exactly where it is — only the network call itself moves:

- `authenticateRole` → `const authInfo = await this.api.authenticateRole(code, token.trim());`
- `joinSession` → `const data = await this.api.joinSession(code, { fingerprint: ..., name: ..., adminToken: ..., title: ..., description: ..., type: ... });` (wrap in the existing try/catch; the client now throws on failure instead of the method checking `res.ok` itself — the existing `catch (err: unknown)` block already handles that identically to today).
- `joinSession`'s inner series fetch → `const sData = await this.api.getSeries(code);`
- `createSession` → `const session = await this.api.createSession(payload);`
- `createSeries` → `const series = await this.api.createSeries(payload);` and its second fetch → `const sessData = await this.api.getSession(series.joinCode);`
- `checkCodeAvailability` → `return this.api.checkCodeAvailability(clean);`
- `generateSuggestedCode` → `const data = await this.api.generateSuggestedCode(prefix);`
- `fetchActiveLiveRoom` → `const data = await this.api.fetchActiveLiveRoom();`
- `fetchSpeakerInvites` → `const data = await this.api.fetchSpeakerInvites(resolved);`
- `mergePrivilegedSegmentTokens` and `resolveSpeakerAdminToken` (both call the same endpoint) → both become `const data = await this.api.getPrivilegedSegments(code, token);`
- `startSegment` → `const data = await this.api.startSegment(code, segmentId, token);`
- `endSegment` → `const data = await this.api.endSegment(code, segmentId, token);`
- `updateSeries` → `const data = await this.api.updateSeries(code, payload, token);`
- `updateSegment` → `await this.api.updateSegment(code, segmentId, payload, token);`
- `addSegment` → `await this.api.addSegment(code, payload, token);`
- `reorderSegments` → `await this.api.reorderSegments(code, segmentIds, token);`

- [ ] **Step 6: Run the full suite and a manual smoke check**

Run: `npm test` and `npx tsc -p tsconfig.app.json --noEmit`.

Then `npm run dev`: create a series, add a segment, start it, end it, edit the series title, reorder segments. Confirm each action still works and the UI updates as before.

- [ ] **Step 7: Commit**

```bash
git add src/app/services/session-api.client.ts src/app/services/session-api.client.spec.ts src/app/services/qa.service.ts
git commit -m "refactor: extract session/series/segment API calls from QaService into SessionApiClient"
```

---

### Task 4: `SessionApiClient` — questions & analytics

**Files:**
- Modify: `src/app/services/session-api.client.ts`
- Modify: `src/app/services/session-api.client.spec.ts`
- Modify: `src/app/services/qa.service.ts`

**Interfaces:**
- Produces (added to the same `SessionApiClient` class from Task 3):
  ```ts
  refreshSessionData(code: string, fingerprint: string, segmentQuery: string): Promise<{
    questions?: Response; telemetry?: Response; teleprompter?: Response; wordcloud?: Response; series?: Response;
  }>;
  // ^ see Step 3 note below on why this one stays a thin Promise.all wrapper
  // returning raw Responses rather than parsed bodies.
  moveQuestionToSegment(code: string, questionId: string, targetSegmentId: string, token: string | null): Promise<void>;
  requestRagAnswer(code: string, questionId: string): Promise<{ question?: Question } | null>;
  submitQuestion(code: string, payload: object): Promise<{ deduplicated: boolean; message?: string; question?: Question }>;
  toggleUpvote(code: string, questionId: string, fingerprint: string): Promise<{ upvotes?: number } | null>;
  updateQuestionStatus(code: string, questionId: string, payload: object): Promise<void>;
  editQuestionContent(code: string, questionId: string, payload: object): Promise<boolean>;
  deleteQuestion(code: string, questionId: string, payload: object): Promise<boolean>;
  submitHumanAnswer(code: string, questionId: string, payload: object): Promise<{ question?: Question } | null>;
  deleteHumanAnswer(code: string, questionId: string, answerId: string, payload: object): Promise<{ question?: Question } | null>;
  updateGroundingContext(code: string, contextData: string): Promise<boolean>;
  updateSettings(code: string, settings: object): Promise<boolean>;
  translateText(code: string, text: string, targetLanguage: string): Promise<string>;
  generatePostSessionReport(code: string): Promise<PostSessionReport>;
  fetchSeriesReport(code: string): Promise<SeriesReport>;
  banParticipant(code: string, fingerprint: string, banned: boolean): Promise<boolean>;
  ```

- [ ] **Step 1: Write the failing tests** — append to `session-api.client.spec.ts`:

```ts
describe('SessionApiClient: questions & analytics', () => {
  let client: SessionApiClient;

  beforeEach(() => {
    client = new SessionApiClient();
  });

  it('submitQuestion posts to /questions and returns the parsed body on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deduplicated: false, question: { id: 'q1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client.submitQuestion('ABC123', { content: 'Why?' });

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/ABC123/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Why?' }),
    });
    expect(result.question?.id).toBe('q1');
  });

  it('toggleUpvote returns null (not a throw) when the server responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await client.toggleUpvote('ABC123', 'q1', 'fp1');
    expect(result).toBeNull();
  });

  it('deleteQuestion returns true only when the response is ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    expect(await client.deleteQuestion('ABC123', 'q1', { clientFingerprint: 'fp1', isAdmin: false })).toBe(true);
  });

  it('translateText returns the original text on a network error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await client.translateText('ABC123', 'hello', 'fr')).toBe('hello');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/services/session-api.client.spec.ts`

- [ ] **Step 3: Implement each method**, again copying each current call site exactly. Two representative examples:

```ts
async submitQuestion(code: string, payload: object): Promise<{ deduplicated: boolean; message?: string; question?: Question }> {
  const res = await fetch(`/api/sessions/${code}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit question');
  }
  return data;
}

async translateText(code: string, text: string, targetLanguage: string): Promise<string> {
  try {
    const res = await fetch(`/api/sessions/${code}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLanguage }),
    });
    const data = await res.json();
    return data.translatedText || text;
  } catch {
    return text;
  }
}

// ...continue for moveQuestionToSegment, requestRagAnswer, toggleUpvote,
// updateQuestionStatus, editQuestionContent, deleteQuestion,
// submitHumanAnswer, deleteHumanAnswer, updateGroundingContext,
// updateSettings, generatePostSessionReport, fetchSeriesReport,
// banParticipant — each copied from its current qa.service.ts call site.
```

For `refreshSessionData`'s five-way `Promise.all`: **do not** collapse this into a single gateway method that parses all five bodies, because `qa.service.ts`'s current logic makes different decisions per response (e.g. falling back to the local question cache when the server returns zero questions) that belong in `QaService`, not in the gateway. Instead, add five small single-purpose methods to `SessionApiClient` — `getQuestions(code, fingerprint, segmentQuery)`, `getTelemetry(code, fingerprint, segmentQuery)`, `getTeleprompterQueue(code, segmentQuery)`, `getWordCloud(code, segmentQuery)`, `getSeries(code)` (already exists from Task 3) — each just doing `const res = await fetch(url); return res.ok ? res.json() : null;`, and have `refreshSessionData` in `qa.service.ts` call `Promise.all([this.api.getQuestions(...), this.api.getTelemetry(...), ...])` and keep its existing per-response decision logic operating on the parsed results instead of raw `Response` objects.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/services/session-api.client.spec.ts`

- [ ] **Step 5: Rewire the remaining `qa.service.ts` methods**

- `refreshSessionData` → replace the `Promise.all([fetch(...), ...])` block with `Promise.all([this.api.getQuestions(code, fp, segQuery), this.api.getTelemetry(code, fp, segQuery), this.api.getTeleprompterQueue(code, segQuery), this.api.getWordCloud(code, segQuery), this.api.getSeries(code)])`, then adjust the destructuring below it to work with already-parsed objects (`null` on failure) instead of `Response` objects with `.ok`/`.json()`.
- `moveQuestionToSegment` → `await this.api.moveQuestionToSegment(code, questionId, targetSegmentId, token);`
- `requestRagAnswer` → `const data = await this.api.requestRagAnswer(code, questionId);`
- `submitQuestion` → `const data = await this.api.submitQuestion(code, { clientFingerprint: ..., authorName: ..., isAnonymous, content, category, segmentId });`
- `toggleUpvote` → `const data = await this.api.toggleUpvote(code, questionId, this.userFingerprint());`
- `updateQuestionStatus` → `await this.api.updateQuestionStatus(code, questionId, { status, isAdmin: ..., clientFingerprint: ... });`
- `editQuestionContent` → `const ok = await this.api.editQuestionContent(code, questionId, { content: newContent, clientFingerprint: ..., isAdmin: ... });`
- `deleteQuestion` → `const ok = await this.api.deleteQuestion(code, questionId, { clientFingerprint: ..., isAdmin: ... });`
- `submitHumanAnswer` → `const data = await this.api.submitHumanAnswer(code, questionId, { authorName, authorRole: role, authorEmail: ..., content: content.trim(), clientFingerprint: ... });`
- `deleteHumanAnswer` → `const data = await this.api.deleteHumanAnswer(code, questionId, answerId, { clientFingerprint: ..., isAdmin: ... });`
- `updateGroundingContext` → `const ok = await this.api.updateGroundingContext(code, contextData);`
- `updateSettings` → `const ok = await this.api.updateSettings(code, settings);`
- `translateText` → `return this.api.translateText(code, text, targetLanguage);`
- `generatePostSessionReport` → `const report = await this.api.generatePostSessionReport(code);`
- `fetchSeriesReport` → `const report = await this.api.fetchSeriesReport(code);`
- `banParticipant` → `return this.api.banParticipant(code, fingerprint, banned);`

Confirm zero remaining matches: `grep -n "fetch(" src/app/services/qa.service.ts` should return nothing.

- [ ] **Step 6: Run the full suite and a manual smoke check**

Run: `npm test` and `npx tsc -p tsconfig.app.json --noEmit`.

Then `npm run dev` and walk through the full attendee + organizer flow: submit a question, upvote it, moderate it (approve/reject), answer it as organizer, translate it, ban a participant, generate a post-session report. Confirm every action still works.

- [ ] **Step 7: Commit**

```bash
git add src/app/services/session-api.client.ts src/app/services/session-api.client.spec.ts src/app/services/qa.service.ts
git commit -m "refactor: extract question/analytics API calls from QaService into SessionApiClient"
```

---

### Task 5: Final full regression pass

**Files:** none (verification only)

- [ ] **Step 1:** Run `npm test` — expect all tests green (server tests + `question-filters.spec.ts` (12) + `client-storage.service.spec.ts` (4) + `session-api.client.spec.ts` (8+)).
- [ ] **Step 2:** Run `npx tsc -p tsconfig.app.json --noEmit` — zero errors.
- [ ] **Step 3:** Run `npm run build` — clean production build.
- [ ] **Step 4:** Confirm `qa.service.ts` no longer contains any raw `fetch(` or `localStorage.` — `grep -n "fetch(\\|localStorage\\." src/app/services/qa.service.ts` should return nothing.
- [ ] **Step 5:** `npm run dev` and run through the complete flow once more end-to-end: create series → invite speaker → speaker joins and starts their segment → attendees join, ask, upvote, get AI/RAG answers → organizer moderates → organizer ends series → generate executive report. If a Playwright/Chrome session is available, also run `npm run test:e2e`; otherwise note in the final report that e2e was not run and why.
