import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { UserRole, UserAccessInfo, Series } from '../app/models/qa.models.js';
import type { QaStore } from './qa-store.js';

/**
 * Timing-safe string comparison to mitigate side-channel timing attacks
 */
export function timingSafeCompare(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extracts Bearer token from Authorization header or fallback body/query
 */
export function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    // Handle raw token in Authorization header if not prefixed with Bearer
    if (!authHeader.includes(' ')) {
      return authHeader.trim();
    }
  }
  if (req.body && typeof req.body['token'] === 'string') {
    return (req.body['token'] as string).trim();
  }
  if (req.query && typeof req.query['token'] === 'string') {
    return (req.query['token'] as string).trim();
  }
  return undefined;
}

/**
 * Resolves user role and permitted scope for a Series or Session
 */
export function resolveAuth(
  store: QaStore,
  code: string,
  token: string | undefined
): UserAccessInfo {
  if (!token) {
    return { role: 'attendee', scope: [] };
  }

  const cleanToken = token.trim();
  const normalizedCode = code.toUpperCase();

  const series = store.getSeries(normalizedCode);
  const session = store.getSession(normalizedCode);

  // 1. Check Series Organizer Token
  if (series && timingSafeCompare(series.organizerToken, cleanToken)) {
    return {
      role: 'organizer',
      scope: ['*'],
      token: cleanToken,
    };
  }

  // 2. Check Session Admin Token
  if (session && timingSafeCompare(session.adminToken, cleanToken)) {
    return {
      role: 'organizer',
      scope: ['*'],
      token: cleanToken,
    };
  }

  // 3. Check Segment Speaker Admin Tokens
  if (series && series.segments) {
    for (const seg of series.segments) {
      if (seg.adminToken && timingSafeCompare(seg.adminToken, cleanToken)) {
        return {
          role: 'speaker',
          scope: [seg.id],
          segmentId: seg.id,
          token: cleanToken,
        };
      }
    }
  }

  return { role: 'attendee', scope: [] };
}

/**
 * Public response sanitizer: Strips organizerToken and all segment adminTokens
 * (Spec requirement: GET /api/series/:code MUST NOT return organizerToken or any adminToken)
 */
export function sanitizeSeriesForPublic(series: Series): Omit<Series, 'organizerToken'> {
  const sanitizedSegments = (series.segments || []).map(seg => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { adminToken, ...safeSeg } = seg;
    return safeSeg as typeof seg;
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { organizerToken, ...safeSeries } = series;

  return {
    ...safeSeries,
    segments: sanitizedSegments,
  };
}

/**
 * Express middleware factory to require specific role authorization
 */
export function requireAuth(
  store: QaStore,
  allowedRoles: UserRole[],
  options?: {
    getSegmentId?: (req: Request) => string | undefined;
    getCode?: (req: Request) => string;
  }
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawCode = options?.getCode ? options.getCode(req) : (req.params['code'] || '');
    const code = Array.isArray(rawCode) ? rawCode[0] : String(rawCode || '');
    const token = extractBearerToken(req);

    const auth = resolveAuth(store, code, token);

    // Organizer has universal scope
    if (auth.role === 'organizer' && allowedRoles.includes('organizer')) {
      (req as unknown as { auth: UserAccessInfo }).auth = auth;
      next();
      return;
    }

    // Speaker check with segment-scoped boundary
    if (auth.role === 'speaker' && allowedRoles.includes('speaker')) {
      const rawTarget = options?.getSegmentId ? options.getSegmentId(req) : (req.params['segmentId'] || req.params['id']);
      const targetSegmentId = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
      if (!targetSegmentId || auth.scope.includes(targetSegmentId) || auth.scope.includes('*')) {
        (req as unknown as { auth: UserAccessInfo }).auth = auth;
        next();
        return;
      }
    }

    res.status(403).json({
      error: 'Forbidden: Insufficient privileges for this action',
      requiredRoles: allowedRoles,
      currentRole: auth.role,
    });
  };
}
