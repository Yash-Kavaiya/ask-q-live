import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { qaStore } from './server/qa-store.js';
import {
  translateContent,
  generatePostSessionReport,
} from './server/gemini.service.js';
import {
  requireAuth,
  resolveAuth,
  sanitizeSeriesForPublic,
  extractBearerToken,
} from './server/auth.js';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Helper to safely extract string params without index signature or array issues
function getCode(req: express.Request): string {
  const c = req.params['code'];
  return Array.isArray(c) ? c[0] : String(c || '');
}

function getParam(req: express.Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : String(val || '');
}

// JSON and URL-encoded body parsing for API endpoints (configured to 50mb for rich context data, slide exports, and transcripts)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware to gracefully handle oversized request entity errors
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    err &&
    typeof err === 'object' &&
    ('type' in err || 'name' in err) &&
    ((err as { type?: string }).type === 'entity.too.large' || (err as { name?: string }).name === 'PayloadTooLargeError')
  ) {
    res.status(413).json({
      error: 'Payload too large. The request body exceeds the maximum permitted size of 50MB.',
    });
    return;
  }
  next(err as Error);
});

/**
 * ============================================================================
 * ASKQLIVE LIVE Q&A PLATFORM REST API (PHASE P0 SPEC SECURED ROUTES)
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. Series Lifecycle & Public Views
// ----------------------------------------------------------------------------

// 1a. Create Series (Organizer - returns full Series including organizerToken)
app.post('/api/series', (req, res) => {
  try {
    const {
      title,
      description,
      contextData,
      seriesContextData,
      startDate,
      date,
      timezone,
      autoAdvance,
      customSeriesCode,
      customJoinCode,
      settings,
      segments,
    } = req.body;

    const series = qaStore.createSeries({
      title,
      description,
      contextData,
      seriesContextData,
      startDate,
      date,
      timezone,
      autoAdvance,
      customSeriesCode,
      customJoinCode,
      settings,
      segments,
    });
    res.status(201).json(series);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create series';
    res.status(500).json({ error: msg });
  }
});

// 1b. Get Series (PUBLIC: MUST NOT return organizerToken or any adminToken)
app.get('/api/series/:code', (req, res) => {
  const code = getCode(req);
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Session series not found' });
    return;
  }
  const participants = qaStore.getSeriesParticipants(code);
  const sanitized = sanitizeSeriesForPublic(series);
  res.json({
    series: sanitized,
    participantCount: Math.max(participants.length, 1),
  });
});

// 1c. Patch Series (Organizer only)
app.patch('/api/series/:code', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  const { title, description, contextData, seriesContextData, settings, state } = req.body;
  if (title) series.title = title;
  if (description !== undefined) series.description = description;
  if (contextData !== undefined) {
    series.contextData = contextData;
    series.seriesContextData = contextData;
  }
  if (seriesContextData !== undefined) {
    series.seriesContextData = seriesContextData;
    series.contextData = seriesContextData;
  }
  if (settings) {
    series.settings = { ...series.settings, ...settings };
  }
  if (state) {
    series.state = state;
  }
  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  qaStore.logAudit({
    seriesId: series.id,
    actorRole: 'organizer',
    actorRef: 'organizer',
    action: 'SERIES_UPDATED',
    targetId: series.id,
  });

  res.json({ success: true, series: sanitizeSeriesForPublic(series) });
});

// 1d. Join Series (Attendee entry point)
app.post('/api/series/:code/join', (req, res) => {
  const code = getCode(req);
  const { fingerprint, name } = req.body;
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Session series not found' });
    return;
  }
  const token = extractBearerToken(req);
  const auth = resolveAuth(qaStore, code, token);
  const participant = qaStore.registerSeriesParticipant(
    code,
    fingerprint || 'anon-attendee',
    name || 'Attendee'
  );
  const upvotedIds = fingerprint ? qaStore.getUserUpvotedIds(code, fingerprint) : [];
  const liveSegment = series.segments.find(s => s.id === series.liveSegmentId) || series.segments[0];

  res.json({
    series: sanitizeSeriesForPublic(series),
    liveSegment,
    role: auth.role,
    scope: auth.scope,
    participant,
    userUpvotedIds: upvotedIds,
  });
});

// 1e. Claim Role / Token Verification (Returns role and permitted scope)
app.post(['/api/series/:code/claim', '/api/series/:code/auth', '/api/sessions/:code/auth'], (req, res) => {
  const code = getCode(req);
  const token = extractBearerToken(req);
  const authInfo = resolveAuth(qaStore, code, token);
  res.json(authInfo);
});

// 1f. Update Series Grounding Context (Organizer)
app.post('/api/series/:code/grounding', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const { contextData } = req.body;
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  series.contextData = contextData || '';
  series.seriesContextData = contextData || '';
  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  qaStore.logAudit({
    seriesId: series.id,
    actorRole: 'organizer',
    actorRef: 'organizer',
    action: 'SERIES_GROUNDING_UPDATED',
    targetId: series.id,
  });

  res.json({ success: true, message: 'Series grounding updated successfully' });
});

// 1g. End Entire Series (Organizer)
app.post('/api/series/:code/end', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
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

  qaStore.logAudit({
    seriesId: series.id,
    actorRole: 'organizer',
    actorRef: 'organizer',
    action: 'SERIES_ENDED',
    targetId: series.id,
  });

  res.json({ success: true, series: sanitizeSeriesForPublic(series) });
});

// 1h. Duplicate Series (Organizer)
app.post('/api/series/:code/duplicate', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const source = qaStore.getSeries(code);
  if (!source) {
    res.status(404).json({ error: 'Source series not found' });
    return;
  }
  const cloned = qaStore.createSeries({
    title: `Copy of ${source.title}`,
    description: source.description,
    contextData: source.contextData,
    date: source.startDate,
    timezone: source.timezone,
    settings: source.settings,
    segments: source.segments
      .filter(s => s.id !== 'general')
      .map(s => ({
        title: s.title,
        speakerName: s.speakerName,
        speakerRole: s.speakerRole,
        speakerBio: s.speakerBio,
        speakerAvatar: s.speakerAvatar,
        talkTitle: s.talkTitle,
        type: s.type,
        durationMinutes: s.durationMinutes,
        groundingContext: s.groundingContext,
        categories: s.categories,
      })),
  });

  res.status(201).json(cloned);
});

// 1i. Export Series Data (Organizer)
app.get('/api/series/:code/export', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  const questions = qaStore.getQuestions(code);
  const audit = qaStore.getAuditLog(code);
  const participants = qaStore.getSeriesParticipants(code);

  res.json({
    series,
    questions,
    audit,
    participants,
    exportedAt: new Date().toISOString(),
  });
});

// 1j. Lightweight Polling / State Sync
app.get('/api/series/:code/state', (req, res) => {
  const code = getCode(req);
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  const questions = qaStore.getQuestions(code);
  res.json({
    seriesCode: series.seriesCode,
    state: series.state,
    liveSegmentId: series.liveSegmentId,
    revision: series.revision || 1,
    questionCount: questions.length,
    answeredCount: questions.filter(q => q.status === 'ANSWERED').length,
    updatedAt: series.updatedAt,
  });
});

// ----------------------------------------------------------------------------
// 2. Segment Lifecycle Operations (Organizer & Speaker Scoped)
// ----------------------------------------------------------------------------

// 2a. List Segments
app.get('/api/series/:code/segments', (req, res) => {
  const code = getCode(req);
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  const token = extractBearerToken(req);
  const auth = resolveAuth(qaStore, code, token);

  const segments = series.segments.map(seg => {
    // If organizer, or speaker of this segment, allow adminToken; otherwise strip it
    if (auth.role === 'organizer' || (auth.role === 'speaker' && auth.scope.includes(seg.id))) {
      return seg;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { adminToken, ...safe } = seg;
    return safe;
  });

  res.json({ segments });
});

// 2b. Add Segment (Organizer)
app.post('/api/series/:code/segments', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const token = extractBearerToken(req);
  const newSeg = qaStore.addSegment(code, req.body, token);
  if (!newSeg) {
    res.status(400).json({ error: 'Failed to add segment' });
    return;
  }
  res.status(201).json(newSeg);
});

// 2c. Patch Segment (Organizer OR assigned speaker)
app.patch('/api/series/:code/segments/:id', requireAuth(qaStore, ['organizer', 'speaker']), (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  const seg = series.segments.find(s => s.id === id);
  if (!seg) {
    res.status(404).json({ error: 'Segment not found' });
    return;
  }

  const { title, speakerName, speakerBio, speakerRole, speakerAvatar, groundingContext, contextData, categories, durationMinutes } = req.body;
  if (title) seg.title = title;
  if (speakerName) seg.speakerName = speakerName;
  if (speakerBio !== undefined) seg.speakerBio = speakerBio;
  if (speakerRole !== undefined) seg.speakerRole = speakerRole;
  if (speakerAvatar !== undefined) seg.speakerAvatar = speakerAvatar;
  if (groundingContext !== undefined) {
    seg.groundingContext = groundingContext;
    seg.contextData = groundingContext;
  }
  if (contextData !== undefined) {
    seg.contextData = contextData;
    seg.groundingContext = contextData;
  }
  if (categories && Array.isArray(categories)) seg.categories = categories;
  if (durationMinutes) {
    seg.durationMinutes = durationMinutes;
    seg.scheduledDurationMinutes = durationMinutes;
  }

  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  res.json({ success: true, segment: seg });
});

// 2d. Delete Segment (Organizer)
app.delete('/api/series/:code/segments/:id', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const result = qaStore.deleteSegment(code, id, token);
  if (!result.success) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});

// 2e. Reorder Segments (Organizer)
app.post('/api/series/:code/segments/reorder', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const token = extractBearerToken(req);
  const { segmentIds } = req.body;
  const result = qaStore.reorderSegments(code, segmentIds || [], token);
  if (!result.success) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});

// 2f. Start Segment (Organizer OR Speaker if allowed, enforcing Single-Live invariant)
app.post('/api/series/:code/segments/:id/start', (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const result = qaStore.startSegment(code, id, token);
  if (!result.success) {
    res.status(result.status || 403).json({ error: result.error || 'Failed to start segment' });
    return;
  }
  res.json(result);
});

// 2g. End Segment (Organizer OR Speaker)
app.post('/api/series/:code/segments/:id/end', (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const result = qaStore.endSegment(code, id, token);
  if (!result.success) {
    res.status(result.status || 403).json({ error: result.error || 'Failed to end segment' });
    return;
  }
  res.json(result);
});

// 2h. Pause / Resume Segment (Organizer)
app.post('/api/series/:code/segments/:id/pause', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const result = qaStore.pauseSegment(code, id, token);
  if (!result.success) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json(result);
});

// 2i. Skip Segment (Organizer)
app.post('/api/series/:code/segments/:id/skip', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const result = qaStore.skipSegment(code, id, token);
  if (!result.success) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json(result);
});

// 2j. Extend Segment (Organizer)
app.post('/api/series/:code/segments/:id/extend', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const { minutes } = req.body;
  const result = qaStore.extendSegment(code, id, Number(minutes) || 10, token);
  if (!result.success) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json(result);
});

// 2k. Update Segment Grounding (Organizer or Speaker)
app.post('/api/series/:code/segments/:id/grounding', requireAuth(qaStore, ['organizer', 'speaker']), (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const { groundingContext } = req.body;
  const series = qaStore.getSeries(code);
  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return;
  }
  const seg = series.segments.find(s => s.id === id);
  if (!seg) {
    res.status(404).json({ error: 'Segment not found' });
    return;
  }
  seg.groundingContext = groundingContext || '';
  seg.contextData = groundingContext || '';
  series.revision = (series.revision || 1) + 1;
  series.updatedAt = new Date().toISOString();

  res.json({ success: true, segment: seg });
});

// ----------------------------------------------------------------------------
// 3. Question Submission & Querying
// ----------------------------------------------------------------------------

// 3a. Submit Question (with automatic target resolution & rate limiting)
app.post(['/api/series/:code/questions', '/api/sessions/:code/questions'], async (req, res) => {
  try {
    const code = getCode(req);
    const { clientFingerprint, authorName, isAnonymous, content, category, segmentId } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Question content cannot be empty' });
      return;
    }

    const result = await qaStore.submitQuestion({
      joinCode: code,
      clientFingerprint: clientFingerprint || 'anon-client',
      authorName: authorName || 'Attendee',
      isAnonymous: !!isAnonymous,
      content: content.trim(),
      category: category || 'General',
      segmentId,
    });

    if (result.error) {
      res.status(429).json({ error: result.error });
      return;
    }

    if (result.deduplicatedWith) {
      res.json({
        deduplicated: true,
        message: 'Similar inquiry already active. Added your upvote to the primary question!',
        question: result.deduplicatedWith,
        resolvedSegmentId: result.resolvedSegmentId,
      });
      return;
    }

    res.status(201).json({
      deduplicated: false,
      question: result.question,
      resolvedSegmentId: result.resolvedSegmentId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit question';
    res.status(500).json({ error: msg });
  }
});

// 3b. Get Questions (Scoped by segment, status, search, or park status)
app.get(['/api/series/:code/questions', '/api/sessions/:code/questions'], (req, res) => {
  const code = getCode(req);
  const { status, search, category, fingerprint, segmentId, scope } = req.query as {
    status?: string;
    search?: string;
    category?: string;
    fingerprint?: string;
    segmentId?: string;
    scope?: 'segment' | 'series' | 'mine' | 'parked';
  };

  let questions = qaStore.getQuestions(code, segmentId);

  if (scope === 'parked') {
    questions = questions.filter(q => q.isParked);
  } else if (scope === 'mine' && fingerprint) {
    questions = questions.filter(q => q.clientFingerprint === fingerprint);
  }

  if (status && status !== 'ALL') {
    questions = questions.filter(q => q.status === status);
  }
  if (category && category !== 'ALL') {
    questions = questions.filter(q => q.category === category);
  }
  if (search && typeof search === 'string') {
    const qSearch = search.toLowerCase();
    questions = questions.filter(
      q =>
        q.content.toLowerCase().includes(qSearch) ||
        (q.authorName && q.authorName.toLowerCase().includes(qSearch)) ||
        (q.aiLine1 && q.aiLine1.toLowerCase().includes(qSearch))
    );
  }

  const userUpvotedIds = fingerprint
    ? qaStore.getUserUpvotedIds(code, fingerprint)
    : [];

  res.json({
    questions,
    userUpvotedIds,
  });
});

// 3c. Move Question Between Segments (Organizer or source Speaker)
app.post(['/api/series/:code/questions/:id/move', '/api/series/:code/questions/:id/move-segment'], (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const { targetSegmentId, toSegmentId } = req.body;
  const target = targetSegmentId || toSegmentId;
  const success = qaStore.moveQuestion(code, id, target, token);
  if (!success) {
    res.status(403).json({ error: 'Unauthorized or invalid segment target' });
    return;
  }
  res.json({ success: true });
});

// 3d. Bulk Move Questions (Organizer)
app.post('/api/series/:code/questions/bulk-move', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const token = extractBearerToken(req);
  const { questionIds, targetSegmentId } = req.body;
  const result = qaStore.bulkMoveQuestions(code, questionIds || [], targetSegmentId, token);
  res.json(result);
});

// 3e. Park / Unpark Question (Organizer or Speaker)
app.post('/api/series/:code/questions/:id/park', requireAuth(qaStore, ['organizer', 'speaker']), (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const token = extractBearerToken(req);
  const { isParked } = req.body;
  const success = qaStore.parkQuestion(code, id, isParked !== false, token);
  if (!success) {
    res.status(403).json({ error: 'Unauthorized or question not found' });
    return;
  }
  res.json({ success: true });
});

// 3f. Toggle Upvote
app.post(['/api/series/:code/questions/:id/upvote', '/api/sessions/:code/questions/:id/upvote'], (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const { clientFingerprint } = req.body;

  if (!clientFingerprint) {
    res.status(400).json({ error: 'clientFingerprint is required' });
    return;
  }

  const result = qaStore.toggleUpvote(code, id, clientFingerprint);
  if (!result) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }

  res.json(result);
});

// 3g. Request Grounded RAG AI Answer (Attendee or Presenter)
app.post(['/api/series/:code/questions/:id/rag-answer', '/api/sessions/:code/questions/:id/rag-answer'], async (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const result = await qaStore.generateQuestionRagAnswer(code, id);
  if (!result) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }
  res.json({ success: true, question: result });
});

// 3h. Update Question Status
app.patch(['/api/series/:code/questions/:id', '/api/sessions/:code/questions/:id'], (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const { status, content, clientFingerprint, isAdmin } = req.body;

  if (status) {
    const updated = qaStore.updateQuestionStatus(code, id, status);
    if (!updated) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }
    res.json(updated);
    return;
  }

  if (content && typeof content === 'string') {
    const updated = qaStore.editQuestionContent(id, clientFingerprint, content, !!isAdmin);
    if (!updated) {
      res.status(403).json({ error: 'Unauthorized to edit this question' });
      return;
    }
    res.json(updated);
    return;
  }

  res.status(400).json({ error: 'Invalid update payload' });
});

// 3h. Delete Question
app.delete(['/api/series/:code/questions/:id', '/api/sessions/:code/questions/:id'], (req, res) => {
  const code = getCode(req);
  const id = getParam(req, 'id');
  const { clientFingerprint, isAdmin } = req.body;

  const success = qaStore.deleteQuestion(code, id, clientFingerprint || '', !!isAdmin);
  if (!success) {
    res.status(403).json({ error: 'Unauthorized or question not found' });
    return;
  }
  res.json({ success: true });
});

// ----------------------------------------------------------------------------
// 4. Analytics, Telemetry, Reports, & Audit
// ----------------------------------------------------------------------------

// 4a. Telemetry (Series or Segment level)
app.get(['/api/series/:code/telemetry', '/api/sessions/:code/telemetry'], (req, res) => {
  const code = getCode(req);
  const segmentId = req.query['segmentId'] as string | undefined;
  const series = qaStore.getSeries(code);

  if (series && (!segmentId || segmentId === 'ALL')) {
    const seriesTelemetry = qaStore.getSeriesTelemetry(code);
    res.json(seriesTelemetry);
    return;
  }

  const telemetry = qaStore.getTelemetry(code, segmentId);
  res.json(telemetry);
});

// 4b. Word Cloud Tokens
app.get(['/api/series/:code/wordcloud', '/api/sessions/:code/wordcloud'], (req, res) => {
  const code = getCode(req);
  const segmentId = req.query['segmentId'] as string | undefined;
  const words = qaStore.getWordFrequencies(code, segmentId);
  res.json(words);
});

// 4c. Presenter Teleprompter Scoring Queue
app.get(['/api/series/:code/teleprompter', '/api/sessions/:code/teleprompter'], (req, res) => {
  const code = getCode(req);
  const segmentId = req.query['segmentId'] as string | undefined;
  const queue = qaStore.getTeleprompterQuestions(code, segmentId);
  res.json(queue);
});

// 4d. Series Executive Map-Reduce Report
app.get(['/api/series/:code/report', '/api/series/:code/executive-report'], async (req, res) => {
  try {
    const code = getCode(req);
    const report = await qaStore.getSeriesReport(code);
    if (!report) {
      res.status(404).json({ error: 'Series not found' });
      return;
    }
    res.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate series report';
    res.status(500).json({ error: msg });
  }
});

// 4e. Audit Log (Organizer)
app.get('/api/series/:code/audit', requireAuth(qaStore, ['organizer']), (req, res) => {
  const code = getCode(req);
  const audit = qaStore.getAuditLog(code);
  res.json({ audit });
});

// 4f. Participant Ban
app.post(['/api/series/:code/participants/:fingerprint/ban', '/api/sessions/:code/participants/:fingerprint/ban'], (req, res) => {
  const code = getCode(req);
  const fingerprint = getParam(req, 'fingerprint');
  const token = extractBearerToken(req);
  const { banned } = req.body;
  const success = qaStore.banParticipant(code, fingerprint, !!banned, token);
  res.json({ success });
});

// 4g. Real-time Multilingual Translation
app.post(['/api/series/:code/translate', '/api/sessions/:code/translate'], async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
      res.status(400).json({ error: 'text and targetLanguage are required' });
      return;
    }
    const translated = await translateContent(text, targetLanguage);
    res.json({ translatedText: translated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Translation failed';
    res.status(500).json({ error: msg });
  }
});

// 4h. Single Session Report (Legacy fallback)
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

// ----------------------------------------------------------------------------
// 5. Standalone Session Management (Backward Compatibility) & Live Room Discovery
// ----------------------------------------------------------------------------

app.get('/api/live-room', (req, res) => {
  try {
    const active = qaStore.getActiveLiveRoom();
    if (!active) {
      res.status(404).json({ error: 'No active live room found' });
      return;
    }
    if (active.series) {
      const series = active.series;
      const participants = qaStore.getSeriesParticipants(series.seriesCode);
      const activeSeg = series.segments.find(s => s.id === series.activeSegmentId) ||
                        series.segments.find(s => s.status === 'LIVE') ||
                        series.segments[0];
      res.json({
        type: 'series',
        joinCode: series.seriesCode,
        title: series.title,
        description: series.description,
        state: series.state,
        date: series.date,
        timezone: series.timezone,
        activeSpeaker: activeSeg?.speakerName || 'Keynote Speaker',
        activeSpeakerRole: activeSeg?.speakerRole || 'Presenter',
        activeTalk: activeSeg?.title || series.title,
        activeSegmentId: activeSeg?.id,
        participantCount: Math.max(participants.length, 24),
        categories: ['Gemini AI', 'Architecture', 'Performance', 'Grounding', 'General'],
        series: sanitizeSeriesForPublic(series),
      });
      return;
    }
    if (active.session) {
      const session = active.session;
      const participants = qaStore.getParticipants(session.joinCode);
      res.json({
        type: 'single',
        joinCode: session.joinCode,
        title: session.title,
        description: session.description,
        state: session.isActive ? 'LIVE' : 'SCHEDULED',
        activeSpeaker: session.speaker?.name || session.speakerName || 'Speaker',
        activeSpeakerRole: session.speaker?.title || 'Keynote',
        activeTalk: session.title,
        participantCount: Math.max(participants.length, 16),
        categories: session.categories || ['General'],
        session,
      });
      return;
    }
    res.status(404).json({ error: 'No active room available' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch live room';
    res.status(500).json({ error: msg });
  }
});

// 5b. Check Code Availability & Code Suggestion
app.get('/api/check-code/:code', (req, res) => {
  const code = getCode(req);
  const clean = code.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
  if (!clean || clean.length < 3) {
    res.json({ available: false, error: 'Code must be at least 3 characters', code: clean });
    return;
  }
  const available = qaStore.isCodeAvailable(clean);
  res.json({ available, code: clean });
});

app.get('/api/generate-code', (req, res) => {
  const prefix = typeof req.query['prefix'] === 'string' ? req.query['prefix'] : '';
  const code = qaStore.generateUniqueCode(prefix);
  res.json({ code });
});

app.get('/api/sessions/:code', (req, res) => {
  const code = getCode(req);
  let session = qaStore.getSession(code);
  const series = qaStore.getSeries(code);

  if (!session && !series) {
    const cleanCode = code.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    if (cleanCode && cleanCode.length >= 2 && cleanCode.length <= 16) {
      try {
        session = qaStore.createSession({
          customJoinCode: cleanCode,
          title: `Live Interactive Q&A Room #${cleanCode}`,
          description: `Audience interactive Q&A session for event room #${cleanCode}`,
          contextData: `Live Q&A session for event room #${cleanCode}. Ask questions, upvote popular topics, and receive grounded AI assistance.`,
          categories: ['General', 'Q&A', 'Community', 'Discussion'],
        });
      } catch {
        session = qaStore.getSession(cleanCode);
      }
    }
  }

  if (!session && !series) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const participants = qaStore.getParticipants(code);
  res.json({
    session,
    series: series ? sanitizeSeriesForPublic(series) : undefined,
    participantCount: participants.length,
  });
});

app.post('/api/sessions', (req, res) => {
  try {
    const { title, description, contextData, categories, settings, customJoinCode } = req.body;
    const session = qaStore.createSession({
      title,
      description,
      contextData,
      categories,
      settings,
      customJoinCode,
    });
    res.status(201).json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create session';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/sessions/:code/join', (req, res) => {
  const code = getCode(req);
  const { fingerprint, name } = req.body;
  let session = qaStore.getSession(code);
  const series = qaStore.getSeries(code);

  if (!session && !series) {
    const cleanCode = code.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
    if (cleanCode && cleanCode.length >= 2 && cleanCode.length <= 16) {
      try {
        session = qaStore.createSession({
          customJoinCode: cleanCode,
          title: `Live Interactive Q&A Room #${cleanCode}`,
          description: `Audience interactive Q&A session for event room #${cleanCode}`,
          contextData: `Live Q&A session for event room #${cleanCode}. Ask questions, upvote popular topics, and receive grounded AI assistance.`,
          categories: ['General', 'Q&A', 'Community', 'Discussion'],
        });
      } catch {
        session = qaStore.getSession(cleanCode);
      }
    }
  }

  if (!session && series) {
    session = qaStore.getSession(code);
  }

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const participant = qaStore.registerParticipant(code, fingerprint, name);
  if (series) {
    qaStore.registerSeriesParticipant(code, fingerprint, name);
  }
  res.json({
    session,
    participant,
    series: series ? sanitizeSeriesForPublic(series) : undefined,
  });
});

app.post('/api/sessions/:code/grounding', (req, res) => {
  const code = getCode(req);
  const { contextData } = req.body;
  const success = qaStore.updateGroundingContext(code, contextData || '');
  if (!success) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ success: true, message: 'Grounding context updated successfully' });
});

app.post('/api/sessions/:code/settings', (req, res) => {
  const code = getCode(req);
  const { settings } = req.body;
  const success = qaStore.updateSessionSettings(code, settings || {});
  if (!success) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ success: true, settings });
});

// Demo traffic simulation
app.post(['/api/series/:code/simulate-traffic', '/api/sessions/:code/simulate-traffic'], async (req, res) => {
  const code = getCode(req);
  const demoQuestions = [
    { text: 'Will this architecture support edge workers with sub-10ms response budgets?', cat: 'Architecture' },
    { text: 'How are vector embeddings indexed for instant semantic deduplication?', cat: 'Gemini AI' },
    { text: 'Can the teleprompter trigger custom Web Speech rate modulation on the fly?', cat: 'Performance' },
    { text: 'Are client fingerprints compliant with GDPR and enterprise privacy regulations?', cat: 'Security' },
    { text: 'What is the benchmark throughput for concurrent WebSocket message broadcasting?', cat: 'Telemetry' },
  ];

  const picked = demoQuestions[Math.floor(Math.random() * demoQuestions.length)];
  const names = ['Maya Chen', 'Liam O\'Connor', 'Fatima Al-Sayed', 'Kenji Sato', 'Zoe Martinez'];
  const name = names[Math.floor(Math.random() * names.length)];

  await qaStore.submitQuestion({
    joinCode: code,
    clientFingerprint: `sim-${Math.random().toString(36).substring(2, 7)}`,
    authorName: name,
    isAnonymous: Math.random() > 0.6,
    content: picked.text,
    category: picked.cat,
  });

  const questions = qaStore.getQuestions(code);
  if (questions.length > 0) {
    const targetQ = questions[Math.floor(Math.random() * questions.length)];
    targetQ.upvotes += Math.floor(1 + Math.random() * 3);
    targetQ.updatedAt = new Date().toISOString();
  }

  res.json({ success: true, message: 'Simulated audience activity generated' });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
