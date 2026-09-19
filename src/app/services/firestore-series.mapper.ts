import { Segment, Series, SessionSeries, SpeakerInviteRecord, SpeakerProfile } from '../models/qa.models';

/** Firestore schema version for series documents. Bump when shape changes. */
export const SERIES_SCHEMA_VERSION = 1;

const DEFAULT_TALK_TITLE = 'Talk';
const DEFAULT_SERIES_TITLE = 'Workshop Series';
const DEFAULT_SPEAKER_NAME = 'Speaker';
const DEFAULT_CATEGORY = 'General';
const DEFAULT_DURATION_MINUTES = 45;
const DEFAULT_GRACE_WINDOW_MINUTES = 5;
const DEFAULT_START_TIME = '09:00';
const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_SERIES_STATE: Series['state'] = 'SCHEDULED';

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

/** Firestore doc shape for a claim; same fields as SpeakerInviteRecord plus a sync timestamp. */
export interface FirestoreSpeakerInviteClaim extends SpeakerInviteRecord {
  updatedAt: string;
}

export function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toFirestoreSpeaker(seg: Segment): FirestoreSpeakerProfile {
  const nested = seg.speaker;
  return {
    name: clean(seg.speakerName) || clean(nested?.name) || DEFAULT_SPEAKER_NAME,
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
    title: clean(seg.title) || DEFAULT_TALK_TITLE,
    talkTitle: clean(seg.talkTitle) || clean(seg.title) || DEFAULT_TALK_TITLE,
    type: seg.type || 'TALK',
    status: seg.status || seg.state || 'SCHEDULED',
    state: seg.state || seg.status || 'SCHEDULED',
    sessionDescription,
    topicSummary: clean(seg.topicSummary) || sessionDescription,
    groundingContext: clean(seg.groundingContext) || clean(seg.contextData),
    categories: Array.isArray(seg.categories) && seg.categories.length ? seg.categories : [DEFAULT_CATEGORY],
    durationMinutes: seg.durationMinutes || seg.scheduledDurationMinutes || DEFAULT_DURATION_MINUTES,
    scheduledDurationMinutes: seg.scheduledDurationMinutes || seg.durationMinutes || DEFAULT_DURATION_MINUTES,
    startTime: clean(seg.startTime) || DEFAULT_START_TIME,
    scheduledStart: clean(seg.scheduledStart) || clean(seg.startTime) || nowIso,
    speaker,
    graceWindowMinutes: seg.graceWindowMinutes ?? DEFAULT_GRACE_WINDOW_MINUTES,
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
    title: clean(series.title) || DEFAULT_SERIES_TITLE,
    description: clean(series.description),
    state: series.state || DEFAULT_SERIES_STATE,
    timezone: clean(series.timezone) || DEFAULT_TIMEZONE,
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

/** Inverse of toFirestoreSeries — hydrates series metadata from a Firestore doc snapshot. */
export function fromFirestoreSeries(
  data: Partial<FirestoreSeriesDoc>,
  fallbackCode: string,
  segments: Segment[]
): Partial<Series> {
  const code = clean(data.joinCode) || fallbackCode;
  return {
    id: clean(data.id) || code,
    joinCode: code,
    seriesCode: clean(data.seriesCode) || code,
    title: clean(data.title) || DEFAULT_SERIES_TITLE,
    description: clean(data.description),
    state: (data.state as Series['state']) || DEFAULT_SERIES_STATE,
    timezone: clean(data.timezone) || DEFAULT_TIMEZONE,
    startDate: clean(data.startDate),
    activeSegmentId: data.activeSegmentId || null,
    liveSegmentId: data.activeSegmentId || null,
    segmentIds: Array.isArray(data.segmentIds) && data.segmentIds.length ? data.segmentIds : segments.map(s => s.id),
    settings: data.settings as unknown as Series['settings'],
    revision: Number(data.revision) || 1,
    creatorUid: clean(data.creatorUid),
    updatedAt: clean(data.updatedAt),
    createdAt: clean(data.createdAt),
    segments,
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
  const name = clean(data?.name) || DEFAULT_SPEAKER_NAME;
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
    title: clean(data.title) || DEFAULT_TALK_TITLE,
    talkTitle: clean(data.talkTitle) || clean(data.title) || DEFAULT_TALK_TITLE,
    // Never carried on the public segment doc — see FirestoreSegmentDoc.
    adminToken: '',
    type: (data.type as Segment['type']) || 'TALK',
    status: (data.status as Segment['status']) || 'SCHEDULED',
    state: (data.state as Segment['state']) || 'SCHEDULED',
    startTime: clean(data.startTime) || DEFAULT_START_TIME,
    scheduledStart: clean(data.scheduledStart) || undefined,
    scheduledDurationMinutes: data.scheduledDurationMinutes || data.durationMinutes || DEFAULT_DURATION_MINUTES,
    durationMinutes: data.durationMinutes || data.scheduledDurationMinutes || DEFAULT_DURATION_MINUTES,
    groundingContext: clean(data.groundingContext) || undefined,
    contextData: clean(data.groundingContext) || undefined,
    categories: Array.isArray(data.categories) && data.categories.length ? data.categories : [DEFAULT_CATEGORY],
    order: typeof data.order === 'number' ? data.order : 0,
    graceWindowMinutes: data.graceWindowMinutes ?? DEFAULT_GRACE_WINDOW_MINUTES,
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
