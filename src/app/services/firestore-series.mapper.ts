import { Segment, Series, SessionSeries, SpeakerProfile } from '../models/qa.models';

/** Firestore schema version for series documents. Bump when shape changes. */
export const SERIES_SCHEMA_VERSION = 1;

export interface FirestoreSpeakerProfile {
  name: string;
  role: string;
  org: string;
  bio: string;
  avatarUrl: string;
  email: string;
  x: string;
  linkedin: string;
  website: string;
}

/**
 * series/{code}/segments/{id} is readable by anyone with a join code, so it
 * must never carry adminToken. Organizers/speakers recover tokens through
 * the authenticated /api/series/:code/segments endpoint or their own
 * speakerInvites claim (see FirestoreSpeakerInviteClaim).
 */
export interface FirestoreSegmentDoc {
  id: string;
  seriesId: string;
  joinCode: string;
  order: number;
  title: string;
  talkTitle: string;
  type: string;
  status: string;
  state: string;
  sessionDescription: string;
  topicSummary: string;
  groundingContext: string;
  categories: string[];
  durationMinutes: number;
  scheduledDurationMinutes: number;
  startTime: string;
  scheduledStart: string;
  speaker: FirestoreSpeakerProfile;
  graceWindowMinutes: number;
  schemaVersion: number;
  updatedAt: string;
  createdAt: string;
}

export interface FirestoreSeriesDoc {
  id: string;
  joinCode: string;
  seriesCode: string;
  title: string;
  description: string;
  state: string;
  timezone: string;
  startDate: string;
  activeSegmentId: string | null;
  segmentIds: string[];
  settings: Record<string, unknown>;
  revision: number;
  /** Never store raw Gemini key client-side; only whether one was configured. */
  hasCustomGeminiKey: boolean;
  creatorUid: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreSpeakerInviteClaim {
  joinCode: string;
  seriesTitle: string;
  seriesState: string;
  segmentId: string;
  segmentTitle: string;
  speakerName: string;
  speakerEmail: string;
  adminToken: string;
  status: string;
  order: number;
  updatedAt: string;
}

export function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toFirestoreSpeaker(seg: Segment): FirestoreSpeakerProfile {
  const nested = seg.speaker;
  return {
    name: clean(seg.speakerName) || clean(nested?.name) || 'Speaker',
    role: clean(seg.speakerRole) || clean(nested?.title),
    org: clean(seg.speakerOrg) || clean(nested?.org),
    bio: clean(seg.speakerBio) || clean(nested?.bio),
    avatarUrl: clean(seg.speakerAvatar) || clean(nested?.avatarUrl),
    email: clean(seg.speakerEmail).toLowerCase(),
    x: clean(seg.speakerX) || clean(nested?.xUrl),
    linkedin: clean(seg.speakerLinkedIn) || clean(nested?.linkedinUrl),
    website: clean(seg.speakerWebsite) || clean(nested?.websiteUrl),
  };
}

export function toFirestoreSegment(
  series: Pick<Series, 'id' | 'joinCode'>,
  seg: Segment,
  nowIso = new Date().toISOString()
): FirestoreSegmentDoc {
  const speaker = toFirestoreSpeaker(seg);
  const sessionDescription =
    clean(seg.sessionDescription) || clean(seg.topicSummary) || clean(seg.speakerBio);

  return {
    id: seg.id,
    seriesId: series.id || seg.seriesId || series.joinCode,
    joinCode: series.joinCode.toUpperCase(),
    order: typeof seg.order === 'number' ? seg.order : 0,
    title: clean(seg.title) || 'Talk',
    talkTitle: clean(seg.talkTitle) || clean(seg.title) || 'Talk',
    type: seg.type || 'TALK',
    status: seg.status || seg.state || 'SCHEDULED',
    state: seg.state || seg.status || 'SCHEDULED',
    sessionDescription,
    topicSummary: clean(seg.topicSummary) || sessionDescription,
    groundingContext: clean(seg.groundingContext) || clean(seg.contextData),
    categories: Array.isArray(seg.categories) && seg.categories.length ? seg.categories : ['General'],
    durationMinutes: seg.durationMinutes || seg.scheduledDurationMinutes || 45,
    scheduledDurationMinutes: seg.scheduledDurationMinutes || seg.durationMinutes || 45,
    startTime: clean(seg.startTime) || '09:00',
    scheduledStart: clean(seg.scheduledStart) || clean(seg.startTime) || nowIso,
    speaker,
    graceWindowMinutes: seg.graceWindowMinutes ?? 5,
    schemaVersion: SERIES_SCHEMA_VERSION,
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export function toFirestoreSeries(
  series: Series | SessionSeries,
  options?: { hasCustomGeminiKey?: boolean; creatorUid?: string }
): FirestoreSeriesDoc {
  const nowIso = new Date().toISOString();
  const joinCode = (series.joinCode || series.seriesCode || '').toUpperCase();
  const segmentIds =
    series.segmentIds?.length
      ? series.segmentIds
      : (series.segments || []).map(s => s.id);

  return {
    id: series.id || joinCode,
    joinCode,
    seriesCode: (series.seriesCode || joinCode).toUpperCase(),
    title: clean(series.title) || 'Workshop Series',
    description: clean(series.description),
    state: series.state || 'SCHEDULED',
    timezone: clean(series.timezone) || 'UTC',
    startDate: clean(series.startDate) || nowIso,
    activeSegmentId: series.activeSegmentId || series.liveSegmentId || null,
    segmentIds,
    settings: (series.settings || {}) as unknown as Record<string, unknown>,
    revision: series.revision || 1,
    hasCustomGeminiKey: options?.hasCustomGeminiKey ?? !!series.geminiApiKey,
    creatorUid: options?.creatorUid || clean(series.creatorUid),
    schemaVersion: SERIES_SCHEMA_VERSION,
    createdAt: clean(series.createdAt) || nowIso,
    updatedAt: nowIso,
  };
}

export interface FlatSpeakerFields
  extends Pick<
    Segment,
    | 'speakerName'
    | 'speakerRole'
    | 'speakerOrg'
    | 'speakerBio'
    | 'speakerAvatar'
    | 'speakerEmail'
    | 'speakerX'
    | 'speakerLinkedIn'
    | 'speakerWebsite'
  > {}

export interface FromFirestoreSpeakerResult {
  flat: FlatSpeakerFields;
  nested: SpeakerProfile;
}

export function fromFirestoreSpeaker(
  data: Partial<FirestoreSpeakerProfile> | undefined
): FromFirestoreSpeakerResult {
  const name = clean(data?.name) || 'Speaker';
  const nested: SpeakerProfile = {
    name,
    title: clean(data?.role) || undefined,
    org: clean(data?.org) || undefined,
    bio: clean(data?.bio) || undefined,
    avatarUrl: clean(data?.avatarUrl) || undefined,
    xUrl: clean(data?.x) || undefined,
    linkedinUrl: clean(data?.linkedin) || undefined,
    websiteUrl: clean(data?.website) || undefined,
  };

  return {
    nested,
    flat: {
      speakerName: name,
      speakerRole: nested.title,
      speakerOrg: nested.org,
      speakerBio: nested.bio,
      speakerAvatar: nested.avatarUrl,
      speakerEmail: clean(data?.email).toLowerCase() || undefined,
      speakerX: nested.xUrl,
      speakerLinkedIn: nested.linkedinUrl,
      speakerWebsite: nested.websiteUrl,
    },
  };
}

export function fromFirestoreSegment(
  data: Partial<FirestoreSegmentDoc> & { id?: string },
  fallbackId: string
): Segment {
  const speakerParts = fromFirestoreSpeaker(data.speaker);
  const sessionDescription = clean(data.sessionDescription) || clean(data.topicSummary);

  return {
    id: data.id || fallbackId,
    seriesId: clean(data.seriesId) || clean(data.joinCode),
    title: clean(data.title) || 'Talk',
    talkTitle: clean(data.talkTitle) || clean(data.title) || 'Talk',
    type: (data.type as Segment['type']) || 'TALK',
    status: (data.status as Segment['status']) || 'SCHEDULED',
    state: (data.state as Segment['state']) || 'SCHEDULED',
    startTime: clean(data.startTime) || '09:00',
    scheduledStart: clean(data.scheduledStart) || undefined,
    scheduledDurationMinutes: data.scheduledDurationMinutes || data.durationMinutes || 45,
    durationMinutes: data.durationMinutes || data.scheduledDurationMinutes || 45,
    groundingContext: clean(data.groundingContext) || undefined,
    contextData: clean(data.groundingContext) || undefined,
    categories: Array.isArray(data.categories) && data.categories.length ? data.categories : ['General'],
    order: typeof data.order === 'number' ? data.order : 0,
    graceWindowMinutes: data.graceWindowMinutes ?? 5,
    sessionDescription: sessionDescription || undefined,
    topicSummary: clean(data.topicSummary) || sessionDescription || undefined,
    speaker: speakerParts.nested,
    ...speakerParts.flat,
  };
}

export function speakerInviteDocId(joinCode: string, segmentId: string): string {
  return `${joinCode.toUpperCase()}_${segmentId}`;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}
