import { describe, it, expect } from 'vitest';
import { Segment } from '../models/qa.models';
import {
  FirestoreSegmentDoc,
  clean,
  fromFirestoreSegment,
  fromFirestoreSeries,
  fromFirestoreSpeaker,
  normalizeInviteEmail,
  speakerInviteDocId,
  toFirestoreSegment,
  toFirestoreSeries,
  toFirestoreSpeaker,
} from './firestore-series.mapper';

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-1',
    seriesId: 'series-1',
    title: 'Opening Keynote',
    speakerName: 'Ada Lovelace',
    type: 'TALK',
    status: 'SCHEDULED',
    startTime: '09:00',
    scheduledDurationMinutes: 45,
    categories: ['General'],
    adminToken: 'admin_super_secret_token',
    order: 0,
    graceWindowMinutes: 5,
    speakerEmail: 'Ada.Lovelace@Example.com',
    ...overrides,
  };
}

describe('firestore-series.mapper', () => {
  describe('clean', () => {
    it('trims strings and yields empty for non-strings', () => {
      expect(clean('  Next26  ')).toBe('Next26');
      expect(clean(undefined)).toBe('');
      expect(clean(42)).toBe('');
    });
  });

  describe('fromFirestoreSeries', () => {
    it('hydrates series metadata and falls back to the join code', () => {
      const segments = [makeSegment()];
      const series = fromFirestoreSeries(
        {
          title: '  Next26 Summit  ',
          timezone: 'America/Los_Angeles',
          revision: 4,
          creatorUid: 'uid-1',
        },
        'NEXT26',
        segments
      );

      expect(series.joinCode).toBe('NEXT26');
      expect(series.id).toBe('NEXT26');
      expect(series.title).toBe('Next26 Summit');
      expect(series.timezone).toBe('America/Los_Angeles');
      expect(series.revision).toBe(4);
      expect(series.creatorUid).toBe('uid-1');
      expect(series.segmentIds).toEqual(['seg-1']);
      expect(series.segments).toBe(segments);
    });

    it('defaults missing title, timezone, and state', () => {
      const series = fromFirestoreSeries({}, 'NEXT26', []);
      expect(series.title).toBe('Workshop Series');
      expect(series.timezone).toBe('UTC');
      expect(series.state).toBe('SCHEDULED');
      expect(series.revision).toBe(1);
    });

    it('round-trips through toFirestoreSeries without carrying a Gemini key', () => {
      const original = {
        id: 'NEXT26',
        joinCode: 'NEXT26',
        seriesCode: 'NEXT26',
        title: 'Next26 Summit',
        description: 'Live Q&A',
        startDate: '2026-09-18',
        timezone: 'UTC',
        state: 'LIVE' as const,
        segmentIds: ['seg-1'],
        organizerToken: 'secret',
        geminiApiKey: 'should-not-round-trip',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        settings: {
          autoAdvance: true,
          graceWindowMinutes: 5,
          allowPreSubmit: true,
          allowSpeakerSelfEnd: true,
          autoParkUnanswered: true,
          cascadeScheduleShift: true,
          defaultModerationSensitivity: 'BALANCED' as const,
          allowAnonymous: true,
          maxQuestionsPerMinute: 5,
          maxQuestionsPerSeriesPerHour: 20,
          showCrossSegmentSimilarHint: true,
        },
        segments: [makeSegment()],
      };
      const doc = toFirestoreSeries(original);
      const rehydrated = fromFirestoreSeries(doc, 'NEXT26', original.segments);

      expect(rehydrated.title).toBe('Next26 Summit');
      expect(rehydrated.state).toBe('LIVE');
      expect(rehydrated).not.toHaveProperty('geminiApiKey');
      expect(rehydrated).not.toHaveProperty('organizerToken');
    });
  });

  describe('toFirestoreSegment', () => {
    it('never carries adminToken — the segment doc is publicly readable', () => {
      const seg = makeSegment();
      const doc = toFirestoreSegment({ id: 'series-1', joinCode: 'NEXT26' }, seg);
      expect(doc).not.toHaveProperty('adminToken');
    });

    it('lowercases the speaker email for consistent claim-doc lookups', () => {
      const seg = makeSegment({ speakerEmail: 'Ada.Lovelace@Example.com' });
      const doc = toFirestoreSegment({ id: 'series-1', joinCode: 'NEXT26' }, seg);
      expect(doc.speaker.email).toBe('ada.lovelace@example.com');
    });

    it('falls back to sensible defaults for blank optional fields', () => {
      const seg = makeSegment({ title: '', categories: [] });
      const doc = toFirestoreSegment({ id: 'series-1', joinCode: 'next26' }, seg);
      expect(doc.title).toBe('Talk');
      expect(doc.categories).toEqual(['General']);
      expect(doc.joinCode).toBe('NEXT26');
    });
  });

  describe('fromFirestoreSegment', () => {
    it('round-trips title, categories, and speaker fields from a segment doc', () => {
      const seg = makeSegment();
      const doc = toFirestoreSegment({ id: 'series-1', joinCode: 'NEXT26' }, seg);
      const rehydrated = fromFirestoreSegment({ ...doc, id: seg.id }, seg.id);

      expect(rehydrated.title).toBe(seg.title);
      expect(rehydrated.categories).toEqual(seg.categories);
      expect(rehydrated.speakerName).toBe(seg.speakerName);
      expect(rehydrated.speakerEmail).toBe('ada.lovelace@example.com');
    });

    it('always yields an empty adminToken, even if a caller injects one into the doc', () => {
      const tampered = {
        ...(toFirestoreSegment({ id: 'series-1', joinCode: 'NEXT26' }, makeSegment()) as FirestoreSegmentDoc),
        adminToken: 'leaked_token',
      } as Partial<FirestoreSegmentDoc> & { adminToken?: string };
      const rehydrated = fromFirestoreSegment(tampered, 'seg-1');
      expect(rehydrated.adminToken).toBe('');
    });

    it('falls back to the document id when no id field is present', () => {
      const rehydrated = fromFirestoreSegment({}, 'fallback-id');
      expect(rehydrated.id).toBe('fallback-id');
      expect(rehydrated.title).toBe('Talk');
      expect(rehydrated.speaker?.name).toBe('Speaker');
    });
  });

  describe('toFirestoreSpeaker / fromFirestoreSpeaker', () => {
    it('round-trips a full speaker profile', () => {
      const seg = makeSegment({
        speakerRole: 'CTO',
        speakerOrg: 'Analytical Engines Inc.',
        speakerBio: 'Pioneer of computing.',
        speakerX: '@ada',
        speakerLinkedIn: 'ada-lovelace',
        speakerWebsite: 'https://ada.dev',
      });
      const speakerDoc = toFirestoreSpeaker(seg);
      const { flat, nested } = fromFirestoreSpeaker(speakerDoc);

      expect(flat.speakerRole).toBe('CTO');
      expect(flat.speakerOrg).toBe('Analytical Engines Inc.');
      expect(nested.bio).toBe('Pioneer of computing.');
      expect(nested.xUrl).toBe('@ada');
    });

    it('defaults an unnamed speaker to "Speaker"', () => {
      const { nested } = fromFirestoreSpeaker(undefined);
      expect(nested.name).toBe('Speaker');
    });
  });

  describe('normalizeInviteEmail', () => {
    it('trims and lowercases', () => {
      expect(normalizeInviteEmail('  Ada.Lovelace@Example.com  ')).toBe('ada.lovelace@example.com');
    });
  });

  describe('speakerInviteDocId', () => {
    it('joins the uppercased join code and segment id', () => {
      expect(speakerInviteDocId('next26', 'seg-1')).toBe('NEXT26_seg-1');
    });
  });
});
