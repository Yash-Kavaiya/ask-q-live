# URL-Synced Navigation, Header Layout Fix & Executive Report Accuracy

Date: 2026-09-17
Status: Approved for planning

## 1. Problem

Reviewing the app ahead of a SaaS launch surfaced four related issues:

1. **Header navigation renders broken on real screens.** The desktop nav
   (`src/app/components/header.ts:59-173`) packs up to 7 tabs into a
   `hidden lg:flex` bar with no `whitespace-nowrap` and no overflow
   handling. On real laptop widths, "Live Feed" wraps to two lines, which
   makes that button taller than the header's fixed `h-16` row, so it
   visually pops out and overlaps the logo (reported via screenshot).
2. **There is no real navigation.** `app.routes.ts` is empty and
   `app.html` renders every screen via a manual `@switch` on
   `qaService.currentView()` / `qaService.activeTab()`. There are no
   URLs per view: no deep link to Analytics or the Report tab, no
   working browser back/forward inside a session, and refreshing while
   on a non-default tab silently drops you back to Feed.
3. **The Post-Session Executive Report shows fabricated data.** The UI
   (`executive-report.ts:119`) renders `rep.executiveSummary`, but the
   single-session generator `generatePostSessionReport()`
   (`src/server/gemini.service.ts:899-927`) never asks Gemini for that
   field and never includes it in its schema or fallback object. The
   field is always `undefined`, so the UI always falls back to a
   generic hardcoded sentence — never real session content. The report
   is also thin: a fixed "exactly 3 themes / exactly 5 follow-ups" AI
   narrative with no deterministic metrics pulled from the session's
   actual data.
4. **Analytics has one dishonest fallback.** `word-cloud-analytics.ts:1074`
   defaults sentiment to a hardcoded `0.45` before telemetry has loaded,
   which briefly displays a plausible-looking but fake number instead of
   a loading/empty state.

## 2. Goals

- Every major screen and in-session tab has a real, shareable,
  bookmarkable URL, with working browser back/forward.
- Already-distributed QR codes / share links (`{origin}/?code=ABC123`)
  keep working unchanged.
- The header nav never visually breaks, at any viewport width or tab
  count.
- The Executive Report's executive summary is always real,
  session-specific content (AI-generated from that session's actual
  questions), never a canned fallback sentence, and includes
  deterministic metrics computed directly from stored data (not just AI
  narrative).
- Analytics never displays a fabricated number; it shows a genuine
  loading/empty state until real telemetry arrives.

## Non-goals

- No change to the AI provider, prompt engineering strategy beyond the
  fields described below, or the moderation/telemetry pipelines.
- No change to Firestore data model or auth/token scheme.
- No redesign of visual style — this is layout/structure/correctness,
  not a re-skin.
- No SEO work beyond what falls out naturally from giving public routes
  (`/`, `/auth`, `/host`) their own paths.

## 3. Route Table

Real Angular Router routes, added to `src/app/app.routes.ts`:

| Path | Renders | Notes |
|---|---|---|
| `/` | Join screen | Also the legacy-link landing target |
| `/auth` | Host/staff sign-in | |
| `/host` | Host studio dashboard | Requires `firebaseService.isOrganizerLoggedIn()`; falls back to `/auth` otherwise (same behavior as today's button gating) |
| `/session/:code` | redirects to `/session/:code/feed` | |
| `/session/:code/feed` | Question feed | |
| `/session/:code/run-of-show` | Series control room / feed fallback | kept for single sessions too, matches existing `series-control` tab |
| `/session/:code/teleprompter` | Teleprompter | staff-only render, see §5 |
| `/session/:code/analytics` | Word cloud analytics | staff-only render |
| `/session/:code/moderation` | Moderation queue | admin-only render |
| `/session/:code/grounding` | Grounding context | admin-only render |
| `/session/:code/report` | Executive report | staff-only render |
| `/series/:code` | redirects to `/series/:code/feed` | |
| `/series/:code/feed`, `/series/:code/run-of-show`, ... | same child set as `/session/:code/*` | series vs. session is resolved by which signal (`currentSeries`/`currentSession`) the join API populates, exactly as today |

`:code` is the existing join code (2-16 chars, `[A-Za-z0-9_-]`), matched
with the same regex already used by `extractUrlCode()`.

Tab path segments map 1:1 to today's `activeTab` values (`feed`,
`series-control` → `run-of-show`, `teleprompter`, `analytics`,
`moderation`, `grounding`, `report`). `lobby` and `schedule` stay
internal states, not routed (they're not reachable via the nav bar
today).

## 4. Architecture

### 4.1 URL becomes the source of truth for navigation

- `app.routes.ts` gets real `Routes` entries per the table above, each
  session/series child route mapped to the matching existing standalone
  component (`QuestionFeed`, `WordCloudAnalytics`, etc.) — the same
  components used today, unchanged internally.
- `app.html`'s manual `@switch` on `currentView`/`activeTab` is replaced
  by `<router-outlet>`. The router becomes responsible for what's on
  screen; `QaService` stops being a view switcher and goes back to being
  pure session/data state.
- A new lightweight `SessionShellComponent` wraps the session child
  routes (it currently corresponds to the `@else` branch of `app.html`'s
  switch — the series lobby banner + role-gated tab rendering). It reads
  `:code` from the route, and:
  - If `qaService.currentSession()?.joinCode !== code` (e.g. direct
    load, refresh, or someone pasted a link to a different session), it
    calls the existing `qaService.joinSession(code)` before rendering
    children. This reuses the exact join flow used today — no new
    session-loading code path.
  - Renders the series-lobby banner and role-gated tab content exactly
    as `app.html` does today (staff-only components fall back to
    `<app-question-feed>` for non-staff — unchanged behavior).
- `Header`'s nav buttons change from `(click)="qaService.activeTab.set('analytics')"`
  to `[routerLink]="['/session', code, 'analytics']"` (resolved against
  whichever of `currentSession`/`currentSeries` is active). Active-tab
  styling switches from comparing `qaService.activeTab()` to
  `routerLinkActive`.
- `qaService.activeTab` signal is kept (a lot of other code reads it —
  e.g. `filteredQuestions()` checks `activeTab() === 'moderation'`) but
  it becomes **derived from the route**, not user-set: the
  `SessionShellComponent` sets it from the matched child route's data in
  an effect, instead of nav buttons setting it directly.

### 4.2 Role-gated tabs stay soft, but the URL stays honest to intent

Today, a non-staff attendee who ends up with `activeTab === 'moderation'`
silently sees the Feed instead (existing guard effect in
`qa.service.ts:114-120`). That effect is kept as-is for defense in depth,
but is extended to also call `router.navigate(['/session', code, 'feed'])`
when it fires, so the URL bar matches what's actually rendered instead of
lying about being on `/moderation`.

### 4.3 Legacy link compatibility

The root route `/` keeps reading `?code=` / `?room=` / `?join=` /
`?session=` / `?token=` exactly as `extractUrlCode()` / `checkUrlForTokens()`
do today (that logic is untouched). Once a code is detected there, instead
of just calling `joinSession()` in place, it additionally does
`router.navigate(['/session', code, 'feed'], { queryParamsHandling: '' })`
so the URL bar upgrades to the new canonical form. The `/?code=` form
keeps working forever — this is additive, not a breaking migration.

### 4.4 SSR route rendering mode

`app.routes.server.ts` currently prerenders `**` (everything) at build
time, which cannot work for dynamic session codes. It changes to:

```ts
export const serverRoutes: ServerRoute[] = [
  { path: 'session/:code/**', renderMode: RenderMode.Client },
  { path: 'series/:code/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
```

Session/series routes are live, private, per-viewer data with no SEO
value, so they render client-side only (same effective behavior as
today's SPA rendering of the session view). `/`, `/auth`, `/host` keep
prerendering for fast first paint. Express's existing catch-all
(`server.ts:1153`, `angularApp.handle(req)`) needs no changes — it
already delegates all non-static routes to the Angular SSR engine, which
will honor the new per-route render modes.

## 5. Header Nav Layout Fix

Independent of the routing change, applied to both the desktop
(`hidden lg:flex`) and mobile tab bars in `header.ts`:

- Add `whitespace-nowrap shrink-0` to every nav button so a label can
  never wrap to a second line.
- Add `overflow-x-auto` (with `scrollbar-none`, matching the mobile bar's
  existing pattern) to the desktop `<nav>` container as a safety net for
  narrow `lg` widths or accounts with every optional tab visible
  (organizer with series-control + teleprompter + analytics +
  moderation + grounding + report all present at once).
- No visual redesign — same tabs, same icons, same order — just making
  the container robust so it can't overlap adjacent header content at
  any width.

## 6. Executive Report Correctness & Depth

### 6.1 Real executive summary (bug fix)

`generatePostSessionReport()` in `gemini.service.ts` gets `executiveSummary`
added:
- to the prompt ("2-3 sentence executive summary of this specific
  session's engagement and themes"),
- to the `responseSchema` (required string field),
- to the `fallback` object (a generic-but-labeled sentence, same
  fallback-on-AI-failure pattern already used elsewhere in this file).

This mirrors exactly what `generateSeriesExecutiveReport()` already does
correctly — same shape of fix, no new pattern introduced.

### 6.2 More detail, sourced from real data

The report gains a deterministic metrics block computed directly from
stored question data (not AI-authored, so it can never hallucinate),
assembled in the `/api/sessions/:code/report` handler
(`server.ts:888-914`) alongside the existing AI-generated fields:

- Total questions, total upvotes (already present)
- AI answer coverage: `answered / total` (same calc already used in
  `word-cloud-analytics.ts:1093-1101`, moved server-side so it's part of
  the persisted/exported report, not just a live-session-only UI stat)
- Sentiment breakdown: count/percent positive vs. neutral vs. critical
  (same thresholds as `word-cloud-analytics.ts`: `>= 0.2` positive,
  `<= -0.2` critical)
- Top 5 upvoted questions (content + author + upvotes), for the speaker
  to see verbatim what resonated most
- `PostSessionReport` model (`qa.models.ts:286-299`) gains matching
  optional fields: `aiCoverageRatio`, `sentimentBreakdown`,
  `topQuestions`. Executive Report UI adds a small "Session Metrics"
  card rendering these alongside the existing themes/follow-ups sections.

## 7. Analytics Fallback Honesty

`word-cloud-analytics.ts:1073-1075`:

```ts
public sentimentScore = computed(() => {
  return this.telemetry()?.sentimentPolarity ?? 0.45;
});
```

changes to distinguish "no data yet" from "zero/neutral sentiment":
`sentimentScore` returns `null` when `telemetry()` is `null`, and the
KPI card renders a muted "—" / "Awaiting data" state instead of a
formatted number until the first real telemetry poll lands. No more
plausible-looking fake `0.45`.

## 8. Error Handling

- Invalid/unknown `:code` in `/session/:code/*`: `joinSession()` already
  returns `false` and sets `qaService.errorMessage` on a 404 from
  `/api/sessions/:code/join` — `SessionShellComponent` shows the existing
  error toast and redirects to `/` (mirrors today's failed-join UX).
- Direct navigation to a role-gated tab path as a non-staff/non-admin
  user: handled by the existing guard effect (§4.2) — renders Feed,
  corrects the URL.
- Report generation failure: unchanged — `generatePostSessionReport()`
  in `qa.service.ts` already catches and surfaces `errorMessage`; the
  new `executiveSummary`/metrics fields degrade to the labeled fallback
  object on Gemini failure, same as every other field in that response.

## 9. Testing

- Existing `tests/playwright-suite.mjs` navigates via `?code=&token=`
  query links and clicks `#nav-tab-*` buttons by ID — both keep working
  unchanged (§4.3, and nav button IDs are untouched, only their click
  handler becomes a `routerLink`). No existing assertions reference
  `currentView`/`activeTab` directly, so no test rewrites are required
  for routing to land safely.
- New Playwright coverage to add: direct navigation to
  `/session/:code/analytics` and `/session/:code/report` (deep link
  works without clicking through tabs first), browser back button after
  switching tabs lands on the previous tab, refresh on a non-feed tab
  stays on that tab instead of dropping to Feed.
- `series-store.spec.ts` (Vitest) gets new cases asserting
  `generatePostSessionReport()`'s response always includes a non-empty
  `executiveSummary`, `aiCoverageRatio`, `sentimentBreakdown`, and
  `topQuestions`, both on the AI-success path and the fallback path.
- Manual check: the header nav at `lg` breakpoint width (1024px–1280px)
  with every optional tab visible (organizer/admin viewing a series),
  confirming no wrap/overlap — this is the regression check for the
  originally reported screenshot.

## 10. Rollout

Single PR, no feature flag needed — every change here is additive or a
correctness fix with no behavior change for users who only ever use
today's `?code=` links and tab clicks. Ship as one change; verify with
the manual header check and the new Playwright cases before merge.
