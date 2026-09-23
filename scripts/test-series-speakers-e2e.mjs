/**
 * E2E: 8-speaker series + audience questions + speaker invite login (token claim).
 * Usage: node scripts/test-series-speakers-e2e.mjs
 * Env: ASKQLIVE_API_BASE=https://askqlive.com (default) or http://localhost:4000
 */
const API_BASE = process.env.ASKQLIVE_API_BASE || 'https://askqlive.com';

async function api(path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('=== Multi-speaker + speaker-login E2E ===');
  console.log('API:', API_BASE);

  const code = `SPK8${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const speakers = [
    { title: 'Keynote: Agentic Live Systems', speakerName: 'Dr. Sundar Varma', speakerEmail: 'sundar.varma@askqlive.demo', durationMinutes: 40 },
    { title: 'Edge Caching Playbook', speakerName: 'Maya Chen', speakerEmail: 'maya.chen@askqlive.demo', durationMinutes: 35 },
    { title: 'Zero-Auth Audience Paths', speakerName: 'Jordan Blake', speakerEmail: 'jordan.blake@askqlive.demo', durationMinutes: 30 },
    { title: 'Vector Grounding', speakerName: 'Dr. Elena Rostova', speakerEmail: 'elena.rostova@askqlive.demo', durationMinutes: 35 },
    { title: 'Live Security Hardening', speakerName: 'Devon Takahashi', speakerEmail: 'devon.takahashi@askqlive.demo', durationMinutes: 35 },
    { title: 'Telemetry Heatmaps', speakerName: 'Aisha Rahman', speakerEmail: 'aisha.rahman@askqlive.demo', durationMinutes: 30 },
    { title: 'Mobile Live Q&A', speakerName: 'Leo Nakamura', speakerEmail: 'leo.nakamura@askqlive.demo', durationMinutes: 30 },
    { title: 'Closing: Global Scale', speakerName: 'Sam Okonkwo', speakerEmail: 'sam.okonkwo@askqlive.demo', durationMinutes: 40 },
  ];

  const created = await api('/api/series', 'POST', {
    title: 'AskQlive 8-Speaker Summit E2E',
    description: 'Automated multi-speaker series for speaker-login verification',
    customJoinCode: code,
    segments: speakers.map((s) => ({ ...s, type: 'TALK' })),
  });

  const series = created.series || created;
  assert(series?.joinCode === code, 'join code mismatch');
  assert((series.segments || []).length >= 8, `expected >=8 segments, got ${(series.segments || []).length}`);
  const orgToken = series.organizerToken;
  assert(orgToken, 'missing organizerToken');
  console.log('Created series', code, 'segments=', series.segments.length);

  // Privileged segment tokens (public GET strips adminToken)
  const priv = await api(`/api/series/${code}/segments`, 'GET', null, orgToken);
  const segs = priv.segments || priv || [];
  assert(Array.isArray(segs) && segs.length >= 8, 'privileged segments missing');
  const withEmail = segs.filter((s) => s.speakerEmail && s.adminToken);
  assert(withEmail.length >= 8, `expected 8 speaker emails+tokens, got ${withEmail.length}`);
  console.log('Privileged segments OK with emails');

  // Audience asks a question on each of 3 talks
  const asked = [];
  for (const seg of withEmail.slice(0, 3)) {
    const q = await api(`/api/series/${code}/questions`, 'POST', {
      content: `E2E question for ${seg.speakerName}: how does your talk handle live grounding updates?`,
      authorName: 'E2E Attendee',
      isAnonymous: false,
      fingerprint: `fp-e2e-${seg.id}-${Date.now()}`,
      segmentId: seg.id,
      category: 'General',
    });
    asked.push(q.question || q);
  }
  assert(asked.length === 3, 'failed to ask 3 questions');
  console.log('Asked 3 audience questions');

  // Speaker invite lookup (email login path)
  const mayaEmail = 'maya.chen@askqlive.demo';
  const invites = await api(`/api/speaker/invites?email=${encodeURIComponent(mayaEmail)}`);
  assert(invites.invites?.length >= 1, 'Maya invite missing');
  const mayaInvite = invites.invites.find((i) => i.joinCode === code) || invites.invites[0];
  assert(mayaInvite.adminToken, 'invite missing adminToken');
  assert(mayaInvite.segmentId, 'invite missing segmentId');
  console.log('Speaker invite for', mayaEmail, '→', mayaInvite.segmentTitle);

  // Speaker auth claim (same staff portal path as moderator role select + token scope)
  const auth = await api(`/api/series/${code}/auth`, 'POST', { token: mayaInvite.adminToken });
  assert(auth.role === 'speaker', `expected speaker role, got ${auth.role}`);
  assert(auth.segmentId === mayaInvite.segmentId, 'speaker scope segment mismatch');
  console.log('Speaker auth OK', auth);

  // Speaker can read questions (staff)
  const qs = await api(`/api/series/${code}/questions`, 'GET', null, mayaInvite.adminToken);
  const list = qs.questions || qs || [];
  assert(Array.isArray(list) && list.length >= 3, `expected questions visible to speaker, got ${list.length}`);
  console.log('Speaker sees', list.length, 'questions');

  // Moderator-style organizer auth still works
  const orgAuth = await api(`/api/series/${code}/auth`, 'POST', { token: orgToken });
  assert(orgAuth.role === 'organizer', `expected organizer, got ${orgAuth.role}`);
  console.log('Organizer/moderator-path auth OK');

  // Also verify seeded NEXT26 if present (after deploy with SEED_DEMO_SESSIONS)
  try {
    const seeded = await api('/api/series/NEXT26');
    const seededSegs = seeded.series?.segments || [];
    if (seededSegs.length) {
      console.log('Seeded NEXT26 present with', seededSegs.length, 'segments');
      const sundarInvites = await api(
        `/api/speaker/invites?email=${encodeURIComponent('sundar.varma@askqlive.demo')}`
      );
      console.log('NEXT26 Sundar invites:', sundarInvites.invites?.length || 0);
    }
  } catch {
    console.log('NEXT26 not available on this instance (seed may be cold-start pending)');
  }

  const summary = {
    ok: true,
    seriesCode: code,
    speakers: withEmail.map((s) => ({ name: s.speakerName, email: s.speakerEmail, id: s.id })),
    questionsAsked: asked.length,
    speakerRole: auth.role,
    speakerSegmentId: auth.segmentId,
  };
  console.log('\nRESULT', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
