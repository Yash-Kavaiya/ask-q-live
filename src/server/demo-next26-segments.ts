import type { Segment } from '../app/models/qa.models.js';

/** Stable demo speaker emails for invite / speaker-login E2E. */
export const NEXT26_DEMO_SPEAKERS = [
  {
    id: 'seg-1',
    email: 'sundar.varma@askqlive.demo',
    token: 'speaker_token_sundar',
    name: 'Dr. Sundar Varma',
    role: 'VP of Machine Learning & Live Systems, Google DeepMind',
    title: 'Keynote: Multimodal AI & Live Interaction Systems',
    startTime: '09:00',
    minutesFromNow: -30,
    duration: 45,
    live: true,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    categories: ['Architecture', 'Gemini AI', 'Performance', 'Security', 'Telemetry'],
    bio: 'Leading research on low-latency multimodal LLMs and real-time interactive voice & teleprompter synthesis.',
    grounding: `Dr. Sundar Varma Keynote Context:
- Gemini Flash: Sub-second inference with strict JSON responseSchema validation.
- Real-time live Q&A: Redis caching, WebSocket propagation, Firestore persistence.
- Teleprompter Scoring: Score(q) = (U_q - 1) / (T_now - T_sub + 2)^1.5.`,
  },
  {
    id: 'seg-2',
    email: 'maya.chen@askqlive.demo',
    token: 'speaker_token_maya',
    name: 'Maya Chen',
    role: 'Principal Cloud Systems Architect',
    title: 'Low-Latency Inference & Edge Caching Architecture',
    startTime: '09:50',
    minutesFromNow: 20,
    duration: 40,
    live: false,
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    categories: ['Edge Workers', 'Caching', 'Latency', 'Redis', 'CDN'],
    bio: 'Specializes in distributed edge runtimes, Cloud Run microVM scaling, and sub-10ms cache hierarchies.',
    grounding: `Maya Chen - Edge Architecture Context:
- Edge Cache: Anycast Cloud CDN with 30s TTL on AI answers.
- MicroVM cold-start under 250ms via snapshot hydration.
- WebSocket pub/sub multiplexing for 100k concurrent listeners.`,
  },
  {
    id: 'seg-3',
    email: 'jordan.blake@askqlive.demo',
    token: 'speaker_token_jordan',
    name: 'Jordan Blake',
    role: 'Staff Engineer, Audience Experience',
    title: 'Zero-Auth Join Paths & Accessible Live Rooms',
    startTime: '10:35',
    minutesFromNow: 65,
    duration: 35,
    live: false,
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    categories: ['UX', 'Accessibility', 'Auth', 'Mobile'],
    bio: 'Designs frictionless attendee join flows for conferences — no accounts, QR codes, and screen-reader-ready rooms.',
    grounding: `Jordan Blake - Zero-Auth Join Context:
- Attendees join with room code only; staff use Firebase Auth.
- Speaker invites bind Gmail → segment adminToken claims.
- Moderators mirror organizer UI tabs without owning a segment token.`,
  },
  {
    id: 'seg-4',
    email: 'elena.rostova@askqlive.demo',
    token: 'speaker_token_elena',
    name: 'Dr. Elena Rostova',
    role: 'Head of Applied AI Research',
    title: 'Zero-Hallucination Grounding with Dynamic Vector Contexts',
    startTime: '11:15',
    minutesFromNow: 105,
    duration: 40,
    live: false,
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    categories: ['Grounding', 'Vector Search', 'Hallucination Mitigation', 'Embeddings'],
    bio: 'Author of landmark papers on structured RAG orchestration and real-time knowledge injection in LLMs.',
    grounding: `Dr. Elena Rostova - Dynamic Vector Grounding:
- Hybrid BM25 + dense embedding ranking for deck chunks.
- Context compression without accuracy loss.
- Citation injection into every two-line AI answer.`,
  },
  {
    id: 'seg-5',
    email: 'devon.takahashi@askqlive.demo',
    token: 'speaker_token_devon',
    name: 'Devon Takahashi',
    role: 'Director of Infrastructure Security',
    title: 'Hardening Real-Time Systems: Threat Modeling & Rate Limiting',
    startTime: '12:00',
    minutesFromNow: 150,
    duration: 40,
    live: false,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    categories: ['Security', 'Rate Limiting', 'Prompt Injection', 'Authentication'],
    bio: 'Former red-team lead specializing in WebSocket DDoS defense and prompt injection mitigation.',
    grounding: `Devon Takahashi - Live Security Architecture:
- Secondary LLM guardrails for adversarial prompts.
- Token-bucket rate limits: 5 submissions/min per fingerprint.
- Canvas/WebGL fingerprinting without cookies.`,
  },
  {
    id: 'seg-6',
    email: 'aisha.rahman@askqlive.demo',
    token: 'speaker_token_aisha',
    name: 'Aisha Rahman',
    role: 'Product Lead, Live Analytics',
    title: 'Live Telemetry Dashboards & Executive Heatmaps',
    startTime: '12:45',
    minutesFromNow: 195,
    duration: 35,
    live: false,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    categories: ['Analytics', 'Telemetry', 'Product', 'Reporting'],
    bio: 'Builds real-time sentiment and upvote velocity dashboards for conference organizers.',
    grounding: `Aisha Rahman - Analytics Context:
- Word-cloud and bubble matrix refresh under 1s.
- Cross-segment topic clustering for executive reports.
- Export formats: PDF, CSV, Markdown.`,
  },
  {
    id: 'seg-7',
    email: 'leo.nakamura@askqlive.demo',
    token: 'speaker_token_leo',
    name: 'Leo Nakamura',
    role: 'Mobile Platform Engineer',
    title: 'Mobile-First Live Q&A and Offline Resilience',
    startTime: '13:25',
    minutesFromNow: 235,
    duration: 35,
    live: false,
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    categories: ['Mobile', 'PWA', 'Offline', 'Performance'],
    bio: 'Owns the progressive web client for AskQlive — optimistic UI, offline question drafts, and low-bandwidth modes.',
    grounding: `Leo Nakamura - Mobile Context:
- Optimistic upvotes with conflict reconciliation.
- Offline draft queue when reconnecting.
- Touch-first teleprompter for speaker tablets.`,
  },
  {
    id: 'seg-8',
    email: 'sam.okonkwo@askqlive.demo',
    token: 'speaker_token_sam',
    name: 'Sam Okonkwo',
    role: 'CTO, Community Platforms',
    title: 'Closing Keynote: Scaling Live Knowledge Events Globally',
    startTime: '14:05',
    minutesFromNow: 275,
    duration: 45,
    live: false,
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80',
    categories: ['Executive Strategy', 'Scale', 'Community', 'Future of AI'],
    bio: 'Closes the day with a roadmap for multi-region live events, speaker green rooms, and community-led Q&A.',
    grounding: `Sam Okonkwo - Closing Context:
- Multi-region Cloud Run + Firestore dual-write.
- Speaker green rooms with invite-email claims.
- Organizer / moderator / speaker role boundaries.`,
  },
] as const;

export function buildNext26Segments(seriesId: string, now: number): Segment[] {
  return NEXT26_DEMO_SPEAKERS.map((s, idx) => {
    const scheduledStart = new Date(now + s.minutesFromNow * 60 * 1000).toISOString();
    const seg: Segment = {
      id: s.id,
      seriesId,
      title: s.title,
      speakerName: s.name,
      speakerRole: s.role,
      speakerBio: s.bio,
      speakerAvatar: s.avatar,
      speakerEmail: s.email,
      type: 'TALK',
      status: s.live ? 'LIVE' : 'SCHEDULED',
      state: s.live ? 'LIVE' : 'SCHEDULED',
      startTime: s.startTime,
      scheduledStart,
      scheduledDurationMinutes: s.duration,
      durationMinutes: s.duration,
      order: idx + 1,
      adminToken: s.token,
      graceWindowMinutes: 10,
      categories: [...s.categories],
      groundingContext: s.grounding,
      contextData: s.grounding,
    };
    if (s.live) {
      seg.actualStartTime = new Date(now - 25 * 60 * 1000).toISOString();
      seg.actualStart = seg.actualStartTime;
    }
    return seg;
  });
}
