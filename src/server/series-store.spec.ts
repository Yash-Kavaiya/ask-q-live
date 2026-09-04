import { describe, it, expect, beforeEach } from 'vitest';
import { QaStore } from './qa-store.js';
import { timingSafeCompare, resolveAuth, sanitizeSeriesForPublic } from './auth.js';

describe('Phase P0: Series Data Model, Store, & Auth', () => {
  let store: QaStore;

  beforeEach(() => {
    store = new QaStore();
  });

  describe('1. Auth & Timing-Safe Comparison', () => {
    it('should correctly perform timing safe comparisons', () => {
      expect(timingSafeCompare('secret_token_123', 'secret_token_123')).toBe(true);
      expect(timingSafeCompare('secret_token_123', 'wrong_token')).toBe(false);
      expect(timingSafeCompare('', 'wrong_token')).toBe(false);
      expect(timingSafeCompare(undefined, 'secret')).toBe(false);
    });

    it('should resolve organizer role with universal scope', () => {
      const auth = resolveAuth(store, 'NEXT26', 'organizer_secret_next26');
      expect(auth.role).toBe('organizer');
      expect(auth.scope).toContain('*');
    });

    it('should resolve speaker role scoped to their specific segment', () => {
      const auth = resolveAuth(store, 'NEXT26', 'speaker_token_sundar');
      expect(auth.role).toBe('speaker');
      expect(auth.scope).toEqual(['seg-1']);
      expect(auth.segmentId).toBe('seg-1');
    });

    it('should default to attendee role for invalid or missing tokens', () => {
      const auth1 = resolveAuth(store, 'NEXT26', undefined);
      expect(auth1.role).toBe('attendee');
      expect(auth1.scope).toEqual([]);

      const auth2 = resolveAuth(store, 'NEXT26', 'bogus_token');
      expect(auth2.role).toBe('attendee');
    });

    it('should sanitize public series data stripping organizerToken and adminTokens', () => {
      const series = store.getSeries('NEXT26')!;
      expect(series.organizerToken).toBeTruthy();
      expect(series.segments[0].adminToken).toBeTruthy();

      const sanitized = sanitizeSeriesForPublic(series);
      expect((sanitized as unknown as { organizerToken?: string }).organizerToken).toBeUndefined();
      sanitized.segments.forEach(seg => {
        expect((seg as unknown as { adminToken?: string }).adminToken).toBeUndefined();
      });
    });
  });

  describe('2. Series Creation & Segment Backing Sessions', () => {
    it('should create a series with unambiguous code and implicit general lobby', () => {
      const created = store.createSeries({
        title: 'Cloud Summit 2026',
        description: 'Multi-track developer event',
        segments: [
          { title: 'Intro Keynote', speakerName: 'Jane Doe', type: 'TALK' },
          { title: 'AI Scaling', speakerName: 'John Smith', type: 'TALK' },
        ],
      });

      expect(created.seriesCode).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/);
      expect(created.organizerToken).toMatch(/^org_/);
      expect(created.segments.length).toBe(3); // General lobby + 2 segments
      expect(created.segments[0].id).toBe('general');
      expect(created.segments[0].type).toBe('LOBBY');

      // Check backing session created
      const backingSession1 = store.getSession(`${created.seriesCode}-S1`);
      expect(backingSession1).toBeDefined();
      expect(backingSession1?.title).toBe('Intro Keynote');
    });

    it('should add a segment and increment series revision', () => {
      const series = store.getSeries('NEXT26')!;
      const initialRev = series.revision || 1;
      const initialCount = series.segments.length;

      const newSeg = store.addSegment('NEXT26', {
        title: 'New Lightning Talk',
        speakerName: 'Dr. Neo',
        type: 'TALK',
        durationMinutes: 20,
      }, 'organizer_secret_next26');

      expect(newSeg).toBeDefined();
      expect(series.segments.length).toBe(initialCount + 1);
      expect(series.revision).toBe(initialRev + 1);

      const audit = store.getAuditLog('NEXT26');
      expect(audit.some(a => a.action === 'SEGMENT_ADDED')).toBe(true);
    });
  });

  describe('3. Single-Live Invariant & Segment State Transitions', () => {
    it('should atomically transition a segment to LIVE and end previously LIVE segment', () => {
      // Initially seg-1 is LIVE
      const initialSeries = store.getSeries('NEXT26')!;
      expect(initialSeries.liveSegmentId).toBe('seg-1');
      expect(initialSeries.segments.find(s => s.id === 'seg-1')?.state).toBe('LIVE');

      // Start seg-2
      const res = store.startSegment('NEXT26', 'seg-2', 'organizer_secret_next26');
      expect(res.success).toBe(true);

      const updatedSeries = store.getSeries('NEXT26')!;
      expect(updatedSeries.liveSegmentId).toBe('seg-2');

      const seg1 = updatedSeries.segments.find(s => s.id === 'seg-1')!;
      const seg2 = updatedSeries.segments.find(s => s.id === 'seg-2')!;

      expect(seg1.state).toBe('ENDED');
      expect(seg1.actualEnd).toBeDefined();
      expect(seg2.state).toBe('LIVE');
      expect(seg2.actualStart).toBeDefined();
    });

    it('should reject illegal state transitions like starting an ENDED segment', () => {
      // End seg-1
      store.endSegment('NEXT26', 'seg-1', 'organizer_secret_next26');
      const seg1 = store.getSeries('NEXT26')!.segments.find(s => s.id === 'seg-1')!;
      expect(seg1.state).toBe('ENDED');

      // Attempt to start seg-1 again
      const startRes = store.startSegment('NEXT26', 'seg-1', 'organizer_secret_next26');
      expect(startRes.success).toBe(false);
      expect(startRes.status).toBe(409);
    });

    it('should allow pausing and resuming a live segment', () => {
      const pauseRes = store.pauseSegment('NEXT26', 'seg-1', 'organizer_secret_next26');
      expect(pauseRes.success).toBe(true);
      expect(store.getSeries('NEXT26')!.segments.find(s => s.id === 'seg-1')?.state).toBe('PAUSED');

      const resumeRes = store.pauseSegment('NEXT26', 'seg-1', 'organizer_secret_next26');
      expect(resumeRes.success).toBe(true);
      expect(store.getSeries('NEXT26')!.segments.find(s => s.id === 'seg-1')?.state).toBe('LIVE');
    });

    it('should allow skipping a scheduled segment', () => {
      const skipRes = store.skipSegment('NEXT26', 'seg-2', 'organizer_secret_next26');
      expect(skipRes.success).toBe(true);
      expect(store.getSeries('NEXT26')!.segments.find(s => s.id === 'seg-2')?.state).toBe('SKIPPED');
    });

    it('should extend segment and cascade schedule shift to subsequent segments', () => {
      const seg2StartBefore = store.getSeries('NEXT26')!.segments.find(s => s.id === 'seg-2')!.scheduledStart!;
      const beforeTime = new Date(seg2StartBefore).getTime();

      store.extendSegment('NEXT26', 'seg-1', 15, 'organizer_secret_next26');

      const seg2StartAfter = store.getSeries('NEXT26')!.segments.find(s => s.id === 'seg-2')!.scheduledStart!;
      const afterTime = new Date(seg2StartAfter).getTime();

      expect(afterTime - beforeTime).toBe(15 * 60 * 1000);
    });

    it('should reject deleting a segment that holds questions (FR-B5)', () => {
      // seg-1 has demo questions seeded
      const delRes = store.deleteSegment('NEXT26', 'seg-1', 'organizer_secret_next26');
      expect(delRes.success).toBe(false);
      expect(delRes.status).toBe(409);
    });
  });

  describe('4. Question Target Resolution (FR-D2 / FR-D3)', () => {
    it('should target explicit segment if accepting questions', () => {
      const target = store.resolveQuestionTarget('NEXT26', 'seg-2'); // seg-2 is SCHEDULED and pre-submit is allowed
      expect(target.targetSegmentId).toBe('seg-2');
      expect(target.targetedExplicitly).toBe(true);
    });

    it('should target current LIVE segment if no explicit target provided', () => {
      const target = store.resolveQuestionTarget('NEXT26');
      expect(target.targetSegmentId).toBe('seg-1');
      expect(target.targetedExplicitly).toBe(false);
    });

    it('should target recently ended segment inside its grace window', () => {
      // End seg-1 now (graceWindow is 10 mins)
      store.endSegment('NEXT26', 'seg-1', 'organizer_secret_next26');
      // liveSegmentId is now 'general'
      const target = store.resolveQuestionTarget('NEXT26');
      // Should route to seg-1 within grace window
      expect(target.targetSegmentId).toBe('seg-1');
    });
  });

  describe('5. Question Move, Park, & Upvote Preservation (FR-D6)', () => {
    it('should move question between segments while preserving upvotes and appending audit trail', () => {
      const q = store.getQuestions('NEXT26').find(item => item.id === 'q-demo-1')!;
      const initialUpvotes = q.upvotes;
      expect(q.segmentId).toBe('seg-1');

      const moveSuccess = store.moveQuestion('NEXT26', 'q-demo-1', 'seg-6', 'organizer_secret_next26');
      expect(moveSuccess).toBe(true);

      const movedQ = store.getQuestions('NEXT26').find(item => item.id === 'q-demo-1')!;
      expect(movedQ.segmentId).toBe('seg-6');
      expect(movedQ.upvotes).toBe(initialUpvotes);
      expect(movedQ.movedFrom).toBeDefined();
      expect(movedQ.movedFrom?.length).toBe(1);
      expect(movedQ.movedFrom?.[0].segmentId).toBe('seg-1');
    });

    it('should park and unpark questions', () => {
      store.parkQuestion('NEXT26', 'q-demo-2', true, 'organizer_secret_next26');
      const q = store.getQuestions('NEXT26').find(item => item.id === 'q-demo-2')!;
      expect(q.isParked).toBe(true);

      store.parkQuestion('NEXT26', 'q-demo-2', false, 'organizer_secret_next26');
      expect(q.isParked).toBe(false);
    });
  });

  describe('6. Rate Limiting & Participant Tracking', () => {
    it('should enforce per-segment velocity limit and prune timestamps', async () => {
      const fp = 'speedy-tester-' + Math.random().toString(36).substring(2, 6);

      // Submit 5 questions rapidly
      for (let i = 0; i < 5; i++) {
        const res = await store.submitQuestion({
          joinCode: 'NEXT26',
          clientFingerprint: fp,
          authorName: 'Speedy Tester',
          isAnonymous: false,
          content: `Test inquiry number ${i + 1} regarding AI scaling architectures`,
          segmentId: 'seg-1',
        });
        expect(res.error).toBeUndefined();
      }

      // 6th question should be rate limited
      const sixth = await store.submitQuestion({
        joinCode: 'NEXT26',
        clientFingerprint: fp,
        authorName: 'Speedy Tester',
        isAnonymous: false,
        content: `Exceeding velocity limit inquiry`,
        segmentId: 'seg-1',
      });
      expect(sixth.error).toBeDefined();
      expect(sixth.error).toContain('velocity limit reached');
    });

    it('should track series-wide participant registration and bans', () => {
      const fp = 'user-fp-99';
      const part = store.registerSeriesParticipant('NEXT26', fp, 'Test Attendee');
      expect(part.name).toBe('Test Attendee');
      expect(part.isBanned).toBe(false);

      store.banParticipant('NEXT26', fp, true, 'organizer_secret_next26');
      expect(store.isParticipantBanned('NEXT26', fp)).toBe(true);
    });
  });
});
