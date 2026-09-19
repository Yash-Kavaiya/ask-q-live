# Server Clean Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Dependency Rule violations in the Express/QaStore server layer so persistence lives behind a repository interface, route handlers stop mutating domain entities directly, the store is constructed at a composition root instead of as a module-level side effect, and entity sanitization is one named, tested function instead of ad-hoc inline destructuring.

**Architecture:** Extract a `QaRepository` class (`src/server/qa-repository.ts`) that owns all ten in-memory `Map`/`Set` fields currently on `QaStore` and exposes named CRUD methods. `QaStore` keeps every business rule it has today (dedup, moderation, rate limiting, segment state machine, telemetry, reports) but calls `this.repo.*` instead of touching a `Map` directly — this centralizes all storage access in one file behind named methods, a prerequisite for a later backend swap (Firestore, Postgres), which would additionally require making the repository asynchronous. Five new `QaStore` methods absorb the entity-mutation logic that currently lives inline in `server.ts` route handlers, so every route becomes a thin translate-and-delegate call. The `qaStore` singleton moves from a module-level `export const` in `qa-store.ts` to an explicit construction in `server.ts` (the composition root).

**Tech Stack:** TypeScript, Express 5, Vitest. Regression net: `src/server/series-store.spec.ts` (37 existing tests) plus new tests added per task.

**Spec:** No separate spec doc — this plan argues from the clean-architecture audit performed earlier in this session (chat transcript), which cites exact file:line locations for each violation. Those citations are repeated in each task below.

## Global Constraints

- Every task ends with `npm test` (currently 37 passing tests) staying green and `npx tsc -p tsconfig.app.json --noEmit` staying clean.
- No HTTP response shape, status code, or error message text changes — this is a structural refactor, not a behavior change. If a task's steps ever produce a different JSON shape than today, that's a bug in the task, not an intentional improvement.
- Preserve the exact existing audit-log behavior: PATCH `/api/series/:code` logs `'SERIES_UPDATED'`, POST `/api/series/:code/grounding` logs `'SERIES_GROUNDING_UPDATED'`, POST `/api/series/:code/end` logs `'SERIES_ENDED'`. PATCH `/api/series/:code/segments/:id` and POST `/api/series/:code/segments/:id/grounding` currently log **nothing** — do not add new audit entries as a side effect of this refactor.
- Do not change any existing public `QaStore` method's signature (`addSegment`, `startSegment`, `endSegment`, `pauseSegment`, `skipSegment`, `extendSegment`, `reorderSegments`, `deleteSegment`, `submitQuestion`, `toggleUpvote`, etc.) — `series-store.spec.ts` and `server.ts` both depend on the current signatures.
- `QaStore`'s constructor signature (`constructor(seed = false)`) stays the same; `new QaStore(true)` in tests and `new QaStore(false)` at the composition root keep working unchanged.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/qa-repository.ts` (new) | Owns all ten `Map`/`Set` fields. Pure CRUD — no business rules, no auth checks, no audit logging. |
| `src/server/qa-repository.spec.ts` (new) | Unit tests for the repository in isolation. |
| `src/server/qa-store.ts` (modified) | Loses its `Map`/`Set` fields and the module-level `export const qaStore`. Gains `private repo = new QaRepository()` and five new use-case methods (`updateSeriesMetadata`, `updateSeriesGrounding`, `endSeries`, `updateSegmentProfile`, `updateSegmentGrounding`). Every existing method's business logic is unchanged; only its storage access is rewritten to go through `this.repo`. |
| `src/server/auth.ts` (modified) | Gains `sanitizeSegmentForRole`, extracted from the inline destructure in `server.ts`'s segments-list route. |
| `src/server/auth.spec.ts` (new) | Unit test for `sanitizeSegmentForRole`. |
| `src/server.ts` (modified) | Constructs `const qaStore = new QaStore(false)` itself (composition root). Five route handlers (1c, 1f, 1g, 2c, 2k) delegate to the new `QaStore` methods instead of mutating `series`/`seg` fields inline. The segments-list route (2a) calls `sanitizeSegmentForRole` instead of an inline destructure. |

---

### Task 1: `QaRepository` — sessions & participants

**Files:**
- Create: `src/server/qa-repository.ts`
- Create: `src/server/qa-repository.spec.ts`
- Modify: `src/server/qa-store.ts`

**Interfaces:**
- Produces (used by every later task in this plan and by `QaStore`):
  ```ts
  class QaRepository {
    getSession(joinCode: string): Session | undefined;
    setSession(joinCode: string, session: Session): void;
    hasSession(joinCode: string): boolean;
    listSessions(): Session[];

    getParticipant(joinCode: string, fingerprint: string): Participant | undefined;
    setParticipant(joinCode: string, fingerprint: string, participant: Participant): void;
    listParticipants(joinCode: string): Participant[];
    countParticipants(joinCode: string): number;
  }
  ```
  `setParticipant` lazily creates the per-session inner `Map` if it doesn't exist yet — callers never need to pre-initialize it. This removes the current `this.participants.set(code, new Map())` calls entirely (they become unnecessary, not relocated).

- [ ] **Step 1: Write the failing repository test**

```ts
// src/server/qa-repository.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { QaRepository } from './qa-repository.js';
import type { Session, Participant } from '../app/models/qa.models.js';

describe('QaRepository: sessions & participants', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores and retrieves a session by join code', () => {
    const session = { joinCode: 'ABC123' } as Session;
    repo.setSession('ABC123', session);
    expect(repo.getSession('ABC123')).toBe(session);
    expect(repo.hasSession('ABC123')).toBe(true);
    expect(repo.getSession('NOPE')).toBeUndefined();
  });

  it('lists all sessions', () => {
    repo.setSession('A', { joinCode: 'A' } as Session);
    repo.setSession('B', { joinCode: 'B' } as Session);
    expect(repo.listSessions().map(s => s.joinCode).sort()).toEqual(['A', 'B']);
  });

  it('lazily creates the participant map on first write and lists participants', () => {
    const p: Participant = { fingerprint: 'fp1', name: 'Ada', joinedAt: '2026-01-01', isBanned: false };
    repo.setParticipant('ABC123', 'fp1', p);
    expect(repo.getParticipant('ABC123', 'fp1')).toEqual(p);
    expect(repo.listParticipants('ABC123')).toEqual([p]);
    expect(repo.countParticipants('ABC123')).toBe(1);
  });

  it('returns empty list/zero count for a session with no participants yet', () => {
    expect(repo.listParticipants('NEVER-SEEN')).toEqual([]);
    expect(repo.countParticipants('NEVER-SEEN')).toBe(0);
  });
});
```

Check the exact shape of `Participant` in `src/app/models/qa.models.ts` before writing this test — adjust the literal's fields to match, since the test must compile.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/qa-repository.spec.ts`
Expected: FAIL — `Cannot find module './qa-repository.js'`

- [ ] **Step 3: Implement `QaRepository` with just these two families**

```ts
// src/server/qa-repository.ts
import { Session, Participant } from '../app/models/qa.models.js';

export class QaRepository {
  private sessions = new Map<string, Session>();
  private participants = new Map<string, Map<string, Participant>>();

  getSession(joinCode: string): Session | undefined {
    return this.sessions.get(joinCode);
  }

  setSession(joinCode: string, session: Session): void {
    this.sessions.set(joinCode, session);
  }

  hasSession(joinCode: string): boolean {
    return this.sessions.has(joinCode);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getParticipant(joinCode: string, fingerprint: string): Participant | undefined {
    return this.participants.get(joinCode)?.get(fingerprint);
  }

  setParticipant(joinCode: string, fingerprint: string, participant: Participant): void {
    let map = this.participants.get(joinCode);
    if (!map) {
      map = new Map();
      this.participants.set(joinCode, map);
    }
    map.set(fingerprint, participant);
  }

  listParticipants(joinCode: string): Participant[] {
    const map = this.participants.get(joinCode);
    return map ? Array.from(map.values()) : [];
  }

  countParticipants(joinCode: string): number {
    return this.participants.get(joinCode)?.size || 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/qa-repository.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire `QaStore` to the repository and migrate every `this.sessions.*` / `this.participants.*` call site**

In `qa-store.ts`:
1. Add the import: `import { QaRepository } from './qa-repository.js';`
2. Remove the field declarations `private sessions = new Map<string, Session>();` and `private participants = new Map<string, Map<string, Participant>>();` (lines 108, 113 today).
3. Add `private repo = new QaRepository();` alongside the remaining fields.
4. Replace every call site below (found via `grep -noE "this\.(sessions|participants)\.[a-zA-Z]+\(" src/server/qa-store.ts`) with the equivalent repository call. The mapping is mechanical:
   - `this.sessions.get(x)` → `this.repo.getSession(x)`
   - `this.sessions.set(x, y)` → `this.repo.setSession(x, y)`
   - `this.sessions.has(x)` → `this.repo.hasSession(x)`
   - `this.sessions.values()` (inside `getActiveLiveRoom`) → `this.repo.listSessions()`
   - `this.participants.set(x, new Map())` → **delete the line** (no longer needed — `setParticipant` lazily creates it). This applies to every seed-data occurrence (`seedDefaultSessions`, around what are today lines 427, 2216, 2483, 2824, 3122) and to `registerParticipant` (today around line 2253-2256).
   - `this.participants.has(code)` (in `registerParticipant`, today line 2253) → delete along with its guarded `.set(code, new Map())` — no longer needed.
   - `this.participants.get(code)!.get(fingerprint)` / `partMap.get(fingerprint)` (in `registerParticipant` today ~1466-1468, and `getParticipants` today ~2273-2276) → `this.repo.getParticipant(code, fingerprint)`
   - The write half of `registerParticipant` (`sessionPartMap.set(fingerprint, participant)` or equivalent) → `this.repo.setParticipant(code, fingerprint, participant)`
   - `this.participants.get(code)?.get(fingerprint)` (in `isParticipantBanned` today ~1479, `banParticipant` today ~1503) → `this.repo.getParticipant(code, fingerprint)`. Note `banParticipant` currently does `sessPart.isBanned = banned` by reference on the object pulled from the map — keep this pattern: `const p = this.repo.getParticipant(code, fingerprint); if (p) { p.isBanned = banned; this.repo.setParticipant(code, fingerprint, p); }` (the explicit `setParticipant` re-write is a no-op today since it's the same object reference, but makes the write explicit through the repository rather than relying on mutating a reference the repository handed out — keep the behavior identical either way).
   - `this.participants.get(joinCode.toUpperCase())?.size` (in `getSeriesTelemetry` today ~1834) → `this.repo.countParticipants(joinCode.toUpperCase())`
   - `Array.from(map.values())` in `getParticipants` (today ~2273-2276) → `this.repo.listParticipants(code)`
5. Confirm there are zero remaining matches: `grep -n "this\.(sessions|participants)\." src/server/qa-store.ts` (excluding the two lines inside `qa-repository.ts` itself, which is a different file) should return nothing.

- [ ] **Step 6: Run the full suite to verify no regressions**

Run: `npm test`
Expected: All 37 existing tests still PASS, plus the 4 new repository tests (41 total).

Also run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/qa-repository.ts src/server/qa-repository.spec.ts src/server/qa-store.ts
git commit -m "refactor: extract session/participant storage into QaRepository"
```

---

### Task 2: `QaRepository` — series & seriesParticipants

**Files:**
- Modify: `src/server/qa-repository.ts`
- Modify: `src/server/qa-repository.spec.ts`
- Modify: `src/server/qa-store.ts`

**Interfaces:**
- Consumes: the `QaRepository` class from Task 1 (extend it in place).
- Produces:
  ```ts
  class QaRepository {
    // ...existing methods from Task 1...
    getSeries(code: string): Series | undefined;
    setSeries(code: string, series: Series): void;
    hasSeries(code: string): boolean;
    listSeries(): Series[];

    getSeriesParticipant(seriesCode: string, fingerprint: string): SeriesParticipant | undefined;
    setSeriesParticipant(seriesCode: string, fingerprint: string, participant: SeriesParticipant): void;
    listSeriesParticipants(seriesCode: string): SeriesParticipant[];
  }
  ```
  Same lazy-init rule as `setParticipant`: `setSeriesParticipant` creates the inner map itself.

- [ ] **Step 1: Write the failing test** — append to `qa-repository.spec.ts`:

```ts
describe('QaRepository: series & seriesParticipants', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores and retrieves series by code', () => {
    const series = { joinCode: 'NEXT26' } as Series;
    repo.setSeries('NEXT26', series);
    expect(repo.getSeries('NEXT26')).toBe(series);
    expect(repo.hasSeries('NEXT26')).toBe(true);
    expect(repo.listSeries().map(s => s.joinCode)).toEqual(['NEXT26']);
  });

  it('lazily creates the series-participant map on first write', () => {
    const p = { fingerprint: 'fp1', name: 'Ada' } as SeriesParticipant;
    repo.setSeriesParticipant('NEXT26', 'fp1', p);
    expect(repo.getSeriesParticipant('NEXT26', 'fp1')).toEqual(p);
    expect(repo.listSeriesParticipants('NEXT26')).toEqual([p]);
  });
});
```

Add `Series, SeriesParticipant` to the existing `qa.models.js` type import at the top of the spec file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/qa-repository.spec.ts`
Expected: FAIL — `getSeries`/`setSeries`/etc. don't exist on `QaRepository` yet (TypeScript compile error surfaced by vitest/esbuild, or `is not a function` at runtime).

- [ ] **Step 3: Implement the new methods** — add to `QaRepository`:

```ts
private series = new Map<string, Series>();
private seriesParticipants = new Map<string, Map<string, SeriesParticipant>>();

getSeries(code: string): Series | undefined {
  return this.series.get(code);
}

setSeries(code: string, series: Series): void {
  this.series.set(code, series);
}

hasSeries(code: string): boolean {
  return this.series.has(code);
}

listSeries(): Series[] {
  return Array.from(this.series.values());
}

getSeriesParticipant(seriesCode: string, fingerprint: string): SeriesParticipant | undefined {
  return this.seriesParticipants.get(seriesCode)?.get(fingerprint);
}

setSeriesParticipant(seriesCode: string, fingerprint: string, participant: SeriesParticipant): void {
  let map = this.seriesParticipants.get(seriesCode);
  if (!map) {
    map = new Map();
    this.seriesParticipants.set(seriesCode, map);
  }
  map.set(fingerprint, participant);
}

listSeriesParticipants(seriesCode: string): SeriesParticipant[] {
  const map = this.seriesParticipants.get(seriesCode);
  return map ? Array.from(map.values()) : [];
}
```

Add `Series, SeriesParticipant` to the repository file's import from `qa.models.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/qa-repository.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Migrate every `this.series.*` / `this.seriesParticipants.*` call site in `qa-store.ts`**

Enumerate with `grep -noE "this\.(series|seriesParticipants)\.[a-zA-Z]+\(" src/server/qa-store.ts`. Apply the same mechanical mapping as Task 1:
- `this.series.get(code.toUpperCase())` inside `getSeries()` itself → becomes `this.repo.getSeries(code.toUpperCase())`. **Important:** `QaStore.getSeries()` stays a public method with the exact same signature — it now just delegates to the repository instead of touching a local `Map`. Every other method in `QaStore` that already calls `this.getSeries(code)` needs **no changes** — this is the payoff of the existing accessor-method convention already used throughout the file.
- Same for `QaStore.getSession()`, which becomes `return this.repo.getSession(code.toUpperCase());` — again, no ripple to callers.
- `this.series.set(code, series)` (in `createSeries`, seed data) → `this.repo.setSeries(code, series)`
- `this.series.has(code)` (in `isCodeAvailable`, `generateUniqueCode`) → `this.repo.hasSeries(code)`
- `Array.from(this.series.values())` (in `getAllSeries`, `getActiveLiveRoom`) → `this.repo.listSeries()`
- `this.seriesParticipants.set(code, new Map())` (seed data, `createSeries`) → delete the line, same as Task 1's participant lazy-init removal.
- `this.seriesParticipants.get(code)?.get(fingerprint)` (in `isParticipantBanned`, `registerSeriesParticipant`) → `this.repo.getSeriesParticipant(code, fingerprint)`
- The write half of `registerSeriesParticipant` → `this.repo.setSeriesParticipant(code, fingerprint, participant)`
- `getSeriesParticipants(seriesCode)` public method body → `return this.repo.listSeriesParticipants(seriesCode);`

Confirm zero remaining matches afterward with the same grep (excluding `qa-repository.ts`).

- [ ] **Step 6: Run the full suite**

Run: `npm test` — expect all previous tests plus the 2 new ones to PASS.
Run: `npx tsc -p tsconfig.app.json --noEmit` — expect no errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/qa-repository.ts src/server/qa-repository.spec.ts src/server/qa-store.ts
git commit -m "refactor: extract series/seriesParticipant storage into QaRepository"
```

---

### Task 3: `QaRepository` — questions, sessionQuestions & upvoteLedger

**Files:**
- Modify: `src/server/qa-repository.ts`
- Modify: `src/server/qa-repository.spec.ts`
- Modify: `src/server/qa-store.ts`

This is the largest and most business-logic-adjacent cluster (`submitQuestion`, `toggleUpvote`, `updateQuestionStatus`, `deleteQuestion`, `addHumanAnswer`, `deleteHumanAnswer`, `getQuestions`, `getTeleprompterQuestions`, `getWordFrequencies`, `generateQuestionRagAnswer`, plus seed data). Take extra care here — read each call site's surrounding business logic before replacing it, don't just pattern-match the map call in isolation.

**Interfaces:**
- Produces:
  ```ts
  class QaRepository {
    // ...existing methods...
    getQuestion(id: string): Question | undefined;
    setQuestion(id: string, question: Question): void;
    deleteQuestion(id: string): void;

    getQuestionIds(joinCode: string): string[];
    addQuestionId(joinCode: string, questionId: string): void;
    setQuestionIds(joinCode: string, ids: string[]): void;

    hasUpvote(questionId: string, fingerprint: string): boolean;
    addUpvote(questionId: string, fingerprint: string): void;
    removeUpvote(questionId: string, fingerprint: string): void;
  }
  ```
  `addQuestionId` lazily creates the per-session id array (mirrors the lazy-init pattern from Tasks 1–2), removing the need for the current `if (!this.sessionQuestions.has(code)) { this.sessionQuestions.set(code, []); }` guards.

- [ ] **Step 1: Write the failing test** — append to `qa-repository.spec.ts`:

```ts
describe('QaRepository: questions, sessionQuestions & upvoteLedger', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores, retrieves, and deletes a question by id', () => {
    const q = { id: 'q1', content: 'Why?' } as Question;
    repo.setQuestion('q1', q);
    expect(repo.getQuestion('q1')).toBe(q);
    repo.deleteQuestion('q1');
    expect(repo.getQuestion('q1')).toBeUndefined();
  });

  it('lazily creates the question-id list on first add', () => {
    repo.addQuestionId('ABC', 'q1');
    repo.addQuestionId('ABC', 'q2');
    expect(repo.getQuestionIds('ABC')).toEqual(['q1', 'q2']);
  });

  it('overwrites the question-id list with setQuestionIds', () => {
    repo.addQuestionId('ABC', 'q1');
    repo.setQuestionIds('ABC', ['q2', 'q3']);
    expect(repo.getQuestionIds('ABC')).toEqual(['q2', 'q3']);
  });

  it('tracks upvotes per question+fingerprint pair', () => {
    expect(repo.hasUpvote('q1', 'fp1')).toBe(false);
    repo.addUpvote('q1', 'fp1');
    expect(repo.hasUpvote('q1', 'fp1')).toBe(true);
    repo.removeUpvote('q1', 'fp1');
    expect(repo.hasUpvote('q1', 'fp1')).toBe(false);
  });
});
```

Add `Question` to the spec file's type import if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/qa-repository.spec.ts`
Expected: FAIL — new methods don't exist yet.

- [ ] **Step 3: Implement**

```ts
private questions = new Map<string, Question>();
private sessionQuestions = new Map<string, string[]>();
private upvoteLedger = new Set<string>();

getQuestion(id: string): Question | undefined {
  return this.questions.get(id);
}

setQuestion(id: string, question: Question): void {
  this.questions.set(id, question);
}

deleteQuestion(id: string): void {
  this.questions.delete(id);
}

getQuestionIds(joinCode: string): string[] {
  return this.sessionQuestions.get(joinCode) || [];
}

addQuestionId(joinCode: string, questionId: string): void {
  const list = this.sessionQuestions.get(joinCode);
  if (list) {
    list.push(questionId);
  } else {
    this.sessionQuestions.set(joinCode, [questionId]);
  }
}

setQuestionIds(joinCode: string, ids: string[]): void {
  this.sessionQuestions.set(joinCode, ids);
}

private upvoteKey(questionId: string, fingerprint: string): string {
  return `${questionId}:${fingerprint}`;
}

hasUpvote(questionId: string, fingerprint: string): boolean {
  return this.upvoteLedger.has(this.upvoteKey(questionId, fingerprint));
}

addUpvote(questionId: string, fingerprint: string): void {
  this.upvoteLedger.add(this.upvoteKey(questionId, fingerprint));
}

removeUpvote(questionId: string, fingerprint: string): void {
  this.upvoteLedger.delete(this.upvoteKey(questionId, fingerprint));
}
```

Add `Question` to the repository file's import from `qa.models.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/qa-repository.spec.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Migrate every call site in `qa-store.ts`**

Enumerate with `grep -noE "this\.(questions|sessionQuestions|upvoteLedger)\.[a-zA-Z]+\(" src/server/qa-store.ts`. Go method by method (don't batch-replace blindly — several of these sit inside multi-step business logic):

- `submitQuestion` (rate limiting + dedup + creation, today ~1170-1270): the rate-limit timestamp reads/writes belong to Task 4 (`submissionRateLimits`), leave those. For this task: `this.questions.get(dedupeResult.matchedQuestionId)` → `this.repo.getQuestion(dedupeResult.matchedQuestionId)`; `this.upvoteLedger.add(...)` on the dedupe path → `this.repo.addUpvote(parentQuestion.id, params.clientFingerprint)`; `this.questions.set(newQuestionId, newQuestion)` → `this.repo.setQuestion(newQuestionId, newQuestion)`; the `if (!this.sessionQuestions.has(code)) { this.sessionQuestions.set(code, []); } this.sessionQuestions.get(code)!.push(newQuestionId);` block → `this.repo.addQuestionId(code, newQuestionId);`; the final `this.upvoteLedger.add(...)` for the new question's own author → `this.repo.addUpvote(newQuestionId, params.clientFingerprint)`.
- `moveQuestion`, `bulkMoveQuestions`, `parkQuestion` (each does `this.questions.get(questionId)` around today's lines 1325, 1391): → `this.repo.getQuestion(questionId)`.
- `toggleUpvote` (today ~1556-1580): `this.questions.get(questionId)` → `this.repo.getQuestion(questionId)`; the ledger has/delete/add sequence → `this.repo.hasUpvote(...)`, `this.repo.removeUpvote(...)`, `this.repo.addUpvote(...)`.
- `hasUserUpvoted` (today ~1580): → `this.repo.hasUpvote(questionId, clientFingerprint)`.
- `getUserUpvotedIds` (today ~1584-1587): `this.sessionQuestions.get(joinCode.toUpperCase())` → `this.repo.getQuestionIds(joinCode.toUpperCase())`; the `.has()` filter → `this.repo.hasUpvote(qId, clientFingerprint)`.
- `updateQuestionStatus`, `editQuestionContent`, `addHumanAnswer`, `deleteHumanAnswer` (each starts with `this.questions.get(questionId)` around today's lines 1594, 1626, 1667, 1712): → `this.repo.getQuestion(questionId)`. Wherever the method mutates the returned object and relies on that mutation being visible (e.g. `question.status = status`), keep mutating the returned reference, then call `this.repo.setQuestion(questionId, question)` right after to make the write explicit through the repository (same pattern as `banParticipant` in Task 1) — check each method individually since some call `this.questions.set` afterward already and some just rely on reference mutation; end state should be that every question mutation is followed by an explicit `this.repo.setQuestion(...)` call.
- `deleteQuestion` (today ~1642-1651): `this.questions.get`/`.delete` → `this.repo.getQuestion`/`this.repo.deleteQuestion`; the `sessionQuestions.get(code)` + filter + `.set(code, filtered)` → `this.repo.setQuestionIds(code, this.repo.getQuestionIds(code).filter(id => id !== questionId))`.
- `getQuestions`, `getTeleprompterQuestions`, `getWordFrequencies` (each does `this.sessionQuestions.get(code) || []` then maps ids to `this.questions.get(id)`, today ~1744-1747): → `this.repo.getQuestionIds(code)` and `this.repo.getQuestion(id)`.
- `generateQuestionRagAnswer` (today ~3298): `this.questions.get(questionId)` → `this.repo.getQuestion(questionId)`. This method mutates the returned `q` object in place (`q.aiLine1 = ...` etc., via the module-level `newQuestionLine` helper) and returns it — after the mutation, add `this.repo.setQuestion(questionId, q);` before returning, so the write is explicit.
- Seed data (`seedDefaultSessions`, today scattered ~2482, 2541, 2669-2670, 2823, 2880, 2988-2989, 3121, 3184, 3292-3293): every `this.sessionQuestions.set(code, [])` → delete (no longer needed, `addQuestionId` lazy-inits); every `this.questions.set(question.id, question); this.sessionQuestions.get(code)!.push(question.id);` pair → `this.repo.setQuestion(question.id, question); this.repo.addQuestionId(code, question.id);`.

Confirm zero remaining matches with the same grep pattern afterward (excluding `qa-repository.ts`).

- [ ] **Step 6: Run the full suite**

Run: `npm test` — pay special attention to the dedup, upvote, and moderation-related tests in `series-store.spec.ts`, since this task touches the most business-logic-dense methods in the file.
Run: `npx tsc -p tsconfig.app.json --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/server/qa-repository.ts src/server/qa-repository.spec.ts src/server/qa-store.ts
git commit -m "refactor: extract question/upvote storage into QaRepository"
```

---

### Task 4: `QaRepository` — rate limits, audit logs & cached reports (QaStore now holds zero Maps)

**Files:**
- Modify: `src/server/qa-repository.ts`
- Modify: `src/server/qa-repository.spec.ts`
- Modify: `src/server/qa-store.ts`

**Interfaces:**
- Produces:
  ```ts
  class QaRepository {
    // ...existing methods...
    getRateLimitTimestamps(key: string): number[];
    setRateLimitTimestamps(key: string, timestamps: number[]): void;

    getAuditLog(seriesCode: string): AuditEntry[];
    appendAuditEntry(seriesCode: string, entry: AuditEntry): void;

    getCachedReport(segmentId: string): PostSessionReport | undefined;
    setCachedReport(segmentId: string, report: PostSessionReport): void;
  }
  ```

- [ ] **Step 1: Write the failing test** — append to `qa-repository.spec.ts`:

```ts
describe('QaRepository: rate limits, audit logs & cached reports', () => {
  let repo: QaRepository;

  beforeEach(() => {
    repo = new QaRepository();
  });

  it('stores and retrieves rate-limit timestamps by key', () => {
    expect(repo.getRateLimitTimestamps('seg:q1')).toEqual([]);
    repo.setRateLimitTimestamps('seg:q1', [1, 2, 3]);
    expect(repo.getRateLimitTimestamps('seg:q1')).toEqual([1, 2, 3]);
  });

  it('lazily creates the audit log on first append and lists entries in insertion order', () => {
    expect(repo.getAuditLog('NEXT26')).toEqual([]);
    const e1 = { id: '1', action: 'SEGMENT_ADDED' } as AuditEntry;
    const e2 = { id: '2', action: 'SEGMENT_STARTED' } as AuditEntry;
    repo.appendAuditEntry('NEXT26', e1);
    repo.appendAuditEntry('NEXT26', e2);
    expect(repo.getAuditLog('NEXT26')).toEqual([e1, e2]);
  });

  it('caches a post-session report per segment id', () => {
    expect(repo.getCachedReport('seg-1')).toBeUndefined();
    const report = { sessionTitle: 'Talk' } as PostSessionReport;
    repo.setCachedReport('seg-1', report);
    expect(repo.getCachedReport('seg-1')).toBe(report);
  });
});
```

Add `AuditEntry, PostSessionReport` to the spec file's type import.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/qa-repository.spec.ts`

- [ ] **Step 3: Implement**

```ts
private submissionRateLimits = new Map<string, number[]>();
private auditLogs = new Map<string, AuditEntry[]>();
private cachedSegmentReports = new Map<string, PostSessionReport>();

getRateLimitTimestamps(key: string): number[] {
  return this.submissionRateLimits.get(key) || [];
}

setRateLimitTimestamps(key: string, timestamps: number[]): void {
  this.submissionRateLimits.set(key, timestamps);
}

getAuditLog(seriesCode: string): AuditEntry[] {
  return this.auditLogs.get(seriesCode) || [];
}

appendAuditEntry(seriesCode: string, entry: AuditEntry): void {
  const log = this.auditLogs.get(seriesCode);
  if (log) {
    log.push(entry);
  } else {
    this.auditLogs.set(seriesCode, [entry]);
  }
}

getCachedReport(segmentId: string): PostSessionReport | undefined {
  return this.cachedSegmentReports.get(segmentId);
}

setCachedReport(segmentId: string, report: PostSessionReport): void {
  this.cachedSegmentReports.set(segmentId, report);
}
```

Add `AuditEntry, PostSessionReport` to the repository file's import from `qa.models.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/qa-repository.spec.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Migrate every remaining call site in `qa-store.ts`**

Enumerate with `grep -noE "this\.(submissionRateLimits|auditLogs|cachedSegmentReports)\.[a-zA-Z]+\(" src/server/qa-store.ts`:

- `submitQuestion`'s rate-limit block (today ~1177-1199): the two `(this.submissionRateLimits.get(key) || []).filter(...)` reads → `this.repo.getRateLimitTimestamps(key).filter(...)`; the two `.set(key, timestamps)` writes → `this.repo.setRateLimitTimestamps(key, timestamps)`.
- `logAudit` public method body (today ~1532-1546, the `if (!this.auditLogs.has(code)) {...} this.auditLogs.get(code)!.push(fullEntry);` block) → `this.repo.appendAuditEntry(code, fullEntry);` (the lazy-init guard is no longer needed).
- `getAuditLog` public method body (today ~1548-1550) → `return this.repo.getAuditLog(seriesCode.toUpperCase());`
- Seed data's `this.auditLogs.set(code, [])` calls (today ~429, 2485, 2826, 3124) → delete (no longer needed).
- `getSeriesReport`'s cached-report read/write (today ~2044-2062) → `this.repo.getCachedReport(seg.id)` / `this.repo.setCachedReport(seg.id, segReport)`.

Confirm zero remaining matches. At this point, run `grep -n "= new Map\|= new Set" src/server/qa-store.ts` — it should return **nothing**: `QaStore` now holds no storage fields at all, only `private repo = new QaRepository();`.

- [ ] **Step 6: Run the full suite**

Run: `npm test` and `npx tsc -p tsconfig.app.json --noEmit`. This is the last of the four repository-extraction tasks — all 37 original tests plus the 13 new repository tests (50 total) must pass.

- [ ] **Step 7: Commit**

```bash
git add src/server/qa-repository.ts src/server/qa-repository.spec.ts src/server/qa-store.ts
git commit -m "refactor: extract rate-limit/audit/report-cache storage into QaRepository; QaStore now holds no storage fields"
```

---

### Task 5: Route handlers stop mutating entities directly

**Files:**
- Modify: `src/server/qa-store.ts`
- Modify: `src/server.ts`
- Modify: `src/server/series-store.spec.ts`

**Context (exact violation, from the audit):** `server.ts`'s PATCH `/api/series/:code` (route 1c), POST `/api/series/:code/grounding` (1f), POST `/api/series/:code/end` (1g), PATCH `/api/series/:code/segments/:id` (2c), and POST `/api/series/:code/segments/:id/grounding` (2k) all currently do `const series = qaStore.getSeries(code); series.title = title; ...` directly in the route body instead of calling a `QaStore` method. This task adds five `QaStore` methods matching the existing `{ success, status?, error?, series?/segment? }` convention used by `startSegment`/`deleteSegment`/etc., then rewires the five routes to call them.

**Interfaces:**
- Produces (new `QaStore` public methods):
  ```ts
  updateSeriesMetadata(
    joinCode: string,
    patch: { title?: string; description?: string; contextData?: string; seriesContextData?: string; settings?: Partial<SeriesSettings>; state?: SeriesState; geminiApiKey?: string },
    token: string | undefined
  ): { success: boolean; status?: number; error?: string; series?: Series };

  updateSeriesGrounding(
    joinCode: string,
    contextData: string,
    token: string | undefined
  ): { success: boolean; status?: number; error?: string };

  endSeries(
    joinCode: string,
    token: string | undefined
  ): { success: boolean; status?: number; error?: string; series?: Series };

  updateSegmentProfile(
    joinCode: string,
    segmentId: string,
    patch: Partial<Segment>,
    token: string | undefined
  ): { success: boolean; status?: number; error?: string; segment?: Segment };

  updateSegmentGrounding(
    joinCode: string,
    segmentId: string,
    groundingContext: string,
    token: string | undefined
  ): { success: boolean; status?: number; error?: string; segment?: Segment };
  ```
  Every one of these calls `this.verifyToken(code, token)` for authorization, exactly like `addSegment`/`deleteSegment` already do — do not introduce a second auth mechanism.

- [ ] **Step 1: Write the failing tests** — append to `series-store.spec.ts`:

```ts
describe('5. Use-case methods replace direct route mutation', () => {
  it('updateSeriesMetadata requires organizer token and applies a partial patch', () => {
    const denied = store.updateSeriesMetadata('NEXT26', { title: 'Hacked' }, 'not-a-real-token');
    expect(denied.success).toBe(false);
    expect(denied.status).toBe(403);

    const before = store.getSeries('NEXT26')!;
    const initialRevision = before.revision || 1;
    const result = store.updateSeriesMetadata('NEXT26', { title: 'Cloud Summit (Updated)' }, 'organizer_secret_next26');
    expect(result.success).toBe(true);
    expect(result.series?.title).toBe('Cloud Summit (Updated)');
    expect(store.getSeries('NEXT26')!.revision).toBe(initialRevision + 1);

    const audit = store.getAuditLog('NEXT26');
    expect(audit.some(a => a.action === 'SERIES_UPDATED')).toBe(true);
  });

  it('updateSeriesGrounding sets both contextData and seriesContextData and logs SERIES_GROUNDING_UPDATED', () => {
    const result = store.updateSeriesGrounding('NEXT26', 'New grounding text', 'organizer_secret_next26');
    expect(result.success).toBe(true);
    const series = store.getSeries('NEXT26')!;
    expect(series.contextData).toBe('New grounding text');
    expect(series.seriesContextData).toBe('New grounding text');
    expect(store.getAuditLog('NEXT26').some(a => a.action === 'SERIES_GROUNDING_UPDATED')).toBe(true);
  });

  it('endSeries sets series and all live/paused segments to ENDED and logs SERIES_ENDED', () => {
    store.startSegment('NEXT26', 'seg-1', 'organizer_secret_next26');
    const result = store.endSeries('NEXT26', 'organizer_secret_next26');
    expect(result.success).toBe(true);
    const series = store.getSeries('NEXT26')!;
    expect(series.state).toBe('ENDED');
    expect(series.liveSegmentId).toBeNull();
    expect(series.segments.find(s => s.id === 'seg-1')?.state).toBe('ENDED');
    expect(store.getAuditLog('NEXT26').some(a => a.action === 'SERIES_ENDED')).toBe(true);
  });

  it('updateSegmentProfile applies known fields and keeps nested speaker profile in sync', () => {
    const denied = store.updateSegmentProfile('NEXT26', 'seg-1', { title: 'Hacked' }, 'wrong-token');
    expect(denied.success).toBe(false);

    const result = store.updateSegmentProfile(
      'NEXT26',
      'seg-1',
      { speakerBio: 'New bio', speakerX: 'https://x.com/example' },
      'organizer_secret_next26'
    );
    expect(result.success).toBe(true);
    expect(result.segment?.speakerBio).toBe('New bio');
    expect(result.segment?.speaker?.bio).toBe('New bio');
    expect(result.segment?.speaker?.xUrl).toBe('https://x.com/example');
  });

  it('updateSegmentGrounding sets both groundingContext and contextData on the segment', () => {
    const result = store.updateSegmentGrounding('NEXT26', 'seg-1', 'Segment-specific grounding', 'organizer_secret_next26');
    expect(result.success).toBe(true);
    expect(result.segment?.groundingContext).toBe('Segment-specific grounding');
    expect(result.segment?.contextData).toBe('Segment-specific grounding');
  });
});
```

Check `series-store.spec.ts`'s existing seed data for the exact organizer/speaker token strings and segment ids used above (`organizer_secret_next26`, `seg-1`) — they're already used earlier in the same file (see the existing "1. Auth" and "3. Single-Live Invariant" describe blocks); match them exactly.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/series-store.spec.ts`
Expected: FAIL — none of the five methods exist on `QaStore` yet.

- [ ] **Step 3: Implement the five methods in `qa-store.ts`**

Add these next to the other segment/series lifecycle methods (near `addSegment`/`deleteSegment`), copying their exact `verifyToken`/`logAudit`/`revision`-bump conventions:

```ts
public updateSeriesMetadata(
  joinCode: string,
  patch: {
    title?: string;
    description?: string;
    contextData?: string;
    seriesContextData?: string;
    settings?: Partial<SeriesSettings>;
    state?: SeriesState;
    geminiApiKey?: string;
  },
  token: string | undefined
): { success: boolean; status?: number; error?: string; series?: Series } {
  const code = joinCode.toUpperCase();
  const series = this.getSeries(code);
  if (!series) return { success: false, status: 404, error: 'Series not found' };

  const auth = this.verifyToken(code, token);
  if (auth.role !== 'organizer') {
    return { success: false, status: 403, error: 'Organizer permission required' };
  }

  if (patch.title) series.title = patch.title;
  if (patch.description !== undefined) series.description = patch.description;
  if (patch.contextData !== undefined) {
    series.contextData = patch.contextData;
    series.seriesContextData = patch.contextData;
  }
  if (patch.seriesContextData !== undefined) {
    series.seriesContextData = patch.seriesContextData;
    series.contextData = patch.seriesContextData;
  }
  if (patch.settings) {
    series.settings = { ...series.settings, ...patch.settings };
  }
  if (patch.state) {
    series.state = patch.state;
  }
  if (patch.geminiApiKey !== undefined) {
    const key = typeof patch.geminiApiKey === 'string' ? patch.geminiApiKey.trim() : '';
    series.geminiApiKey =
      key && key.length >= 10 && key !== 'MY_GEMINI_API_KEY' && key !== 'TODO' ? key : undefined;
  }
  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  this.logAudit({
    seriesId: series.id,
    actorRole: 'organizer',
    actorRef: 'organizer',
    action: 'SERIES_UPDATED',
    targetId: series.id,
  });

  return { success: true, series };
}

public updateSeriesGrounding(
  joinCode: string,
  contextData: string,
  token: string | undefined
): { success: boolean; status?: number; error?: string } {
  const code = joinCode.toUpperCase();
  const series = this.getSeries(code);
  if (!series) return { success: false, status: 404, error: 'Series not found' };

  const auth = this.verifyToken(code, token);
  if (auth.role !== 'organizer') {
    return { success: false, status: 403, error: 'Organizer permission required' };
  }

  series.contextData = contextData || '';
  series.seriesContextData = contextData || '';
  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  this.logAudit({
    seriesId: series.id,
    actorRole: 'organizer',
    actorRef: 'organizer',
    action: 'SERIES_GROUNDING_UPDATED',
    targetId: series.id,
  });

  return { success: true };
}

public endSeries(
  joinCode: string,
  token: string | undefined
): { success: boolean; status?: number; error?: string; series?: Series } {
  const code = joinCode.toUpperCase();
  const series = this.getSeries(code);
  if (!series) return { success: false, status: 404, error: 'Series not found' };

  const auth = this.verifyToken(code, token);
  if (auth.role !== 'organizer') {
    return { success: false, status: 403, error: 'Organizer permission required' };
  }

  series.state = 'ENDED';
  const nowIso = new Date().toISOString();
  series.segments.forEach(seg => {
    if (seg.state === 'LIVE' || seg.state === 'PAUSED' || seg.status === 'LIVE' || seg.status === 'PAUSED') {
      seg.state = 'ENDED';
      seg.status = 'ENDED';
      seg.actualEnd = nowIso;
      seg.actualEndTime = nowIso;
    }
  });
  series.liveSegmentId = null;
  series.activeSegmentId = null;
  series.revision = (series.revision || 1) + 1;
  series.updatedAt = nowIso;

  this.logAudit({
    seriesId: series.id,
    actorRole: 'organizer',
    actorRef: 'organizer',
    action: 'SERIES_ENDED',
    targetId: series.id,
  });

  return { success: true, series };
}

public updateSegmentProfile(
  joinCode: string,
  segmentId: string,
  patch: Partial<Segment>,
  token: string | undefined
): { success: boolean; status?: number; error?: string; segment?: Segment } {
  const code = joinCode.toUpperCase();
  const series = this.getSeries(code);
  if (!series) return { success: false, status: 404, error: 'Series not found' };

  const auth = this.verifyToken(code, token);
  if (auth.role !== 'organizer' && !(auth.role === 'speaker' && auth.scope.includes(segmentId))) {
    return { success: false, status: 403, error: 'Unauthorized to update this segment' };
  }

  const seg = series.segments.find(s => s.id === segmentId);
  if (!seg) return { success: false, status: 404, error: 'Segment not found' };

  if (patch.title) seg.title = patch.title;
  if (patch.speakerName) seg.speakerName = patch.speakerName;
  if (patch.speakerBio !== undefined) seg.speakerBio = patch.speakerBio;
  if (patch.speakerRole !== undefined) seg.speakerRole = patch.speakerRole;
  if (patch.speakerAvatar !== undefined) seg.speakerAvatar = patch.speakerAvatar;
  if (patch.speakerOrg !== undefined) seg.speakerOrg = patch.speakerOrg;
  if (patch.topicSummary !== undefined) seg.topicSummary = patch.topicSummary;
  if (patch.sessionDescription !== undefined) {
    const desc = String(patch.sessionDescription || '').trim();
    seg.sessionDescription = desc || undefined;
    if (desc) seg.topicSummary = desc;
  }
  if (patch.speakerEmail !== undefined) {
    const email = String(patch.speakerEmail || '').trim().toLowerCase();
    seg.speakerEmail = email && email.includes('@') ? email : undefined;
  }
  if (patch.speakerX !== undefined) {
    seg.speakerX = String(patch.speakerX || '').trim() || undefined;
  }
  if (patch.speakerLinkedIn !== undefined) {
    seg.speakerLinkedIn = String(patch.speakerLinkedIn || '').trim() || undefined;
  }
  if (patch.speakerWebsite !== undefined) {
    seg.speakerWebsite = String(patch.speakerWebsite || '').trim() || undefined;
  }
  if (seg.speaker) {
    if (patch.speakerX !== undefined) seg.speaker.xUrl = seg.speakerX;
    if (patch.speakerLinkedIn !== undefined) seg.speaker.linkedinUrl = seg.speakerLinkedIn;
    if (patch.speakerWebsite !== undefined) seg.speaker.websiteUrl = seg.speakerWebsite;
    if (patch.speakerBio !== undefined) seg.speaker.bio = seg.speakerBio;
    if (patch.speakerOrg !== undefined) seg.speaker.org = seg.speakerOrg;
  }
  if (patch.groundingContext !== undefined) {
    seg.groundingContext = patch.groundingContext;
    seg.contextData = patch.groundingContext;
  }
  if (patch.contextData !== undefined) {
    seg.contextData = patch.contextData;
    seg.groundingContext = patch.contextData;
  }
  if (patch.categories && Array.isArray(patch.categories)) seg.categories = patch.categories;
  if (patch.durationMinutes) {
    seg.durationMinutes = patch.durationMinutes;
    seg.scheduledDurationMinutes = patch.durationMinutes;
  }

  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  return { success: true, segment: seg };
}

public updateSegmentGrounding(
  joinCode: string,
  segmentId: string,
  groundingContext: string,
  token: string | undefined
): { success: boolean; status?: number; error?: string; segment?: Segment } {
  const code = joinCode.toUpperCase();
  const series = this.getSeries(code);
  if (!series) return { success: false, status: 404, error: 'Series not found' };

  const auth = this.verifyToken(code, token);
  if (auth.role !== 'organizer' && !(auth.role === 'speaker' && auth.scope.includes(segmentId))) {
    return { success: false, status: 403, error: 'Unauthorized to update this segment' };
  }

  const seg = series.segments.find(s => s.id === segmentId);
  if (!seg) return { success: false, status: 404, error: 'Segment not found' };

  seg.groundingContext = groundingContext || '';
  seg.contextData = groundingContext || '';
  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  return { success: true, segment: seg };
}
```

Note the auth check in `updateSeriesMetadata`/`updateSeriesGrounding`/`endSeries` deliberately mirrors what the current `server.ts` routes get for free from their `requireAuth(qaStore, ['organizer'])` middleware — since these three routes already have that middleware today (verify this stays true after Step 4 below), the in-method `verifyToken` check here is a defense-in-depth duplicate, not a behavior change. `updateSegmentProfile`/`updateSegmentGrounding` match the current routes' `requireAuth(qaStore, ['organizer', 'speaker'])` for the profile route, and no middleware at all for the grounding route (2k) — check the current middleware on 2k specifically before assuming; if 2k has no `requireAuth`, the in-method check here is what actually enforces authorization going forward, so get it right.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/series-store.spec.ts`
Expected: PASS (all previous + 5 new tests)

- [ ] **Step 5: Rewire the five `server.ts` route handlers**

Replace each handler body with a thin delegate. Example for route 1c (PATCH `/api/series/:code`):

```ts
// Before:
app.patch('/api/series/:code', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  const { title, description, contextData, seriesContextData, settings, state, geminiApiKey } = req.body;
  if (title) series.title = title;
  // ...15 more lines of direct mutation...
  res.json({ success: true, series: sanitizeSeriesForPublic(series) });
});

// After:
app.patch('/api/series/:code', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const token = extractBearerToken(req);
  const { title, description, contextData, seriesContextData, settings, state, geminiApiKey } = req.body;
  const result = qaStore.updateSeriesMetadata(
    code,
    { title, description, contextData, seriesContextData, settings, state, geminiApiKey },
    token
  );
  if (!result.success) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ success: true, series: sanitizeSeriesForPublic(result.series!) });
});
```

Apply the same pattern to the other four:
- Route 1f (`/api/series/:code/grounding`): call `qaStore.updateSeriesGrounding(code, req.body.contextData, extractBearerToken(req))`; on success respond `res.json({ success: true, message: 'Series grounding updated successfully' });` (unchanged message, matching today's response).
- Route 1g (`/api/series/:code/end`): call `qaStore.endSeries(code, extractBearerToken(req))`; on success respond `res.json({ success: true, series: sanitizeSeriesForPublic(result.series!) });`.
- Route 2c (`/api/series/:code/segments/:id`, PATCH): call `qaStore.updateSegmentProfile(code, id, req.body, extractBearerToken(req))`; on success respond `res.json({ success: true, segment: result.segment });` (matches today's response, which returns the segment un-sanitized already — that's pre-existing behavior for this specific route since only the requesting organizer/speaker sees it; do not change that here, it's out of scope for this task).
- Route 2k (`/api/series/:code/segments/:id/grounding`): call `qaStore.updateSegmentGrounding(code, id, req.body.groundingContext, extractBearerToken(req))`; on success respond `res.json({ success: true, segment: result.segment });`.

For each, keep the existing `requireAuth(...)` middleware exactly as it is today — the in-`QaStore`-method check is defense-in-depth, not a replacement for it.

- [ ] **Step 6: Run the full suite and a manual smoke check**

Run: `npm test` and `npx tsc -p tsconfig.app.json --noEmit`.

Then start the dev server (`npm run dev`) and manually verify, using the browser or `curl`, that:
- Creating a series, then PATCHing its title via the organizer token, reflects the new title on a subsequent GET.
- Ending a series via POST `/end` sets its state to `ENDED` in a subsequent GET.

- [ ] **Step 7: Commit**

```bash
git add src/server/qa-store.ts src/server/series-store.spec.ts src/server.ts
git commit -m "refactor: move series/segment mutation logic from server.ts routes into QaStore use-case methods"
```

---

### Task 6: Composition root — construct `qaStore` in `server.ts`

**Files:**
- Modify: `src/server/qa-store.ts`
- Modify: `src/server.ts`

**Context:** Today, `qa-store.ts` ends with `export const qaStore = new QaStore(false);` — a module-level singleton constructed as an import-time side effect. `server.ts` imports the already-constructed value. Only `server.ts` imports this singleton (`auth.ts` imports the `QaStore` type only; `series-store.spec.ts` imports the class and constructs its own instances) — moving construction to `server.ts` is a safe, contained change.

- [ ] **Step 1: Remove the singleton export from `qa-store.ts`**

At the bottom of `qa-store.ts`, delete the line:
```ts
export const qaStore = new QaStore(false);
```
Confirm `export class QaStore {` (near the top of the file) is unaffected — the class itself must stay exported since `server.ts` and `series-store.spec.ts` both need it.

- [ ] **Step 2: Construct it in `server.ts`**

Change:
```ts
import { qaStore } from './server/qa-store.js';
```
to:
```ts
import { QaStore } from './server/qa-store.js';
```
Then, immediately after the `const app = express();` line, add:
```ts
const qaStore = new QaStore(false);
```

- [ ] **Step 3: Verify the build and tests**

Run: `npx tsc -p tsconfig.app.json --noEmit` — expect no errors (this catches any other file that might have imported the singleton value; the earlier `grep` in this session confirmed there are none, but re-verify since the codebase may have changed since then: `grep -rn "from '.*qa-store" src --include=*.ts`).
Run: `npm test` — expect all tests still passing (this task doesn't touch `QaStore`'s exported class, so `series-store.spec.ts` is unaffected).
Run: `npm run dev` briefly and confirm the server still starts and `GET /api/live-room` responds (confirms `qaStore` is constructed and reachable at runtime, not just at typecheck time).

- [ ] **Step 4: Commit**

```bash
git add src/server/qa-store.ts src/server.ts
git commit -m "refactor: construct qaStore singleton in server.ts (composition root) instead of as a qa-store.ts module side effect"
```

---

### Task 7: Consolidate segment sanitization into a named, tested helper

**Files:**
- Modify: `src/server/auth.ts`
- Create: `src/server/auth.spec.ts`
- Modify: `src/server.ts`

**Context (exact violation, from the audit):** `server.ts`'s segments-list route (2a, `GET /api/series/:code/segments`) strips secrets with an inline destructure:
```ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { adminToken, speakerEmail, ...safe } = seg;
return safe;
```
This is a second, ad-hoc sanitizer living next to `auth.ts`'s `sanitizeSeriesForPublic` — same intent (strip secrets before a role that doesn't need them sees them), different location, no test coverage, and it requires an eslint-disable comment because of the unused-destructure pattern. Extract it into a named function alongside `sanitizeSeriesForPublic` so it's discoverable and testable the same way.

**Interfaces:**
- Produces:
  ```ts
  function sanitizeSegmentForRole(seg: Segment, auth: UserAccessInfo): Segment | Omit<Segment, 'adminToken' | 'speakerEmail'>;
  ```
  Returns `seg` unchanged when `auth.role === 'organizer'` or when `auth.role === 'speaker'` and `auth.scope.includes(seg.id)`; otherwise strips `adminToken` and `speakerEmail`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/auth.spec.ts
import { describe, it, expect } from 'vitest';
import { sanitizeSegmentForRole } from './auth.js';
import type { Segment, UserAccessInfo } from '../app/models/qa.models.js';

const seg = {
  id: 'seg-1',
  adminToken: 'spk_secret',
  speakerEmail: 'speaker@example.com',
  title: 'Talk',
} as Segment;

describe('sanitizeSegmentForRole', () => {
  it('returns the segment unchanged for the organizer', () => {
    const auth: UserAccessInfo = { role: 'organizer', scope: ['*'] };
    expect(sanitizeSegmentForRole(seg, auth)).toBe(seg);
  });

  it('returns the segment unchanged for the speaker assigned to that segment', () => {
    const auth: UserAccessInfo = { role: 'speaker', scope: ['seg-1'] };
    expect(sanitizeSegmentForRole(seg, auth)).toBe(seg);
  });

  it('strips adminToken and speakerEmail for a speaker of a different segment', () => {
    const auth: UserAccessInfo = { role: 'speaker', scope: ['seg-2'] };
    const result = sanitizeSegmentForRole(seg, auth) as Partial<Segment>;
    expect(result.adminToken).toBeUndefined();
    expect(result.speakerEmail).toBeUndefined();
    expect(result.title).toBe('Talk');
  });

  it('strips adminToken and speakerEmail for an attendee', () => {
    const auth: UserAccessInfo = { role: 'attendee', scope: [] };
    const result = sanitizeSegmentForRole(seg, auth) as Partial<Segment>;
    expect(result.adminToken).toBeUndefined();
    expect(result.speakerEmail).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/auth.spec.ts`
Expected: FAIL — `sanitizeSegmentForRole` is not exported from `./auth.js`.

- [ ] **Step 3: Implement in `auth.ts`**, right after `sanitizeSeriesForPublic`:

```ts
/**
 * Per-segment sanitizer: the organizer or the segment's own assigned speaker
 * may see its adminToken/speakerEmail; everyone else gets the safe subset.
 */
export function sanitizeSegmentForRole(
  seg: Segment,
  auth: UserAccessInfo
): Segment | Omit<Segment, 'adminToken' | 'speakerEmail'> {
  if (auth.role === 'organizer' || (auth.role === 'speaker' && auth.scope.includes(seg.id))) {
    return seg;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminToken, speakerEmail, ...safe } = seg;
  return safe;
}
```

Add `Segment` to `auth.ts`'s existing type import from `../app/models/qa.models.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/auth.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Use it in `server.ts`**

Replace route 2a's body:
```ts
// Before:
const segments = series.segments.map(seg => {
  if (auth.role === 'organizer' || (auth.role === 'speaker' && auth.scope.includes(seg.id))) {
    return seg;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminToken, speakerEmail, ...safe } = seg;
  return safe;
});

// After:
const segments = series.segments.map(seg => sanitizeSegmentForRole(seg, auth));
```

Add `sanitizeSegmentForRole` to `server.ts`'s existing import from `./server/auth.js`.

- [ ] **Step 6: Run the full suite**

Run: `npm test` and `npx tsc -p tsconfig.app.json --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/server/auth.ts src/server/auth.spec.ts src/server.ts
git commit -m "refactor: extract segment sanitization into a named, tested sanitizeSegmentForRole helper"
```

---

### Task 8: Final full regression pass

**Files:** none (verification only)

- [ ] **Step 1:** Run `npm test` — expect all tests green (37 original + repository tests from Tasks 1-4 + use-case tests from Task 5 + auth tests from Task 7).
- [ ] **Step 2:** Run `npx tsc -p tsconfig.app.json --noEmit` — expect zero errors.
- [ ] **Step 3:** Run `npm run build` — expect a clean Angular/SSR production build (this is the first task in the plan that exercises the full build pipeline, including `server.ts`'s composition-root change under production bundling).
- [ ] **Step 4:** Run `npm run dev`, then manually walk through: create a series → add a segment → start it → PATCH the series title → PATCH the segment's speaker bio → end the segment → end the series. Confirm each step's response looks correct and no `organizerToken`/`adminToken` appears in any response body via the browser's Network tab.
- [ ] **Step 5:** If a Playwright/Chrome session is available, run `npm run test:e2e` for full end-to-end coverage; otherwise note in the final report that e2e was not run and why.
