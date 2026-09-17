# URL-Synced Navigation, Header Layout Fix & Executive Report Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AskQlive real per-view URLs (deep links, back/forward, refresh-safe), fix the header nav layout bug from the reported screenshot, make the Post-Session Executive Report show real AI-generated content instead of a canned fallback, and stop Analytics from displaying a fabricated sentiment number.

**Architecture:** Angular Router (`provideRouter` is already wired in `app.config.ts` but unused) becomes the source of truth for what's on screen, replacing the manual `@switch` on `qaService.currentView()`/`activeTab()` in `app.html`. `QaService` keeps those two signals for backward compatibility with code that already reads them, but they become *derived from the URL* via a `Router.events` subscription, plus a companion effect that pushes the URL forward whenever session state changes outside of a navigation (join-by-code form, host creating/re-entering a session). A `sessionResolver` loads session data on direct navigation/refresh; `staffTabGuard`/`adminTabGuard`/`organizerGuard` replace the in-template role fallbacks with route redirects to `.../feed` or `/auth`. Server-side, `generatePostSessionReport()` gains a real `executiveSummary` field (mirroring the already-correct `generateSeriesExecutiveReport()`), and a new pure `computeSessionMetrics()` function adds deterministic (non-AI, non-hallucinating) metrics to the report.

**Tech Stack:** Angular 21 (standalone components, signals, zoneless change detection), Angular Router, Express 5 + `@angular/ssr` (Angular Universal SSR/SSG), `@google/genai` (Gemini), Vitest, Playwright (raw, not `@playwright/test`).

**Spec:** `docs/superpowers/specs/2026-09-17-url-routing-and-executive-report-design.md`

## Global Constraints

- Angular 21 standalone components + signals + zoneless change detection (`provideZonelessChangeDetection` in `app.config.ts`) — no zone.js-dependent patterns, no `NgModule`.
- No new npm dependencies — `@angular/router` is already installed and provided.
- Preserve every existing `#nav-tab-*` / `#mob-tab-*` / `#btn-*` element ID — `tests/playwright-suite.mjs` selects on them.
- `{origin}/?code=ABC123` (and `?room=`, `?join=`, `?session=`, `?token=`) links must keep working forever — they're already printed on distributed QR codes.
- Server and client share one model file: `src/app/models/qa.models.ts`, imported from server code as `../app/models/qa.models.js` (note the `.js` extension on a `.ts` import — this project's existing convention for NodeNext ESM resolution).
- Angular components in this repo have no unit-test harness (`app.spec.ts` is a placeholder stub) — client-side behavioral verification for this plan happens through `ng build` (compiles templates + types) per task, and through Playwright (`tests/playwright-suite.mjs`, run via `npm run test:playwright`) as a batched end-to-end check, not per-task browser runs. Server-side logic (gemini.service.ts, report-metrics.ts) has a real Vitest convention (`src/server/*.spec.ts`, `npm run test`) and gets full TDD.
- `series-store.spec.ts`-style tests call the real `generatePostSessionReport()`/Gemini live (no mocking) — `.env` has a working `GEMINI_API_KEY` and `gemini.service.ts` loads it via `process.loadEnvFile()` at module load, so this works in Vitest too. Follow that existing pattern for new AI-backed tests; don't introduce mocking.

---

## Task 1: Add `executiveSummary` to the single-session report (server)

**Files:**
- Modify: `src/app/models/qa.models.ts:286-299` (`PostSessionReport` interface)
- Modify: `src/server/gemini.service.ts:899-1025` (`generatePostSessionReport`)
- Test: `src/server/series-store.spec.ts` (new `describe` block)

**Interfaces:**
- Consumes: nothing new
- Produces: `PostSessionReport.executiveSummary: string | undefined` (now reliably populated); `generatePostSessionReport()` return type gains `executiveSummary: string`

- [ ] **Step 1: Write the failing test**

Add to `src/server/series-store.spec.ts` (new top-level `describe`, after the existing ones — the file already imports `generateTwoLineAnswer` etc. from `./gemini.service.js`, add `generatePostSessionReport` to that same import):

```ts
import { generateTwoLineAnswer, chunkTextForRag, cosineSimilarity, performEmbeddingRag, generatePostSessionReport } from './gemini.service.js';
```

```ts
describe('Phase P1: Single-Session Executive Report Accuracy', () => {
  it('should generate a real, session-specific executive summary (not the generic fallback sentence)', async () => {
    const report = await generatePostSessionReport(
      'Edge AI Inference Deep-Dive',
      'A technical session on running quantized LLMs on edge GPUs.',
      [
        { content: 'What quantization formats does the runtime support?', upvotes: 12, aiLine1: 'INT4 and INT8 are both supported.', category: 'Technical' },
        { content: 'How does latency compare to cloud inference?', upvotes: 8, aiLine1: 'Edge inference cuts round-trip latency significantly.', category: 'Performance' },
      ]
    );

    expect(report.executiveSummary).toBeTruthy();
    expect(report.executiveSummary.length).toBeGreaterThan(20);
    expect(report.executiveSummary).not.toBe('Real-time session synthesis completed across attendee inquiry streams and upvote momentum.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- series-store.spec.ts -t "executive summary"`
Expected: FAIL — `report.executiveSummary` is `undefined` (`toBeTruthy()` fails), because `generatePostSessionReport()` doesn't produce that field yet.

- [ ] **Step 3: Add `executiveSummary` to the model**

In `src/app/models/qa.models.ts`, the `PostSessionReport` interface already declares `executiveSummary?: string;` at line 291 — confirm it's there (it is; only the generator was missing it). No model change needed for this field. Skip to Step 4.

- [ ] **Step 4: Update the prompt, schema, fallback, and return value in `gemini.service.ts`**

In `src/server/gemini.service.ts`, replace the function signature's return type (lines 903-908):

```ts
): Promise<{
  topThemes: { title: string; description: string; questionExamples: string[] }[];
  unresolvedTopics: { topic: string; significance: string }[];
  actionableFollowUps: string[];
  markdownReport: string;
}> {
```

with:

```ts
): Promise<{
  executiveSummary: string;
  topThemes: { title: string; description: string; questionExamples: string[] }[];
  unresolvedTopics: { topic: string; significance: string }[];
  actionableFollowUps: string[];
  markdownReport: string;
}> {
```

Replace the prompt's task list (lines 923-927):

```ts
Synthesize a comprehensive, executive post-session intelligence report containing:
1. Exactly top 3 thematic inquiry clusters with descriptions and sample questions.
2. Unresolved topics or controversial inquiries that required deeper clarification.
3. Exactly 5 concrete, actionable follow-up items for the speaker or engineering team.
4. A full executive summary formatted in clean, elegant Markdown with tables and bullet points.`;
```

with:

```ts
Synthesize a comprehensive, executive post-session intelligence report containing:
1. A 2-3 sentence executive summary (executiveSummary field) of THIS session's actual engagement, themes, and audience energy — it must reflect the specific questions and context above, never generic boilerplate.
2. Exactly top 3 thematic inquiry clusters with descriptions and sample questions.
3. Unresolved topics or controversial inquiries that required deeper clarification.
4. Exactly 5 concrete, actionable follow-up items for the speaker or engineering team.
5. A full markdown report (markdownReport field) formatted in clean, elegant Markdown with tables and bullet points.`;
```

Replace the `fallback` object (lines 929-965) — add `executiveSummary` as the first property, built from the real `questions`/`sessionTitle` arguments so even the failure path isn't generic:

```ts
const fallback = {
  executiveSummary: `Session synthesis for "${sessionTitle}": ${questions.length} attendee question${questions.length === 1 ? ' was' : 's were'} captured with ${questions.reduce((sum, q) => sum + q.upvotes, 0)} total upvotes, spanning infrastructure, performance, and audience follow-up topics.`,
  topThemes: [
```

(leave the rest of `fallback` — `topThemes` through `markdownReport` — unchanged).

Replace the `responseSchema.properties` object (lines 974-1006) to add `executiveSummary`:

```ts
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: { type: Type.STRING },
          topThemes: {
```

(the rest of `properties` stays the same), and add `'executiveSummary'` to the `required` array (line 1007):

```ts
        required: ['executiveSummary', 'topThemes', 'unresolvedTopics', 'actionableFollowUps', 'markdownReport'],
```

Replace the return block (lines 1011-1017):

```ts
    const parsed = safeJsonParse<typeof fallback>(rawResponse, fallback);
    return {
      topThemes: Array.isArray(parsed.topThemes) && parsed.topThemes.length > 0 ? parsed.topThemes : fallback.topThemes,
      unresolvedTopics: Array.isArray(parsed.unresolvedTopics) && parsed.unresolvedTopics.length > 0 ? parsed.unresolvedTopics : fallback.unresolvedTopics,
      actionableFollowUps: Array.isArray(parsed.actionableFollowUps) && parsed.actionableFollowUps.length > 0 ? parsed.actionableFollowUps : fallback.actionableFollowUps,
      markdownReport: parsed.markdownReport || fallback.markdownReport,
    };
```

with:

```ts
    const parsed = safeJsonParse<typeof fallback>(rawResponse, fallback);
    return {
      executiveSummary: parsed.executiveSummary || fallback.executiveSummary,
      topThemes: Array.isArray(parsed.topThemes) && parsed.topThemes.length > 0 ? parsed.topThemes : fallback.topThemes,
      unresolvedTopics: Array.isArray(parsed.unresolvedTopics) && parsed.unresolvedTopics.length > 0 ? parsed.unresolvedTopics : fallback.unresolvedTopics,
      actionableFollowUps: Array.isArray(parsed.actionableFollowUps) && parsed.actionableFollowUps.length > 0 ? parsed.actionableFollowUps : fallback.actionableFollowUps,
      markdownReport: parsed.markdownReport || fallback.markdownReport,
    };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- series-store.spec.ts -t "executive summary"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/gemini.service.ts src/server/series-store.spec.ts
git commit -m "fix: generate a real executive summary for single-session reports"
```

---

## Task 2: Deterministic session metrics (server, pure function + tests)

**Files:**
- Create: `src/server/report-metrics.ts`
- Test: `src/server/report-metrics.spec.ts`

**Interfaces:**
- Consumes: `Question` type from `../app/models/qa.models.js`
- Produces: `computeSessionMetrics(questions: Question[]): SessionMetrics`, `SessionMetrics` interface (used by Task 3 and Task 4)

- [ ] **Step 1: Write the failing test**

Create `src/server/report-metrics.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSessionMetrics } from './report-metrics.js';
import { Question } from '../app/models/qa.models.js';

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: overrides.id || 'q1',
    sessionId: 'sess-1',
    clientFingerprint: 'fp-1',
    authorName: 'Attendee',
    isAnonymous: false,
    content: 'Sample question?',
    upvotes: 0,
    isSpam: false,
    status: 'APPROVED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeSessionMetrics', () => {
  it('returns zeroed metrics for an empty question list', () => {
    const result = computeSessionMetrics([]);
    expect(result.aiCoverageRatio).toBe(0);
    expect(result.sentimentBreakdown).toEqual({
      positive: 0, neutral: 0, critical: 0, positivePct: 0, neutralPct: 0, criticalPct: 0,
    });
    expect(result.topQuestions).toEqual([]);
  });

  it('computes AI coverage ratio from aiLine1 + aiStatus READY', () => {
    const questions = [
      makeQuestion({ id: 'q1', aiLine1: 'Answer', aiStatus: 'READY' }),
      makeQuestion({ id: 'q2', aiLine1: 'Answer', aiStatus: 'READY' }),
      makeQuestion({ id: 'q3', aiStatus: 'GENERATING' }),
      makeQuestion({ id: 'q4' }),
    ];
    expect(computeSessionMetrics(questions).aiCoverageRatio).toBe(50);
  });

  it('buckets sentiment into positive, neutral, and critical using +-0.2 thresholds', () => {
    const questions = [
      makeQuestion({ id: 'q1', sentimentScore: 0.6 }),
      makeQuestion({ id: 'q2', sentimentScore: 0.2 }),
      makeQuestion({ id: 'q3', sentimentScore: 0 }),
      makeQuestion({ id: 'q4', sentimentScore: -0.2 }),
      makeQuestion({ id: 'q5', sentimentScore: -0.9 }),
    ];
    const { sentimentBreakdown } = computeSessionMetrics(questions);
    expect(sentimentBreakdown.positive).toBe(2);
    expect(sentimentBreakdown.neutral).toBe(1);
    expect(sentimentBreakdown.critical).toBe(2);
    expect(sentimentBreakdown.positivePct).toBe(40);
    expect(sentimentBreakdown.neutralPct).toBe(20);
    expect(sentimentBreakdown.criticalPct).toBe(40);
  });

  it('returns the top 5 questions by upvotes, most upvoted first', () => {
    const questions = Array.from({ length: 7 }, (_, i) =>
      makeQuestion({ id: `q${i}`, content: `Question ${i}`, upvotes: i })
    );
    const { topQuestions } = computeSessionMetrics(questions);
    expect(topQuestions).toHaveLength(5);
    expect(topQuestions[0]).toEqual({ id: 'q6', content: 'Question 6', authorName: 'Attendee', upvotes: 6 });
    expect(topQuestions[4].upvotes).toBe(2);
  });

  it('labels anonymous authors correctly in top questions', () => {
    const questions = [makeQuestion({ id: 'q1', isAnonymous: true, authorName: '', upvotes: 5 })];
    expect(computeSessionMetrics(questions).topQuestions[0].authorName).toBe('Anonymous');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- report-metrics.spec.ts`
Expected: FAIL with "Cannot find module './report-metrics.js'" (or similar) — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/server/report-metrics.ts`:

```ts
import { Question } from '../app/models/qa.models.js';

export interface SessionMetrics {
  aiCoverageRatio: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    critical: number;
    positivePct: number;
    neutralPct: number;
    criticalPct: number;
  };
  topQuestions: { id: string; content: string; authorName: string; upvotes: number }[];
}

const POSITIVE_THRESHOLD = 0.2;
const CRITICAL_THRESHOLD = -0.2;

export function computeSessionMetrics(questions: Question[]): SessionMetrics {
  const total = questions.length;
  const answered = questions.filter(q => q.aiLine1 && q.aiStatus === 'READY').length;
  const aiCoverageRatio = total === 0 ? 0 : Math.round((answered / total) * 100);

  let positive = 0;
  let neutral = 0;
  let critical = 0;
  for (const q of questions) {
    const score = q.sentimentScore ?? 0;
    if (score >= POSITIVE_THRESHOLD) positive++;
    else if (score <= CRITICAL_THRESHOLD) critical++;
    else neutral++;
  }
  const evaluated = positive + neutral + critical || 1;

  const topQuestions = [...questions]
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, 5)
    .map(q => ({
      id: q.id,
      content: q.content,
      authorName: q.authorName || (q.isAnonymous ? 'Anonymous' : 'Attendee'),
      upvotes: q.upvotes,
    }));

  return {
    aiCoverageRatio,
    sentimentBreakdown: {
      positive,
      neutral,
      critical,
      positivePct: Math.round((positive / evaluated) * 100),
      neutralPct: Math.round((neutral / evaluated) * 100),
      criticalPct: Math.round((critical / evaluated) * 100),
    },
    topQuestions,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- report-metrics.spec.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Commit**

```bash
git add src/server/report-metrics.ts src/server/report-metrics.spec.ts
git commit -m "feat: add deterministic session metrics for the executive report"
```

---

## Task 3: Wire metrics + model fields into the report API and model

**Files:**
- Modify: `src/app/models/qa.models.ts:286-299` (`PostSessionReport`)
- Modify: `src/server.ts:1-20,888-914`

**Interfaces:**
- Consumes: `computeSessionMetrics` from Task 2 (`./server/report-metrics.js`)
- Produces: `/api/sessions/:code/report` response now includes `aiCoverageRatio`, `sentimentBreakdown`, `topQuestions` alongside the existing fields

- [ ] **Step 1: Extend the `PostSessionReport` model**

In `src/app/models/qa.models.ts`, replace the `PostSessionReport` interface (lines 286-299):

```ts
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
```

with:

```ts
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
  aiCoverageRatio?: number;
  sentimentBreakdown?: {
    positive: number;
    neutral: number;
    critical: number;
    positivePct: number;
    neutralPct: number;
    criticalPct: number;
  };
  topQuestions?: {
    id: string;
    content: string;
    authorName: string;
    upvotes: number;
  }[];
}
```

- [ ] **Step 2: Import and call `computeSessionMetrics` in the report route**

In `src/server.ts`, add the import alongside the existing ones (line 9, after `import { qaStore } from './server/qa-store.js';`):

```ts
import { qaStore } from './server/qa-store.js';
import { computeSessionMetrics } from './server/report-metrics.js';
```

Replace the `/api/sessions/:code/report` handler (lines 888-914):

```ts
app.post('/api/sessions/:code/report', async (req, res) => {
  try {
    const code = getCode(req);
    const session = qaStore.getSession(code);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const questions = qaStore.getQuestions(code);
    const report = await generatePostSessionReport(
      session.title,
      session.contextData || '',
      questions
    );

    res.json({
      sessionTitle: session.title,
      generatedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      totalUpvotes: questions.reduce((acc, q) => acc + q.upvotes, 0),
      ...report,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Report generation failed';
    res.status(500).json({ error: msg });
  }
});
```

with:

```ts
app.post('/api/sessions/:code/report', async (req, res) => {
  try {
    const code = getCode(req);
    const session = qaStore.getSession(code);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const questions = qaStore.getQuestions(code);
    const report = await generatePostSessionReport(
      session.title,
      session.contextData || '',
      questions
    );
    const metrics = computeSessionMetrics(questions);

    res.json({
      sessionTitle: session.title,
      generatedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      totalUpvotes: questions.reduce((acc, q) => acc + q.upvotes, 0),
      ...report,
      ...metrics,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Report generation failed';
    res.status(500).json({ error: msg });
  }
});
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: builds with no TypeScript errors (this is the verification step — this task doesn't add its own test file since Task 2 already covers `computeSessionMetrics` in isolation and Task 5 covers the route's JSON shape end-to-end via Playwright).

- [ ] **Step 4: Commit**

```bash
git add src/app/models/qa.models.ts src/server.ts
git commit -m "feat: include deterministic session metrics in the report API response"
```

---

## Task 4: Show the new report data in the Executive Report UI

**Files:**
- Modify: `src/app/components/executive-report.ts:130-132`

**Interfaces:**
- Consumes: `PostSessionReport.aiCoverageRatio`, `.sentimentBreakdown`, `.topQuestions` (Task 3)
- Produces: visible "Session Metrics" card in the report

- [ ] **Step 1: Insert the Session Metrics card**

In `src/app/components/executive-report.ts`, insert a new block between the closing `</div>` of the "Executive Summary Callout" (line 130) and the `<!-- Thematic Clusters Grid -->` comment (line 132):

```html
          </div>

          <!-- Deterministic Session Metrics (not AI-generated — always accurate) -->
          @if (rep.aiCoverageRatio !== undefined || rep.sentimentBreakdown || rep.topQuestions) {
            <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-4">
              <div class="flex items-center gap-2 pb-3 border-b border-[#E0E2EC]">
                <mat-icon class="text-[#1A73E8] text-base">query_stats</mat-icon>
                <h3 class="font-display font-bold text-base text-[#1F1F1F]">Session Metrics</h3>
                <span class="text-[10px] font-semibold text-[#747775] uppercase tracking-wider">Computed directly from session data</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                @if (rep.aiCoverageRatio !== undefined) {
                  <div class="p-4 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC]">
                    <div class="flex items-center justify-between text-xs text-[#747775] mb-2">
                      <span class="font-semibold uppercase tracking-wider">AI Answer Coverage</span>
                      <mat-icon class="text-sm text-[#1A73E8]">auto_awesome</mat-icon>
                    </div>
                    <span class="font-display font-bold text-2xl text-[#1F1F1F]">{{ rep.aiCoverageRatio }}%</span>
                    <span class="text-xs text-[#747775]"> of questions received a synthesized answer</span>
                  </div>
                }

                @if (rep.sentimentBreakdown; as sb) {
                  <div class="p-4 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC]">
                    <div class="flex items-center justify-between text-xs text-[#747775] mb-2">
                      <span class="font-semibold uppercase tracking-wider">Audience Sentiment</span>
                      <mat-icon class="text-sm text-[#9334E6]">sentiment_satisfied_alt</mat-icon>
                    </div>
                    <div class="w-full h-2 bg-[#E0E2EC] rounded-full overflow-hidden flex mb-1.5">
                      <div class="bg-[#1E8E3E] h-full" [style.width.%]="sb.positivePct"></div>
                      <div class="bg-[#F9AB00] h-full" [style.width.%]="sb.neutralPct"></div>
                      <div class="bg-[#D93025] h-full" [style.width.%]="sb.criticalPct"></div>
                    </div>
                    <div class="flex items-center justify-between text-[10px] font-mono text-[#747775]">
                      <span class="text-[#137333]">{{ sb.positivePct }}% positive</span>
                      <span class="text-[#B06000]">{{ sb.neutralPct }}% neutral</span>
                      <span class="text-[#D93025]">{{ sb.criticalPct }}% critical</span>
                    </div>
                  </div>
                }
              </div>

              @if (rep.topQuestions && rep.topQuestions.length > 0) {
                <div class="pt-2 border-t border-[#E0E2EC]/70 space-y-1.5">
                  <span class="text-[10px] font-semibold text-[#747775] uppercase tracking-wider">Top Upvoted Questions</span>
                  @for (tq of rep.topQuestions; track tq.id) {
                    <div class="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#F8F9FA] border border-[#E0E2EC]/70 text-xs">
                      <span class="text-[#1F1F1F] truncate flex-1">"{{ tq.content }}" <span class="text-[#747775]">— {{ tq.authorName }}</span></span>
                      <span class="shrink-0 px-2 py-0.5 rounded-md bg-[#FEF7E0] text-[#B06000] font-mono font-bold flex items-center gap-1">
                        <mat-icon class="text-[11px]">thumb_up</mat-icon>{{ tq.upvotes }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>

          <!-- Thematic Clusters Grid -->
```

(Note: the original line 131 was a blank line and line 132 the `<!-- Thematic Clusters Grid -->` comment immediately preceding the themes `<div>` — this edit keeps that div intact, just adds the new card as a sibling before it.)

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: builds with no template errors (undefined `rep.aiCoverageRatio` etc. are valid since the fields are optional on `PostSessionReport`, already extended in Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/app/components/executive-report.ts
git commit -m "feat: show AI coverage, sentiment breakdown, and top questions in Executive Report"
```

---

## Task 5: Remove the fabricated Analytics sentiment fallback

**Files:**
- Modify: `src/app/components/word-cloud-analytics.ts:1073-1087` (computed signals)
- Modify: `src/app/components/word-cloud-analytics.ts:168-192` (KPI card template)

**Interfaces:**
- Consumes: nothing new
- Produces: `sentimentTone` computed signal (`'positive' | 'neutral' | 'critical' | 'pending'`)

- [ ] **Step 1: Replace the sentiment computed signals**

In `src/app/components/word-cloud-analytics.ts`, replace lines 1073-1087:

```ts
  public sentimentScore = computed(() => {
    return this.telemetry()?.sentimentPolarity ?? 0.45;
  });

  public sentimentFormatted = computed(() => {
    const s = this.sentimentScore();
    return (s > 0 ? '+' : '') + s.toFixed(2);
  });

  public sentimentLabel = computed(() => {
    const s = this.sentimentScore();
    if (s >= 0.2) return 'Positive';
    if (s <= -0.2) return 'Critical';
    return 'Neutral';
  });
```

with:

```ts
  public sentimentScore = computed(() => {
    return this.telemetry()?.sentimentPolarity ?? null;
  });

  public sentimentFormatted = computed(() => {
    const s = this.sentimentScore();
    if (s === null) return '—';
    return (s > 0 ? '+' : '') + s.toFixed(2);
  });

  public sentimentTone = computed<'positive' | 'neutral' | 'critical' | 'pending'>(() => {
    const s = this.sentimentScore();
    if (s === null) return 'pending';
    if (s >= 0.2) return 'positive';
    if (s <= -0.2) return 'critical';
    return 'neutral';
  });

  public sentimentLabel = computed(() => {
    switch (this.sentimentTone()) {
      case 'positive': return 'Positive';
      case 'critical': return 'Critical';
      case 'pending': return 'Awaiting data';
      default: return 'Neutral';
    }
  });
```

- [ ] **Step 2: Update the KPI card's class bindings to use `sentimentTone()`**

Replace the template block at lines 180-190:

```html
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-md"
              [class.bg-[#E6F4EA]]="sentimentScore() >= 0.2"
              [class.text-[#137333]]="sentimentScore() >= 0.2"
              [class.bg-[#FEF7E0]]="sentimentScore() < 0.2 && sentimentScore() >= -0.2"
              [class.text-[#B06000]]="sentimentScore() < 0.2 && sentimentScore() >= -0.2"
              [class.bg-[#FCE8E6]]="sentimentScore() < -0.2"
              [class.text-[#D93025]]="sentimentScore() < -0.2"
            >
              {{ sentimentLabel() }}
            </span>
```

with:

```html
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-md"
              [class.bg-[#E6F4EA]]="sentimentTone() === 'positive'"
              [class.text-[#137333]]="sentimentTone() === 'positive'"
              [class.bg-[#FEF7E0]]="sentimentTone() === 'neutral'"
              [class.text-[#B06000]]="sentimentTone() === 'neutral'"
              [class.bg-[#FCE8E6]]="sentimentTone() === 'critical'"
              [class.text-[#D93025]]="sentimentTone() === 'critical'"
              [class.bg-[#F1F3F4]]="sentimentTone() === 'pending'"
              [class.text-[#747775]]="sentimentTone() === 'pending'"
            >
              {{ sentimentLabel() }}
            </span>
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: no TypeScript errors (`sentimentScore()` is now `number | null` — confirm nothing else in this file compares it without going through `sentimentTone()`; the only other reader is the KPI card's numeric display via `sentimentFormatted()`, already null-safe).

- [ ] **Step 4: Commit**

```bash
git add src/app/components/word-cloud-analytics.ts
git commit -m "fix: stop showing a fabricated sentiment score before telemetry loads"
```

---

## Task 6: Fix the header nav overflow bug (the reported screenshot)

**Files:**
- Modify: `src/app/components/header.ts:59-172` (desktop nav)
- Modify: `src/app/components/header.ts:295-381` (mobile tab bar)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new for other tasks (purely a CSS robustness fix); Task 14 will further modify these same button elements to add `routerLink`

- [ ] **Step 1: Make the desktop nav container scroll instead of wrap**

In `src/app/components/header.ts`, replace line 59:

```html
              <nav class="hidden lg:flex items-center gap-1 bg-[#F1F3F4] p-1 rounded-xl text-sm font-medium border border-[#E0E2EC]">
```

with:

```html
              <nav class="hidden lg:flex items-center gap-1 bg-[#F1F3F4] p-1 rounded-xl text-sm font-medium border border-[#E0E2EC] overflow-x-auto scrollbar-none max-w-full">
```

- [ ] **Step 2: Prevent every desktop nav button label from wrapping**

Seven buttons in this file share the base class string `"px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"` (the moderation button has an extra `relative`). Add `whitespace-nowrap shrink-0` to each. Concretely:

- Line 64 (`#nav-tab-feed`): `class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"` → `class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"`
- Line 84 (`#nav-tab-series-control`): same replacement
- Line 103 (`#nav-tab-teleprompter`): same replacement
- Line 117 (`#nav-tab-analytics`): same replacement
- Line 132 (`#nav-tab-moderation`): `class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer relative"` → `class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer relative whitespace-nowrap shrink-0"`
- Line 149 (`#nav-tab-grounding`): same as the first replacement
- Line 164 (`#nav-tab-report`): same as the first replacement

Since the plain (non-moderation) class string is identical across 6 buttons, use a single `replace_all` edit for that string, then a separate edit for the moderation button's string.

- [ ] **Step 3: Make the mobile tab bar defensive too**

The mobile tab bar (lines 295-381) already has `overflow-x-auto` on its container (line 295) and `whitespace-nowrap` on every button, but not `shrink-0`. Add `shrink-0` to each of the 6 mobile button class strings (`#mob-tab-feed`, `#mob-tab-series-control`, `#mob-tab-teleprompter`, `#mob-tab-analytics`, `#mob-tab-moderation`, `#mob-tab-report`), e.g. line 300:

`class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1"` → `class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1 shrink-0"`

(all 6 mobile buttons share this exact string modulo the `id` — use `replace_all`.)

- [ ] **Step 4: Verify it builds and manually check the fix**

Run: `npm run build`, then `npm run dev` and open the app at a viewport between 1024px and 1280px wide as an organizer/admin (all 7 desktop tabs visible). Confirm "Live Feed" never wraps to two lines and nothing overlaps the logo — this is the direct regression check for the reported screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/header.ts
git commit -m "fix: prevent header nav tabs from wrapping and overlapping the logo"
```

---

## Task 7: SSR render-mode config for dynamic session routes

**Files:**
- Modify: `src/app/app.routes.server.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: SSR route config that Task 9's `app.routes.ts` routes will match against

- [ ] **Step 1: Replace the blanket prerender config**

Replace the full contents of `src/app/app.routes.server.ts`:

```ts
import {RenderMode, ServerRoute} from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
```

with:

```ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'session/:code/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'series/:code/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: builds successfully (this won't fully validate routing behavior yet since `app.routes.ts` doesn't have `session/:code` routes until Task 9 — the build should still succeed since `RenderMode.Client` paths don't need matching client routes to exist at SSR-config-build time).

- [ ] **Step 3: Commit**

```bash
git add src/app/app.routes.server.ts
git commit -m "fix: render session and series routes client-side instead of prerendering them"
```

---

## Task 8: Session resolver (loads session data on direct navigation/refresh)

**Files:**
- Create: `src/app/resolvers/session.resolver.ts`

**Interfaces:**
- Consumes: `QaService.currentSession`, `.currentSeries`, `.joinSession(code): Promise<boolean>` (all pre-existing, unchanged)
- Produces: `sessionResolver: ResolveFn<boolean | UrlTree>` (used by Task 10's `app.routes.ts`)

- [ ] **Step 1: Write the resolver**

Create `src/app/resolvers/session.resolver.ts`:

```ts
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn, Router, UrlTree } from '@angular/router';
import { QaService } from '../services/qa.service';

export const sessionResolver: ResolveFn<boolean | UrlTree> = async (route: ActivatedRouteSnapshot) => {
  const qaService = inject(QaService);
  const router = inject(Router);
  const code = (route.paramMap.get('code') || '').toUpperCase();

  if (!code) {
    return router.parseUrl('/');
  }

  const alreadyLoaded =
    qaService.currentSession()?.joinCode === code || qaService.currentSeries()?.joinCode === code;
  if (alreadyLoaded) {
    return true;
  }

  const success = await qaService.joinSession(code);
  return success ? true : router.parseUrl('/');
};
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: builds (the file isn't referenced by any route yet, so this only validates the file itself compiles — Task 10 wires it in and is where its behavior gets exercised).

- [ ] **Step 3: Commit**

```bash
git add src/app/resolvers/session.resolver.ts
git commit -m "feat: add session resolver for direct navigation and refresh"
```

---

## Task 9: Role guards for staff/admin-only tabs and the host studio

**Files:**
- Create: `src/app/guards/session.guards.ts`

**Interfaces:**
- Consumes: `QaService.isStaff()`, `.isAdmin()`; `FirebaseService.isOrganizerLoggedIn()` (all pre-existing, unchanged)
- Produces: `staffTabGuard`, `adminTabGuard`, `organizerGuard: CanActivateFn` (used by Task 10's `app.routes.ts`)

- [ ] **Step 1: Write the guards**

Create `src/app/guards/session.guards.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { QaService } from '../services/qa.service';
import { FirebaseService } from '../services/firebase.service';

function redirectToFeed(router: Router, state: RouterStateSnapshot): UrlTree {
  const segments = state.url.split('?')[0].split('/').filter(Boolean);
  const prefix = segments.slice(0, 2).join('/'); // e.g. 'session/ABC123'
  return router.parseUrl(`/${prefix}/feed`);
}

export const staffTabGuard: CanActivateFn = (_route, state) => {
  const qaService = inject(QaService);
  const router = inject(Router);
  return qaService.isStaff() ? true : redirectToFeed(router, state);
};

export const adminTabGuard: CanActivateFn = (_route, state) => {
  const qaService = inject(QaService);
  const router = inject(Router);
  return qaService.isAdmin() ? true : redirectToFeed(router, state);
};

export const organizerGuard: CanActivateFn = () => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);
  return firebaseService.isOrganizerLoggedIn() ? true : router.parseUrl('/auth');
};
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: builds (not yet wired into routes — Task 10 does that).

- [ ] **Step 3: Commit**

```bash
git add src/app/guards/session.guards.ts
git commit -m "feat: add role guards for staff/admin-only tabs and the host studio"
```

---

## Task 10: Define the real route tree

**Files:**
- Modify: `src/app/app.routes.ts`

**Interfaces:**
- Consumes: `sessionResolver` (Task 8), `staffTabGuard`/`adminTabGuard`/`organizerGuard` (Task 9), and the existing standalone components (`SessionJoin`, `AuthPage`, `HostStudio`, `QuestionFeed`, `SeriesControlRoom`, `Teleprompter`, `WordCloudAnalytics`, `ModerationQueue`, `GroundingContext`, `ExecutiveReport`)
- Produces: `routes: Routes` matching the spec's route table (§3) — consumed by `provideRouter(routes)` in `app.config.ts` (already wired, no change needed there) and by Task 13's `<router-outlet>`

- [ ] **Step 1: Replace `app.routes.ts`**

Replace the full contents of `src/app/app.routes.ts`:

```ts
import { Routes } from '@angular/router';
```

```ts
export const routes: Routes = [];
```

with:

```ts
import { Routes } from '@angular/router';
import { SessionJoin } from './components/session-join';
import { AuthPage } from './components/auth-page';
import { HostStudio } from './components/host-studio';
import { QuestionFeed } from './components/question-feed';
import { SeriesControlRoom } from './components/series-control-room';
import { Teleprompter } from './components/teleprompter';
import { WordCloudAnalytics } from './components/word-cloud-analytics';
import { ModerationQueue } from './components/moderation-queue';
import { GroundingContext } from './components/grounding-context';
import { ExecutiveReport } from './components/executive-report';
import { sessionResolver } from './resolvers/session.resolver';
import { staffTabGuard, adminTabGuard, organizerGuard } from './guards/session.guards';

const sessionChildRoutes: Routes = [
  { path: '', redirectTo: 'feed', pathMatch: 'full' },
  { path: 'feed', component: QuestionFeed },
  { path: 'run-of-show', component: SeriesControlRoom, canActivate: [staffTabGuard] },
  { path: 'teleprompter', component: Teleprompter, canActivate: [staffTabGuard] },
  { path: 'analytics', component: WordCloudAnalytics, canActivate: [staffTabGuard] },
  { path: 'moderation', component: ModerationQueue, canActivate: [adminTabGuard] },
  { path: 'grounding', component: GroundingContext, canActivate: [adminTabGuard] },
  { path: 'report', component: ExecutiveReport, canActivate: [staffTabGuard] },
];

export const routes: Routes = [
  { path: '', component: SessionJoin },
  { path: 'auth', component: AuthPage },
  { path: 'host', component: HostStudio, canActivate: [organizerGuard] },
  { path: 'session/:code', resolve: { sessionLoaded: sessionResolver }, children: sessionChildRoutes },
  { path: 'series/:code', resolve: { sessionLoaded: sessionResolver }, children: sessionChildRoutes },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: builds successfully — this is a meaningful check since it validates every import path and that `Routes`/`CanActivateFn`/`ResolveFn` types line up.

- [ ] **Step 3: Commit**

```bash
git add src/app/app.routes.ts
git commit -m "feat: define the real route tree for sessions, series, and top-level views"
```

---

## Task 11: Wire `QaService` to the router (bidirectional sync)

**Files:**
- Modify: `src/app/services/qa.service.ts:1-24` (imports, signal type)
- Modify: `src/app/services/qa.service.ts:73-121` (constructor, role-guard effect)
- Modify: `src/app/services/qa.service.ts:262-295` (`checkUrlForTokens`)
- Modify: `src/app/services/qa.service.ts:1048-1076` (`navigateToJoin`/`navigateToAuth`/`navigateToHostStudio`/`leaveSession`)

**Interfaces:**
- Consumes: `Router`, `NavigationEnd` from `@angular/router`; `filter` from `rxjs`
- Produces: `currentView`/`activeTab` signals now URL-derived; `router` becomes a private field other tasks don't need to touch directly (Task 14's header changes use `qaService.currentSeries()`/`currentSession()` the same way they always have, plus `[routerLink]`, not this service's internals)

- [ ] **Step 1: Add imports and the `ActiveTab` type**

In `src/app/services/qa.service.ts`, replace the import block (lines 1-18):

```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
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
```

with:

```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
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
  ActiveLiveRoomPreview,
} from '../models/qa.models';
import { FirebaseService } from './firebase.service';

export type ActiveTab =
  | 'feed' | 'lobby' | 'series-control' | 'teleprompter' | 'analytics'
  | 'moderation' | 'grounding' | 'report' | 'schedule';

const ROUTABLE_TABS: ActiveTab[] = [
  'feed', 'series-control', 'teleprompter', 'analytics', 'moderation', 'grounding', 'report',
];
```

- [ ] **Step 2: Inject `Router` and use the new type for `activeTab`**

Replace line 24 (`public firebaseService = inject(FirebaseService);`):

```ts
  public firebaseService = inject(FirebaseService);
```

with:

```ts
  public firebaseService = inject(FirebaseService);
  private router = inject(Router);
```

Replace the `activeTab` signal declaration (lines 76-78):

```ts
  public activeTab = signal<
    'feed' | 'lobby' | 'series-control' | 'teleprompter' | 'analytics' | 'moderation' | 'grounding' | 'report' | 'schedule'
  >('feed');
```

with:

```ts
  public activeTab = signal<ActiveTab>('feed');
```

- [ ] **Step 3: Add router sync and the state→URL bridging effect to the constructor**

Replace the constructor (lines 107-121):

```ts
  constructor() {
    this.initUserIdentity();
    this.checkUrlForTokens();
    this.loadHostedSessionHistory();
    this.fetchActiveLiveRoom();

    // Attendee access guard: attendees can only view the live feed
    effect(() => {
      const isStaffMember = this.isStaff();
      const currentTab = this.activeTab();
      if (!isStaffMember && currentTab !== 'feed') {
        this.activeTab.set('feed');
      }
    });
  }
```

with:

```ts
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
        const code = this.currentSession()?.joinCode || this.currentSeries()?.joinCode;
        if (code) {
          this.router.navigate([this.currentSeries() ? '/series' : '/session', code, 'feed']);
        } else {
          this.activeTab.set('feed');
        }
      }
    });

    // Push the URL forward to the canonical /session/:code or /series/:code form
    // whenever session state changes outside of a route navigation (join-by-code
    // form, host creating/re-entering a session, legacy ?code= auto-join).
    effect(() => {
      const session = this.currentSession();
      const series = this.currentSeries();
      const code = session?.joinCode || series?.joinCode;
      if (!code) return;

      const currentUrl = this.router.url.split('?')[0];
      const expectedPrefix = `/${series ? 'series' : 'session'}/${code}`;
      if (!currentUrl.startsWith(expectedPrefix)) {
        this.router.navigate([series ? '/series' : '/session', code, 'feed']);
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
        this.activeTab.set(segment as ActiveTab);
      }
    }
  }
```

- [ ] **Step 4: Stop the legacy auto-join from racing the resolver on canonical paths**

Replace the start of `checkUrlForTokens()` (lines 262-266):

```ts
  private checkUrlForTokens(): void {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
```

with:

```ts
  private checkUrlForTokens(): void {
    if (typeof window !== 'undefined' && window.location) {
      // /session/:code and /series/:code are handled by sessionResolver — skip
      // the legacy auto-join here to avoid a duplicate joinSession() call
      // racing the resolver's.
      if (/^\/(session|series)\/[A-Za-z0-9_-]+/i.test(window.location.pathname)) {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
          this.userAuthToken.set(urlToken);
          localStorage.setItem('live_qa_auth_token', urlToken);
        }
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
```

(This keeps token capture working even on a canonical path — e.g. someone shares `/session/ABC123?token=...` directly — while skipping the auto-`joinSession()` call, which the resolver now owns for that path shape.)

- [ ] **Step 5: Make the top-level navigation methods drive the router**

Replace lines 1048-1076:

```ts
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
    this.filterCategory.set('ALL');
    this.filterStatus.set('ALL');
    this.selectedSegmentFilter.set('ALL');
    this.searchQuery.set('');
    this.activeTab.set('feed');
    this.currentView.set('join');
  }
```

with:

```ts
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
    this.filterCategory.set('ALL');
    this.filterStatus.set('ALL');
    this.selectedSegmentFilter.set('ALL');
    this.searchQuery.set('');
    this.activeTab.set('feed');
    this.currentView.set('join');
    this.router.navigate(['/']);
  }
```

- [ ] **Step 6: Verify it builds**

Run: `npm run build`
Expected: builds successfully. This is the last purely-structural task before the router-outlet actually renders anything (Task 13), so full behavioral verification happens there and in Task 15's Playwright run.

- [ ] **Step 7: Commit**

```bash
git add src/app/services/qa.service.ts
git commit -m "feat: derive currentView/activeTab from the router and sync session state to the URL"
```

---

## Task 12: Convert header nav tabs to real links

**Files:**
- Modify: `src/app/components/header.ts:1-11` (imports)
- Modify: `src/app/components/header.ts:56-186` (desktop nav)
- Modify: `src/app/components/header.ts:293-382` (mobile tab bar)
- Modify: `src/app/components/header.ts:387-403` (component class)

**Interfaces:**
- Consumes: `qaService.currentSession()`, `.currentSeries()`, `.activeTab()` (all pre-existing)
- Produces: `Header.navBase`, `Header.navCode` computed signals (internal to this component, nothing else consumes them)

- [ ] **Step 1: Import `RouterLink` and add the base-path computed signals**

Replace the import block (lines 1-6):

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { VoiceService } from '../services/voice.service';
import { FirebaseService } from '../services/firebase.service';
```

with:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { VoiceService } from '../services/voice.service';
import { FirebaseService } from '../services/firebase.service';
```

Update the `imports` array (line 11):

```ts
  imports: [CommonModule, MatIconModule],
```

to:

```ts
  imports: [CommonModule, MatIconModule, RouterLink],
```

Add computed signals to the class body — insert right after `public isCodeCopied = signal<boolean>(false);` (line 391):

```ts
  public isCodeCopied = signal<boolean>(false);
  public navBase = computed(() => (this.qaService.currentSeries() ? '/series' : '/session'));
  public navCode = computed(() =>
    this.qaService.currentSession()?.joinCode || this.qaService.currentSeries()?.joinCode || ''
  );
```

- [ ] **Step 2: Convert the 7 desktop nav buttons to `<a [routerLink]>`**

For each of the 7 desktop nav buttons, change the opening tag from `<button ... type="button" (click)="qaService.activeTab.set('X')" ...>` to `<a ... [routerLink]="[navBase(), navCode(), 'X']" ...>`, and the closing `</button>` to `</a>`. All other attributes (`id`, `class`, the `[class.x]` bindings) stay exactly as they are after Task 6's CSS fix. Concretely:

`#nav-tab-feed` (was):
```html
                <button
                  id="nav-tab-feed"
                  type="button"
                  (click)="qaService.activeTab.set('feed')"
                  class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
```
becomes:
```html
                <a
                  id="nav-tab-feed"
                  [routerLink]="[navBase(), navCode(), 'feed']"
                  class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
```
(and its closing `</button>` → `</a>`)

`#nav-tab-series-control` → `[routerLink]="[navBase(), navCode(), 'run-of-show']"`
`#nav-tab-teleprompter` → `[routerLink]="[navBase(), navCode(), 'teleprompter']"`
`#nav-tab-analytics` → `[routerLink]="[navBase(), navCode(), 'analytics']"`
`#nav-tab-moderation` → `[routerLink]="[navBase(), navCode(), 'moderation']"`
`#nav-tab-grounding` → `[routerLink]="[navBase(), navCode(), 'grounding']"`
`#nav-tab-report` → `[routerLink]="[navBase(), navCode(), 'report']"`

Each follows the identical pattern: drop `type="button"` and `(click)="qaService.activeTab.set('X')"`, add `[routerLink]="[navBase(), navCode(), '<path-segment>']"`, change tag name `button`→`a` on both open and close tags. The `[class.bg-white]="qaService.activeTab() === 'X'"` etc. bindings are untouched — they still work because `activeTab` is now URL-derived (Task 11), and `app.html` still uses the pre-router `@switch(activeTab())` at this point (Task 13 replaces it), so the visible content already tracks the URL correctly through this task.

- [ ] **Step 3: Convert the 6 mobile tab bar buttons the same way**

Same transformation for `#mob-tab-feed` (→ `'feed'`), `#mob-tab-series-control` (→ `'run-of-show'`), `#mob-tab-teleprompter` (→ `'teleprompter'`), `#mob-tab-analytics` (→ `'analytics'`), `#mob-tab-moderation` (→ `'moderation'`), `#mob-tab-report` (→ `'report'`).

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: builds. Manually re-run the Task 6 viewport check (1024-1280px) and additionally click through each tab, confirming the URL bar updates, the active-tab highlight still tracks correctly, and the content area still switches correctly (it's still driven by `app.html`'s pre-router `@switch`, reading the now-URL-derived `activeTab` signal).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/header.ts
git commit -m "feat: make header nav tabs real links instead of click-only state changes"
```

---

## Task 13: Switch `app.html`/`app.ts` to `<router-outlet>`, fold the series-lobby banner into the feed

**Files:**
- Modify: `src/app/app.ts`
- Modify: `src/app/app.html:38-111`
- Modify: `src/app/components/question-feed.ts:1-12` (imports, template opening)

**Interfaces:**
- Consumes: `routes` (Task 10, via `provideRouter` already in `app.config.ts`); `SeriesLobby` component (pre-existing, `./series-lobby`, selector `app-series-lobby`); header nav now uses `[routerLink]` (Task 12), so this task doesn't need to touch `header.ts`
- Produces: working `<router-outlet>` rendering — this is the task where routing becomes visibly functional end-to-end

- [ ] **Step 1: Simplify `app.ts` — the view components are now wired through `app.routes.ts`, not imported directly**

Replace the full contents of `src/app/app.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Header } from './components/header';
import { SessionJoin } from './components/session-join';
import { AuthPage } from './components/auth-page';
import { HostStudio } from './components/host-studio';
import { QuestionFeed } from './components/question-feed';
import { WordCloudAnalytics } from './components/word-cloud-analytics';
import { Teleprompter } from './components/teleprompter';
import { ModerationQueue } from './components/moderation-queue';
import { GroundingContext } from './components/grounding-context';
import { ExecutiveReport } from './components/executive-report';
import { SeriesControlRoom } from './components/series-control-room';
import { SeriesLobby } from './components/series-lobby';
import { ShareModal } from './components/share-modal';
import { QaService } from './services/qa.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    MatIconModule,
    Header,
    SessionJoin,
    AuthPage,
    HostStudio,
    QuestionFeed,
    WordCloudAnalytics,
    Teleprompter,
    ModerationQueue,
    GroundingContext,
    ExecutiveReport,
    SeriesControlRoom,
    SeriesLobby,
    ShareModal,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  public qaService = inject(QaService);

  constructor() {
    if (typeof window !== 'undefined') {
      (window as unknown as { __QA_APP__: App; qaService: QaService }).__QA_APP__ = this;
      (window as unknown as { qaService: QaService }).qaService = this.qaService;
    }
  }
}
```

with:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Header } from './components/header';
import { ShareModal } from './components/share-modal';
import { QaService } from './services/qa.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [MatIconModule, RouterOutlet, Header, ShareModal],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  public qaService = inject(QaService);

  constructor() {
    if (typeof window !== 'undefined') {
      (window as unknown as { __QA_APP__: App; qaService: QaService }).__QA_APP__ = this;
      (window as unknown as { qaService: QaService }).qaService = this.qaService;
    }
  }
}
```

- [ ] **Step 2: Replace the manual `@switch` in `app.html` with `<router-outlet>`**

Replace lines 38-111 of `src/app/app.html` (the `<!-- Main View Router -->` comment through the closing `</main>`):

```html
  <!-- Main View Router -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
    @if (!qaService.currentSession() && !qaService.currentSeries()) {
      @switch (qaService.currentView()) {
        @case ('join') {
          <app-session-join />
        }
        @case ('auth') {
          <app-auth-page />
        }
        @case ('host-studio') {
          <app-host-studio />
        }
      }
    } @else {
      <!-- Series Workshop Banner on top of Feed and Control view -->
      @if (qaService.currentSeries() && qaService.activeTab() === 'feed') {
        <div class="mb-6">
          <app-series-lobby />
        </div>
      }

      @switch (qaService.activeTab()) {
        @case ('feed') {
          <app-question-feed />
        }
        @case ('series-control') {
          @if (qaService.isStaff()) {
            <app-series-control-room />
          } @else {
            <app-question-feed />
          }
        }
        @case ('analytics') {
          @if (qaService.isStaff()) {
            <app-word-cloud-analytics />
          } @else {
            <app-question-feed />
          }
        }
        @case ('teleprompter') {
          @if (qaService.isStaff()) {
            <app-teleprompter />
          } @else {
            <app-question-feed />
          }
        }
        @case ('moderation') {
          @if (qaService.isAdmin()) {
            <app-moderation-queue />
          } @else {
            <app-question-feed />
          }
        }
        @case ('grounding') {
          @if (qaService.isAdmin()) {
            <app-grounding-context />
          } @else {
            <app-question-feed />
          }
        }
        @case ('report') {
          @if (qaService.isStaff()) {
            <app-executive-report />
          } @else {
            <app-question-feed />
          }
        }
        @default {
          <app-question-feed />
        }
      }
    }
  </main>
```

with:

```html
  <!-- Main View Router -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <router-outlet />
  </main>
```

- [ ] **Step 3: Fold the series-lobby banner into the feed component**

In `src/app/components/question-feed.ts`, replace the import block and template opening (lines 1-13):

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { QuestionCard } from './question-card';

@Component({
  selector: 'app-question-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule, QuestionCard],
  template: `
    <div class="space-y-6">
      
      <!-- Live Spotlight Banner if a question is currently being answered -->
```

with:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { QuestionCard } from './question-card';
import { SeriesLobby } from './series-lobby';

@Component({
  selector: 'app-question-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule, QuestionCard, SeriesLobby],
  template: `
    <div class="space-y-6">

      <!-- Series Workshop Banner (only meaningful on the Feed tab, which is where this component lives) -->
      @if (qaService.currentSeries()) {
        <app-series-lobby />
      }

      <!-- Live Spotlight Banner if a question is currently being answered -->
```

- [ ] **Step 4: Verify it builds and renders**

Run: `npm run build`, then `npm run dev` and manually visit `/`, join or create a session, confirm the feed renders with the series banner (when applicable), and confirm clicking through `#nav-tab-*` still shows the right component (full click-through verification happens in Task 15's Playwright run, but a quick manual smoke test here catches anything obviously broken before layering more changes on top).

- [ ] **Step 5: Commit**

```bash
git add src/app/app.ts src/app/app.html src/app/components/question-feed.ts
git commit -m "feat: render views through router-outlet instead of a manual view switch"
```

---

## Task 14: Playwright coverage for deep links, back button, refresh, and legacy links

**Files:**
- Modify: `tests/playwright-suite.mjs` (insert new block after the existing Feature 13 block, before Feature 14)

**Interfaces:**
- Consumes: `hostPage`, `BASE_URL`, `KEYNOTE_CODE`, `recordPass`, `recordFail` (all pre-existing in this file's scope, established earlier in the same function)
- Produces: nothing consumed elsewhere — this is the terminal verification task for the routing work

- [ ] **Step 1: Insert the new test block**

In `tests/playwright-suite.mjs`, insert immediately after the Feature 13 block's closing `}` (after `recordFail('Feature 13: Executive Report', err);\n    }` — the line right before the `// FEATURE 14: Multi-Speaker Workshop Series & Run of Show` comment):

```js
    // ------------------------------------------------------------------------
    // FEATURE 13B: URL-Synced Navigation (Deep Links, Back Button, Refresh)
    // ------------------------------------------------------------------------
    console.log(`\n${c.bold}[Feature 13B] URL-Synced Navigation${c.reset}`);
    try {
      // Deep link straight to Analytics without clicking through tabs first
      await hostPage.goto(`${BASE_URL}/session/${KEYNOTE_CODE}/analytics`, { waitUntil: 'domcontentloaded' });
      await hostPage.waitForSelector('app-word-cloud-analytics', { timeout: 10000 });
      recordPass('Direct deep link to /session/:code/analytics renders the Analytics tab');

      // Deep link straight to the Executive Report
      await hostPage.goto(`${BASE_URL}/session/${KEYNOTE_CODE}/report`, { waitUntil: 'domcontentloaded' });
      await hostPage.waitForSelector('app-executive-report', { timeout: 10000 });
      recordPass('Direct deep link to /session/:code/report renders the Executive Report tab');

      // Browser back button steps back through tab history
      await hostPage.click('#nav-tab-feed');
      await hostPage.waitForSelector('app-question-feed', { timeout: 10000 });
      await hostPage.goBack();
      await hostPage.waitForSelector('app-executive-report', { timeout: 10000 });
      recordPass('Browser back button returns to the previous tab (Report)');

      // Refresh on a non-feed tab stays on that tab instead of dropping to Feed
      await hostPage.click('#nav-tab-analytics');
      await hostPage.waitForSelector('app-word-cloud-analytics', { timeout: 10000 });
      await hostPage.reload({ waitUntil: 'domcontentloaded' });
      await hostPage.waitForSelector('app-word-cloud-analytics', { timeout: 10000 });
      recordPass('Refreshing on the Analytics tab stays on Analytics (URL-synced state survives reload)');

      // Legacy ?code= link still lands in the session and upgrades the URL bar
      await hostPage.goto(`${BASE_URL}/?code=${KEYNOTE_CODE}`, { waitUntil: 'domcontentloaded' });
      await hostPage.waitForSelector('app-question-feed', { timeout: 15000 });
      const legacyUrl = hostPage.url();
      if (!legacyUrl.includes(`/session/${KEYNOTE_CODE}`)) {
        throw new Error(`Legacy ?code= link did not upgrade to canonical URL, got: ${legacyUrl}`);
      }
      recordPass('Legacy ?code= link still auto-joins and upgrades to the canonical /session/:code URL', legacyUrl);
    } catch (err) {
      recordFail('Feature 13B: URL-Synced Navigation', err);
    }

```

- [ ] **Step 2: Run the full suite**

Run: `npm run build && npm run serve:ssr:app &` (start the SSR server in the background), wait for it to log ready, then `npm run test:playwright`
Expected: all Feature blocks report PASS, including the new "Feature 13B" block. Stop the background server afterward.

- [ ] **Step 3: Commit**

```bash
git add tests/playwright-suite.mjs
git commit -m "test: add e2e coverage for deep links, back button, refresh, and legacy links"
```

---

## Task 15: Final verification pass

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: clean build, no TypeScript or template errors.

- [ ] **Step 2: Full Vitest suite**

Run: `npm run test`
Expected: all tests pass, including the new ones from Task 1 and Task 2.

- [ ] **Step 3: Full Playwright suite**

Run: `npm run build && npm run serve:ssr:app &`, wait for the server to be ready, then `npm run test:playwright`
Expected: all Features (1 through 16, plus the new 13B) report PASS. Stop the background server afterward.

- [ ] **Step 4: Manual header regression check**

Run: `npm run dev`, open the app as an organizer/admin in a session with a series active (so all 7 desktop tabs are present — Feed, Run of Show, Teleprompter, Analytics, Moderation, Grounding, Report), resize the browser window across the 1024px-1280px range. Confirm no tab label ever wraps to two lines and nothing overlaps the logo — this is the final regression check against the originally reported screenshot.

- [ ] **Step 5: Update memory / close out**

No code change — this step is a checkpoint, not a commit. If all four prior steps pass, the plan is complete.
