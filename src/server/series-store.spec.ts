import { describe, it, expect, beforeEach } from 'vitest';
import { QaStore } from './qa-store.js';
import { timingSafeCompare, resolveAuth, sanitizeSeriesForPublic } from './auth.js';
import { generateTwoLineAnswer, chunkTextForRag, cosineSimilarity, performEmbeddingRag, generatePostSessionReport } from './gemini.service.js';

describe('Phase P0: Series Data Model, Store, & Auth', () => {
  let store: QaStore;

  beforeEach(() => {
    store = new QaStore(true);
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
    }, 30000);

    it('should track series-wide participant registration and bans', () => {
      const fp = 'user-fp-99';
      const part = store.registerSeriesParticipant('NEXT26', fp, 'Test Attendee');
      expect(part.name).toBe('Test Attendee');
      expect(part.isBanned).toBe(false);

      store.banParticipant('NEXT26', fp, true, 'organizer_secret_next26');
      expect(store.isParticipantBanned('NEXT26', fp)).toBe(true);
    });

    it('should set questionCount to 1 for a fresh participant submitting their first question', async () => {
      const freshFp = 'fresh-user-fp-uniqueid';
      const res = await store.submitQuestion({
        joinCode: 'NEXT26',
        clientFingerprint: freshFp,
        authorName: 'Brand New User',
        isAnonymous: false,
        content: 'This is my first question',
        segmentId: 'seg-1',
      });

      expect(res.question).toBeDefined();

      // Get the participant and verify questionCount is 1
      const participants = store.getParticipants('NEXT26');
      const participant = participants.find(p => p.clientFingerprint === freshFp);
      expect(participant).toBeDefined();
      expect(participant?.questionCount).toBe(1);
    });

    it('should NOT register participants for backing session codes (e.g., NEXT26-S1) when question submitted without initialized participant map', async () => {
      // NEXT26-S1 is a backing session that was created via repo.setSession but has no participant map initialized
      // The hasParticipants guard in recordParticipantQuestion should prevent participant registration
      const backingCode = 'NEXT26-S1';

      // Verify backing session exists but has no participants initialized
      expect(store.getSession(backingCode)).toBeDefined();
      expect(store.getParticipants(backingCode).length).toBe(0);

      // Submit a question under the backing session code
      const res = await store.submitQuestion({
        joinCode: backingCode,
        clientFingerprint: 'fp-backing-test',
        authorName: 'Test User',
        isAnonymous: false,
        content: 'Test question on backing session',
      });

      // The question may be submitted, but the guard should prevent participant registration
      // since the backing session code has no initialized participant map
      const participantsAfterSubmit = store.getParticipants(backingCode);
      expect(participantsAfterSubmit.length).toBe(0);

      // Verify the question count on the backing session reflects the guard worked
      const questions = store.getQuestions(backingCode);
      expect(questions.length).toBeGreaterThan(0); // question was submitted
      // but participants map was never created/updated due to the guard
    });

    it('should NOT create series participants for a standalone session that has only a legacy participant map', async () => {
      // A standalone session gets a legacy participant map (createSession) but is not a series,
      // so no series-participant map exists for its code. The hasSeriesParticipants guard in
      // recordParticipantQuestion must leave the series-participant side untouched.
      const session = store.createSession({ title: 'Standalone Room', customJoinCode: 'SOLO01' });
      expect(store.getSeries(session.joinCode)).toBeUndefined();
      expect(store.getSeriesParticipants(session.joinCode)).toEqual([]);

      const res = await store.submitQuestion({
        joinCode: session.joinCode,
        clientFingerprint: 'fp-standalone',
        authorName: 'Standalone User',
        isAnonymous: false,
        content: 'How does this standalone room handle participant tracking?',
      });
      expect(res.question).toBeDefined();

      // Legacy side WAS updated (proves the submission reached recordParticipantQuestion)
      const legacy = store.getParticipants(session.joinCode).find(p => p.clientFingerprint === 'fp-standalone');
      expect(legacy?.questionCount).toBe(1);

      // Series side must NOT have been created by the submission
      expect(store.getSeriesParticipants(session.joinCode).length).toBe(0);
    });

    it('should NOT create series participants for a backing session code (NEXT26-S1) with no series-participant map', async () => {
      const backingCode = 'NEXT26-S1';
      expect(store.getSession(backingCode)).toBeDefined();
      expect(store.getSeriesParticipants(backingCode)).toEqual([]);

      const res = await store.submitQuestion({
        joinCode: backingCode,
        clientFingerprint: 'fp-backing-series-guard',
        authorName: 'Backing User',
        isAnonymous: false,
        content: 'Does a backing session register series participants?',
      });
      expect(res.question).toBeDefined();

      expect(store.getSeriesParticipants(backingCode).length).toBe(0);
    });

    it('should still update series participants for a real series code (guard passes when the map exists)', async () => {
      const fp = 'fp-series-guard-positive';
      const res = await store.submitQuestion({
        joinCode: 'NEXT26',
        clientFingerprint: fp,
        authorName: 'Series User',
        isAnonymous: false,
        content: 'Does a real series update its series participant record?',
        segmentId: 'seg-1',
      });
      expect(res.question).toBeDefined();

      const sp = store.getSeriesParticipants('NEXT26').find(p => p.clientFingerprint === fp);
      expect(sp).toBeDefined();
      expect(sp?.questionCount).toBe(1);
      expect(sp?.segmentsVisited).toContain('seg-1');
    });
  });

  describe('7. Grounded RAG on Deck vs Generic AI Answer Synthesis', () => {
    it('should synthesize a grounded answer and set isGroundedOnDeck true when deck context is provided', async () => {
      const deckContext = `
        Dr. Sundar Varma Keynote Context:
        - Multimodal AI models process audio, vision, and streaming text in under 450ms.
        - Distributed memory architecture uses NVLink 5 coherent domains across 72 GPUs.
        - Retrieval-Augmented Generation relies on semantic chunk windows with dynamic surrogate keys.
      `;

      const result = await generateTwoLineAnswer('What is the memory bandwidth for NVLink 5?', deckContext);
      expect(result.isGroundedOnDeck).toBe(true);
      expect(result.firstLine).toBeTruthy();
      expect(result.secondLine).toBeTruthy();
      expect(result.firstLine).not.toBe('Real-time response processed based on active presentation stream.');
      expect(result.secondLine).not.toBe('Review related presentation slides for comprehensive architecture specifications.');
    });

    it('should synthesize a generic AI answer and set isGroundedOnDeck false when NO deck context is provided', async () => {
      const result = await generateTwoLineAnswer('How does Redis handle in-memory replication?', '');
      expect(result.isGroundedOnDeck).toBe(false);
      expect(result.firstLine).toBeTruthy();
      expect(result.secondLine).toBeTruthy();
      expect(result.firstLine).not.toBe('Real-time response processed based on active presentation stream.');
      expect(result.secondLine).not.toBe('Review related presentation slides for comprehensive architecture specifications.');
    });

    it('should set isGroundedOnDeck on question when submitting to a segment with grounding context', async () => {
      const res = await store.submitQuestion({
        joinCode: 'NEXT26',
        clientFingerprint: 'attendee-fp-1',
        authorName: 'Tech Attendee',
        isAnonymous: false,
        content: 'How does multimodal processing achieve sub-500ms latency?',
        segmentId: 'seg-1',
      });

      expect(res.question).toBeDefined();
      // Wait for async AI generation to resolve
      let q = store.getQuestions('NEXT26').find(item => item.id === res.question?.id);
      for (let attempt = 0; attempt < 25 && (q?.isGroundedOnDeck === undefined || !q?.aiLine1); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        q = store.getQuestions('NEXT26').find(item => item.id === res.question?.id);
      }
      expect(q).toBeDefined();
      expect(q?.isGroundedOnDeck).toBe(true);
      expect(q?.aiLine1).not.toBe('Real-time response processed based on active presentation stream.');
    }, 15000);

    it('should set isGroundedOnDeck false when submitting to a segment without deck context', async () => {
      // Create a series without any deck/grounding context
      const emptySeries = store.createSeries({
        title: 'Impromptu Q&A Session',
        description: 'No slides attached',
        segments: [
          { title: 'Open Floor', speakerName: 'Unprepared Speaker', type: 'TALK' },
        ],
      });

      const res = await store.submitQuestion({
        joinCode: emptySeries.seriesCode,
        clientFingerprint: 'attendee-fp-2',
        authorName: 'Curious Attendee',
        isAnonymous: false,
        content: 'What are the best practices for scaling WebSockets?',
        segmentId: emptySeries.segments[1].id,
      });

      expect(res.question).toBeDefined();
      // Wait for async AI generation to resolve
      let emptyQ = store.getQuestions(emptySeries.seriesCode).find(item => item.id === res.question?.id);
      for (let attempt = 0; attempt < 25 && (emptyQ?.isGroundedOnDeck === undefined || !emptyQ?.aiLine1); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        emptyQ = store.getQuestions(emptySeries.seriesCode).find(item => item.id === res.question?.id);
      }
      expect(emptyQ).toBeDefined();
      expect(emptyQ?.isGroundedOnDeck).toBe(false);
      expect(emptyQ?.aiLine1).not.toBe('Real-time response processed based on active presentation stream.');
    }, 15000);

    it('should chunk deck content into semantic sections for vector indexing', () => {
      const deckText = `
Slide 1: Cloud Architecture Overview
We run Kubernetes clusters across 3 regions with Global Server Load Balancing.
P99 latency is 45ms.

Slide 2: Security & Authentication
We use mTLS and zero-trust IAM tokens with 15-minute expiration windows.

Slide 3: Database & Caching
Our database layer uses Cloud Spanner and Redis clusters with 99.999% availability.
      `;
      const chunks = chunkTextForRag(deckText, 300);
      expect(chunks.length).toBeGreaterThanOrEqual(3);
      expect(chunks[0]).toContain('Slide 1');
      expect(chunks.some(c => c.includes('Security & Authentication'))).toBe(true);
      expect(chunks.some(c => c.includes('Cloud Spanner'))).toBe(true);
    });

    it('should compute cosine similarity between embedding vectors accurately', () => {
      const vecA = [1, 0, 0, 0];
      const vecB = [1, 0, 0, 0];
      const vecC = [0, 1, 0, 0];
      const vecD = [0.5, 0.5, 0, 0];

      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 4);
      expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0, 4);
      expect(cosineSimilarity(vecA, vecD)).toBeGreaterThan(0.5);
    });

    it('should perform embedding RAG to rank the most relevant chunk for a query', async () => {
      const chunks = [
        'Slide 1: We use Go and Rust microservices for high throughput.',
        'Slide 2: Security compliance includes SOC2 Type II, ISO 27001, and HIPAA.',
        'Slide 3: Real-time messaging uses WebSockets with Redis pub/sub backplane.',
      ];

      const rag = await performEmbeddingRag('What security certifications and compliance do you have?', chunks);
      expect(rag.ragModel).toContain('text-embedding-004');
      expect(rag.retrievedChunks.length).toBeGreaterThanOrEqual(1);
      // The top chunk should match the security slide
      expect(rag.retrievedChunks[0]).toContain('Security compliance');
      expect(rag.topSimilarity).toBeGreaterThan(0);
    });

    it('should include Gemini Embedding 2 metadata when generating grounded answers', async () => {
      const ans = await generateTwoLineAnswer(
        'What database is used for multi-region active replication?',
        'Slide 1: Primary storage uses Google Cloud Spanner with 99.999% SLA across multi-region clusters.'
      );
      expect(ans.isGroundedOnDeck).toBe(true);
      expect(ans.ragModel).toContain('text-embedding-004');
      expect(typeof ans.topSimilarity).toBe('number');
      expect(ans.firstLine).toBeTruthy();
      expect(ans.secondLine).toBeTruthy();
    }, 15000);

    it('should answer "WHICH TOPIC IS THIS SESSION" with an expert grounded answer without boilerplate cop-outs', async () => {
      const deck = `Session Title: Next-Gen Autonomous AI Agents on Google Cloud
Speaker: Dr. Maya Lin (Principal AI Architect)

Slide 1: Architecture & Tool Calling
We deploy multi-agent swarms using Google Agent Development Kit (ADK) and Gemini 2.5 Flash.

Slide 2: Low-Latency Grounding & RAG
Real-time indexing uses Gemini Embedding 2 (text-embedding-004) with sub-300ms vector lookup.

Slide 3: High-Availability Production Runtime
Workloads run on Cloud Run with automatic horizontal pod autoscaling.`;

      const ans = await generateTwoLineAnswer('WHICH TOPIC IS THIS SESSION', deck);
      expect(ans.isGroundedOnDeck).toBe(true);
      expect(ans.confidenceScore).toBeGreaterThanOrEqual(0.90);
      expect(ans.firstLine).toContain('Next-Gen Autonomous AI Agents on Google Cloud');
      expect(ans.firstLine).not.toContain('does not explicitly address this detail');
      expect(ans.secondLine).not.toContain('Consult the session presenter');
    }, 15000);

    it('should provide substantive expert fallback when attendee asks about topic on session without deck', async () => {
      const ans = await generateTwoLineAnswer('Which topic is this session?', undefined);
      expect(ans.isGroundedOnDeck).toBe(false);
      expect(ans.firstLine).toContain('interactive Q&A');
      expect(ans.firstLine).not.toContain('does not explicitly address this detail');
    }, 15000);
  });

  describe('8. Question Storage: listing, upvotes, edits, answers & deletion', () => {
    const seededIds = ['q-demo-1', 'q-demo-2', 'q-demo-3', 'q-demo-4', 'q-demo-5'];

    it('should list seeded questions in insertion order and return [] for an unknown code', () => {
      expect(store.getQuestions('NEXT26').map(q => q.id)).toEqual(seededIds);
      expect(store.getQuestions('next26').map(q => q.id)).toEqual(seededIds);
      expect(store.getQuestions('NOPE99', 'seg-1')).toEqual([]);
      expect(store.getQuestions('NEXT26', 'seg-1').map(q => q.id)).toEqual(['q-demo-1', 'q-demo-2', 'q-demo-3']);
      expect(store.getQuestions('NEXT26', 'ALL').map(q => q.id)).toEqual(seededIds);
    });

    it('should toggle an upvote on and off and reflect it in hasUserUpvoted and getUserUpvotedIds', () => {
      const fp = 'fp-toggle-tester';
      const before = store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.upvotes;

      expect(store.hasUserUpvoted('q-demo-3', fp)).toBe(false);
      expect(store.getUserUpvotedIds('NEXT26', fp)).toEqual([]);

      expect(store.toggleUpvote('NEXT26', 'q-demo-3', fp)).toEqual({ upvoted: true, upvotes: before + 1 });
      expect(store.hasUserUpvoted('q-demo-3', fp)).toBe(true);
      expect(store.getUserUpvotedIds('next26', fp)).toEqual(['q-demo-3']);
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.upvotes).toBe(before + 1);

      expect(store.toggleUpvote('NEXT26', 'q-demo-3', fp)).toEqual({ upvoted: false, upvotes: before });
      expect(store.hasUserUpvoted('q-demo-3', fp)).toBe(false);
      expect(store.getUserUpvotedIds('NEXT26', fp)).toEqual([]);
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.upvotes).toBe(before);
    });

    it('should keep upvote ledgers independent per fingerprint and per question', () => {
      store.toggleUpvote('NEXT26', 'q-demo-3', 'fp-a');
      store.toggleUpvote('NEXT26', 'q-demo-4', 'fp-a');
      store.toggleUpvote('NEXT26', 'q-demo-3', 'fp-b');

      expect(store.getUserUpvotedIds('NEXT26', 'fp-a')).toEqual(['q-demo-3', 'q-demo-4']);
      expect(store.getUserUpvotedIds('NEXT26', 'fp-b')).toEqual(['q-demo-3']);
      expect(store.hasUserUpvoted('q-demo-5', 'fp-a')).toBe(false);
    });

    it('should return null when toggling an upvote on an unknown question and leave the ledger untouched', () => {
      expect(store.toggleUpvote('NEXT26', 'q-does-not-exist', 'fp-ghost')).toBeNull();
      expect(store.hasUserUpvoted('q-does-not-exist', 'fp-ghost')).toBe(false);
    });

    it('should append a newly submitted question at the end of the list and register the author upvote', async () => {
      const fp = 'fp-new-author';
      const res = await store.submitQuestion({
        joinCode: 'NEXT26',
        clientFingerprint: fp,
        authorName: 'New Author',
        isAnonymous: false,
        content: 'Will the session recordings be published after the event ends?',
        segmentId: 'seg-1',
      });

      expect(res.question).toBeDefined();
      const id = res.question!.id;
      expect(res.question!.upvotes).toBe(1);
      expect(store.hasUserUpvoted(id, fp)).toBe(true);
      expect(store.getUserUpvotedIds('NEXT26', fp)).toEqual([id]);

      const ids = store.getQuestions('NEXT26').map(q => q.id);
      expect(ids).toEqual([...seededIds, id]);
    }, 15000);

    it('should update question status and expose it through getQuestions', () => {
      const updated = store.updateQuestionStatus('NEXT26', 'q-demo-3', 'REJECTED');
      expect(updated?.status).toBe('REJECTED');
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.status).toBe('REJECTED');

      expect(store.updateQuestionStatus('NEXT26', 'q-does-not-exist', 'REJECTED')).toBeNull();
    });

    it('should only let the author (or an admin) edit question content and trim the new text', () => {
      const original = store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.content;

      expect(store.editQuestionContent('q-demo-3', 'fp-not-the-author', 'Hijacked text')).toBeNull();
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.content).toBe(original);

      const byAuthor = store.editQuestionContent('q-demo-3', 'fp-marcus-vance', '  Edited by author  ');
      expect(byAuthor?.content).toBe('Edited by author');
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.content).toBe('Edited by author');

      const byAdmin = store.editQuestionContent('q-demo-3', 'fp-not-the-author', 'Edited by admin', true);
      expect(byAdmin?.content).toBe('Edited by admin');

      expect(store.editQuestionContent('q-does-not-exist', 'fp-x', 'nope', true)).toBeNull();
    });

    it('should add and delete human answers, enforcing ownership for non-admins', () => {
      expect(store.addHumanAnswer('NEXT26', 'q-does-not-exist', {
        authorName: 'Ghost', authorRole: 'attendee', content: 'nope',
      })).toBeNull();

      const added = store.addHumanAnswer('NEXT26', 'q-demo-3', {
        authorName: 'Helpful Human',
        authorRole: 'attendee',
        content: 'Yes, embeddings can be cached across speakers.',
        clientFingerprint: 'fp-helper',
      });
      expect(added).not.toBeNull();
      const answerId = added!.answer.id;
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.humanAnswers?.map(a => a.id)).toEqual([answerId]);

      // A different, non-admin fingerprint cannot delete it
      expect(store.deleteHumanAnswer('NEXT26', 'q-demo-3', answerId, 'fp-someone-else')).toBeNull();
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.humanAnswers?.length).toBe(1);

      // The owner can
      const removed = store.deleteHumanAnswer('NEXT26', 'q-demo-3', answerId, 'fp-helper');
      expect(removed?.question.humanAnswers).toEqual([]);
      expect(store.getQuestions('NEXT26').find(q => q.id === 'q-demo-3')!.humanAnswers).toEqual([]);

      // Unknown question / answer ids
      expect(store.deleteHumanAnswer('NEXT26', 'q-does-not-exist', answerId, 'fp-helper', true)).toBeNull();
      expect(store.deleteHumanAnswer('NEXT26', 'q-demo-3', 'ans-nope', 'fp-helper', true)).toBeNull();
    });

    it('should delete a question for its author or an admin, keep the remaining order, and free it from all lookups', () => {
      // Non-author, non-admin cannot delete
      expect(store.deleteQuestion('NEXT26', 'q-demo-3', 'fp-not-the-author')).toBe(false);
      expect(store.getQuestions('NEXT26').map(q => q.id)).toEqual(seededIds);

      // Admin deletes the middle question (which the fingerprint below had upvoted)
      store.toggleUpvote('NEXT26', 'q-demo-3', 'fp-voter');
      store.toggleUpvote('NEXT26', 'q-demo-4', 'fp-voter');
      expect(store.getUserUpvotedIds('NEXT26', 'fp-voter')).toEqual(['q-demo-3', 'q-demo-4']);
      expect(store.deleteQuestion('NEXT26', 'q-demo-3', 'fp-not-the-author', true)).toBe(true);
      expect(store.getQuestions('NEXT26').map(q => q.id)).toEqual(['q-demo-1', 'q-demo-2', 'q-demo-4', 'q-demo-5']);
      // The id is dropped from the session's id list, not just hidden by the missing question
      expect(store.getUserUpvotedIds('NEXT26', 'fp-voter')).toEqual(['q-demo-4']);
      expect(store.toggleUpvote('NEXT26', 'q-demo-3', 'fp-late')).toBeNull();
      expect(store.updateQuestionStatus('NEXT26', 'q-demo-3', 'APPROVED')).toBeNull();
      expect(store.deleteQuestion('NEXT26', 'q-demo-3', 'fp-x', true)).toBe(false);

      // The author (fingerprint derived from author name) deletes their own question, lowercase code accepted
      expect(store.deleteQuestion('next26', 'q-demo-1', 'fp-alex-rivera')).toBe(true);
      expect(store.getQuestions('NEXT26').map(q => q.id)).toEqual(['q-demo-2', 'q-demo-4', 'q-demo-5']);
    });

    it('should return teleprompter questions limited to APPROVED/ANSWERING with ANSWERING first', () => {
      const all = store.getTeleprompterQuestions('NEXT26');
      expect(all.map(q => q.id)[0]).toBe('q-demo-2'); // the only ANSWERING question sorts first
      expect(all.map(q => q.id).sort()).toEqual(['q-demo-2', 'q-demo-3', 'q-demo-4', 'q-demo-5']); // ANSWERED q-demo-1 excluded
      all.forEach(q => expect(typeof q.decayScore).toBe('number'));

      expect(store.getTeleprompterQuestions('NEXT26', 'seg-1').map(q => q.id).sort()).toEqual(['q-demo-2', 'q-demo-3']);

      store.updateQuestionStatus('NEXT26', 'q-demo-3', 'REJECTED');
      expect(store.getTeleprompterQuestions('NEXT26').map(q => q.id)).not.toContain('q-demo-3');
      expect(store.getTeleprompterQuestions('NOPE99')).toEqual([]);
    });

    it('should compute word frequencies from stored questions and drop rejected ones', () => {
      expect(store.getWordFrequencies('NEXT26').length).toBeGreaterThan(0);

      // seg-4 holds exactly one question (q-demo-5), so its words are not truncated by the top-48 cut
      expect(store.getWordFrequencies('NEXT26', 'seg-4').map(w => w.text)).toContain('Chunking');

      store.updateQuestionStatus('NEXT26', 'q-demo-5', 'REJECTED');
      expect(store.getWordFrequencies('NEXT26', 'seg-4')).toEqual([]);

      expect(store.getWordFrequencies('NOPE99')).toEqual([]);
    });

    it('should bulk-move only existing questions and report the moved count', () => {
      const res = store.bulkMoveQuestions('NEXT26', ['q-demo-3', 'q-does-not-exist', 'q-demo-4'], 'seg-6', 'organizer_secret_next26');
      expect(res.movedCount).toBe(2);
      expect(store.getQuestions('NEXT26', 'seg-6').map(q => q.id).sort()).toEqual(['q-demo-3', 'q-demo-4']);

      expect(store.moveQuestion('NEXT26', 'q-does-not-exist', 'seg-6', 'organizer_secret_next26')).toBe(false);
      expect(store.parkQuestion('NEXT26', 'q-does-not-exist', true, 'organizer_secret_next26')).toBe(false);
    });

    it('should generate a manual RAG answer on the stored question and return null for an unknown one', async () => {
      expect(await store.generateQuestionRagAnswer('NEXT26', 'q-does-not-exist')).toBeNull();

      const q = await store.generateQuestionRagAnswer('NEXT26', 'q-demo-3');
      expect(q).not.toBeNull();
      expect(q!.aiStatus).toBe('READY');
      expect(q!.aiLine1).toBeTruthy();
      const stored = store.getQuestions('NEXT26').find(item => item.id === 'q-demo-3')!;
      expect(stored.aiStatus).toBe('READY');
      expect(stored.aiLine1).toBe(q!.aiLine1);
    }, 15000);

    it('should NOT resurrect a question deleted while its manual RAG answer was still generating', async () => {
      const pending = store.generateQuestionRagAnswer('NEXT26', 'q-demo-3');
      expect(store.deleteQuestion('NEXT26', 'q-demo-3', 'fp-x', true)).toBe(true);
      await pending;

      expect(store.toggleUpvote('NEXT26', 'q-demo-3', 'fp-late')).toBeNull();
      expect(store.getQuestions('NEXT26').map(q => q.id)).toEqual(['q-demo-1', 'q-demo-2', 'q-demo-4', 'q-demo-5']);
    }, 15000);

    it('should reset a colliding backing-session question list when addSegment reuses its code (legacy behaviour)', async () => {
      // deleteSegment does not shrink order numbering, so addSegment (order = segments.length)
      // can reuse an existing backing code. Its question list has always been reset on creation.
      const series = store.createSeries({
        title: 'Collision Workshop',
        segments: [
          { title: 'Talk One', speakerName: 'Speaker One', type: 'TALK' },
          { title: 'Talk Two', speakerName: 'Speaker Two', type: 'TALK' },
        ],
      });
      const token = series.organizerToken;
      const backingTwo = `${series.seriesCode}-S2`;

      const res = await store.submitQuestion({
        joinCode: backingTwo,
        clientFingerprint: 'fp-collision',
        authorName: 'Collision Tester',
        isAnonymous: false,
        content: 'Is anything left in the backing session after a collision?',
      });
      expect(res.question).toBeDefined();
      expect(store.getQuestions(backingTwo).length).toBe(1);

      expect(store.deleteSegment(series.seriesCode, series.segments[1].id, token).success).toBe(true);
      expect(store.addSegment(series.seriesCode, { title: 'Replacement Talk', speakerName: 'Speaker Three' }, token)).not.toBeNull();

      // Replacement got order = segments.length = 2, so it re-registered `${code}-S2` and reset its list
      expect(store.getSession(backingTwo)?.title).toBe('Replacement Talk');
      expect(store.getQuestions(backingTwo)).toEqual([]);
    }, 15000);

    it('should reset a pre-existing standalone session question list when createSeries registers the same backing code (legacy behaviour)', async () => {
      // A standalone session may legally be named like a backing code ("COLL-S1"); a later series "COLL"
      // registers its own backing session under that code and has always started it with an empty list.
      store.createSession({ title: 'Standalone Lookalike', customJoinCode: 'COLL-S1' });
      const res = await store.submitQuestion({
        joinCode: 'COLL-S1',
        clientFingerprint: 'fp-lookalike',
        authorName: 'Lookalike Tester',
        isAnonymous: false,
        content: 'Does creating a series wipe the lookalike session question list?',
      });
      expect(res.question).toBeDefined();
      expect(store.getQuestions('COLL-S1').length).toBe(1);

      store.createSeries({
        title: 'Colliding Series',
        customSeriesCode: 'COLL',
        segments: [{ title: 'Only Talk', speakerName: 'Solo Speaker', type: 'TALK' }],
      });

      expect(store.getSession('COLL-S1')?.title).toBe('Only Talk');
      expect(store.getQuestions('COLL-S1')).toEqual([]);
    }, 15000);
  });

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

      // The previous negative assertion compared against
      // 'Real-time session synthesis completed across attendee inquiry streams
      // and upvote momentum.' — a string that only exists in the UI template
      // (executive-report.ts). The server can never return it, so the assertion
      // could never fail. The REAL server-side fallback lives in
      // gemini.service.ts and interpolates the session title.
      //
      // Whether the fallback fires depends on more than just "is a key
      // configured": a live call can also fail transiently (rate limit,
      // quota, network) and fall back even with a valid key. This test
      // can't control that, so it doesn't assert success/failure — only
      // that whichever path ran, the result is grounded in THIS session
      // rather than generic boilerplate.
      const SERVER_FALLBACK_PREFIX = 'Session synthesis for "';
      if (report.executiveSummary.startsWith(SERVER_FALLBACK_PREFIX)) {
        expect(report.executiveSummary).toContain('Edge AI Inference Deep-Dive');
      }
    }, 15000);
  });
});
