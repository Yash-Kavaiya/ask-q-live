import { describe, it, expect } from 'vitest';
import { sanitizeSegmentForRole } from './auth.js';
import type { Segment, UserAccessInfo } from '../app/models/qa.models.js';

const makeSeg = (): Segment =>
  ({
    id: 'seg-1',
    adminToken: 'spk_secret',
    speakerEmail: 'speaker@example.com',
    title: 'Talk',
    speakerName: 'Ada',
    state: 'LIVE',
  }) as Segment;

// The fixture minus exactly the two fields the sanitizer must strip, so over-stripping a third field is caught.
const withoutSecrets = (seg: Segment): Partial<Segment> => {
  const expected: Partial<Segment> = { ...seg };
  delete expected.adminToken;
  delete expected.speakerEmail;
  return expected;
};

describe('sanitizeSegmentForRole', () => {
  it('returns the segment unchanged for the organizer', () => {
    const seg = makeSeg();
    const auth: UserAccessInfo = { role: 'organizer', scope: ['*'] };
    expect(sanitizeSegmentForRole(seg, auth)).toBe(seg);
  });

  it('returns the segment unchanged for the speaker assigned to that segment', () => {
    const seg = makeSeg();
    const auth: UserAccessInfo = { role: 'speaker', scope: ['seg-1'] };
    expect(sanitizeSegmentForRole(seg, auth)).toBe(seg);
  });

  it('strips adminToken and speakerEmail for a speaker of a different segment', () => {
    const seg = makeSeg();
    const auth: UserAccessInfo = { role: 'speaker', scope: ['seg-2'] };
    const result = sanitizeSegmentForRole(seg, auth) as Partial<Segment>;
    expect(result.adminToken).toBeUndefined();
    expect(result.speakerEmail).toBeUndefined();
    expect(result).toEqual(withoutSecrets(seg));
  });

  it('strips adminToken and speakerEmail for an attendee', () => {
    const seg = makeSeg();
    const auth: UserAccessInfo = { role: 'attendee', scope: [] };
    const result = sanitizeSegmentForRole(seg, auth) as Partial<Segment>;
    expect(result.adminToken).toBeUndefined();
    expect(result.speakerEmail).toBeUndefined();
    expect(result).toEqual(withoutSecrets(seg));
  });

  it('strips adminToken and speakerEmail for a moderator', () => {
    const seg = makeSeg();
    const auth: UserAccessInfo = { role: 'moderator', scope: ['seg-1'] };
    const result = sanitizeSegmentForRole(seg, auth) as Partial<Segment>;
    expect('adminToken' in result).toBe(false);
    expect('speakerEmail' in result).toBe(false);
    expect(result).toEqual(withoutSecrets(seg));
  });

  it('does not treat a speaker with a wildcard scope as the segment speaker unless the id is listed', () => {
    const seg = makeSeg();
    const auth: UserAccessInfo = { role: 'speaker', scope: ['*'] };
    const result = sanitizeSegmentForRole(seg, auth);
    expect(result).not.toBe(seg);
    expect('adminToken' in result).toBe(false);
    expect('speakerEmail' in result).toBe(false);
    expect(result).toEqual(withoutSecrets(seg));
  });

  it('does not mutate the input segment when stripping', () => {
    const seg = makeSeg();
    const auth: UserAccessInfo = { role: 'attendee', scope: [] };
    const result = sanitizeSegmentForRole(seg, auth);
    expect(result).not.toBe(seg);
    expect(seg.adminToken).toBe('spk_secret');
    expect(seg.speakerEmail).toBe('speaker@example.com');
  });
});
