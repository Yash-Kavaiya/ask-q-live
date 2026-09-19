import { Injectable } from '@angular/core';
import {
  ActiveLiveRoomPreview, PostSessionReport, Question, Segment, SeriesReport, Session, SessionSeries,
  SessionSettings, SpeakerInviteRecord, TelemetryMetrics, UserAccessInfo, WordFrequency,
} from '../models/qa.models';

@Injectable({ providedIn: 'root' })
export class SessionApiClient {
  async authenticateRole(code: string, token: string): Promise<UserAccessInfo> {
    const res = await fetch(`/api/sessions/${code}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return res.json();
  }

  async checkCodeAvailability(code: string): Promise<{ available: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/check-code/${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json();
        return { available: !!data.available, error: data.error };
      }
      return { available: true };
    } catch {
      return { available: true };
    }
  }

  async getPrivilegedSegments(code: string, token: string): Promise<{ segments: Segment[] } | null> {
    try {
      const res = await fetch(`/api/series/${code}/segments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  async joinSession(code: string, body: {
    fingerprint: string; name: string; adminToken?: string; title?: string; description?: string; type?: 'single' | 'series';
  }): Promise<{ session: Session; series?: SessionSeries }> {
    const res = await fetch(`/api/sessions/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Session not found or invalid room code');
    }
    return res.json();
  }

  async getSeries(code: string): Promise<{ series?: SessionSeries } | null> {
    const res = await fetch(`/api/series/${code}`);
    if (!res.ok) return null;
    return res.json();
  }

  async getSession(code: string): Promise<{ session: Session } | null> {
    const res = await fetch(`/api/sessions/${code}`);
    if (!res.ok) return null;
    return res.json();
  }

  async createSession(payload: {
    title: string;
    customJoinCode?: string;
    contextData?: string;
    settings?: SessionSettings;
  }): Promise<Session> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create session');
    }
    const data = await res.json();
    return data.session || data;
  }

  async createSeries(payload: object): Promise<SessionSeries> {
    const res = await fetch('/api/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create workshop series');
    }
    const data = await res.json();
    return data.series || data;
  }

  async generateSuggestedCode(prefix: string): Promise<{ code?: string }> {
    try {
      const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
      const res = await fetch(`/api/generate-code${query}`);
      if (res.ok) {
        return res.json();
      }
      return {};
    } catch {
      return {};
    }
  }

  async fetchActiveLiveRoom(): Promise<ActiveLiveRoomPreview | null> {
    const res = await fetch('/api/live-room');
    if (!res.ok) return null;
    return res.json();
  }

  async fetchSpeakerInvites(email: string): Promise<{ invites: SpeakerInviteRecord[] }> {
    try {
      const res = await fetch(`/api/speaker/invites?email=${encodeURIComponent(email)}`);
      if (!res.ok) return { invites: [] };
      return res.json();
    } catch {
      return { invites: [] };
    }
  }

  async startSegment(code: string, segmentId: string, token: string | null): Promise<{ series?: SessionSeries }> {
    const res = await fetch(`/api/series/${code}/segments/${segmentId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to start segment');
    }
    return res.json();
  }

  async endSegment(code: string, segmentId: string, token: string | null): Promise<{ series?: SessionSeries }> {
    const res = await fetch(`/api/series/${code}/segments/${segmentId}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to end segment');
    }
    return res.json();
  }

  async updateSeries(code: string, payload: object, token: string | null): Promise<{ series?: SessionSeries }> {
    const res = await fetch(`/api/series/${code}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ...payload, token }),
    });
    if (!res.ok) throw new Error('Failed to update series');
    return res.json();
  }

  async updateSegment(code: string, segmentId: string, payload: object, token: string | null): Promise<void> {
    const res = await fetch(`/api/series/${code}/segments/${segmentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ...payload, token }),
    });
    if (!res.ok) throw new Error('Failed to update segment');
  }

  async addSegment(code: string, payload: object, token: string | null): Promise<void> {
    const res = await fetch(`/api/series/${code}/segments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ...payload, token }),
    });
    if (!res.ok) throw new Error('Failed to add segment');
  }

  async reorderSegments(code: string, segmentIds: string[], token: string | null): Promise<void> {
    const res = await fetch(`/api/series/${code}/segments/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ segmentIds, token }),
    });
    if (!res.ok) throw new Error('Failed to reorder segments');
  }

  async getQuestions(
    code: string,
    fingerprint: string,
    segmentQuery: string,
  ): Promise<{ questions?: Question[]; userUpvotedIds?: string[] } | null> {
    const res = await fetch(`/api/sessions/${code}/questions?fingerprint=${fingerprint}${segmentQuery}`);
    return res.ok ? res.json() : null;
  }

  async getTelemetry(
    code: string,
    fingerprint: string,
    segmentQuery: string,
  ): Promise<TelemetryMetrics | null> {
    const res = await fetch(`/api/sessions/${code}/telemetry?fingerprint=${fingerprint}${segmentQuery}`);
    return res.ok ? res.json() : null;
  }

  async getTeleprompterQueue(code: string, segmentQuery: string): Promise<Question[] | null> {
    const res = await fetch(`/api/sessions/${code}/teleprompter?${segmentQuery}`);
    return res.ok ? res.json() : null;
  }

  async getWordCloud(code: string, segmentQuery: string): Promise<WordFrequency[] | null> {
    const res = await fetch(`/api/sessions/${code}/wordcloud?${segmentQuery}`);
    return res.ok ? res.json() : null;
  }

  async moveQuestionToSegment(
    code: string,
    questionId: string,
    targetSegmentId: string,
    token: string | null,
  ): Promise<void> {
    const res = await fetch(`/api/series/${code}/questions/${questionId}/move-segment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ targetSegmentId, token }),
    });
    if (!res.ok) throw new Error('Failed to move question');
  }

  async requestRagAnswer(code: string, questionId: string): Promise<{ question?: Question } | null> {
    const res = await fetch(`/api/series/${code}/questions/${questionId}/rag-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return res.json();
  }

  async submitQuestion(
    code: string,
    payload: object,
  ): Promise<{ deduplicated: boolean; message?: string; question?: Question }> {
    const res = await fetch(`/api/sessions/${code}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit question');
    }
    return data;
  }

  async toggleUpvote(
    code: string,
    questionId: string,
    fingerprint: string,
  ): Promise<{ upvotes?: number } | null> {
    const res = await fetch(`/api/sessions/${code}/questions/${questionId}/upvote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientFingerprint: fingerprint,
      }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async updateQuestionStatus(code: string, questionId: string, payload: object): Promise<void> {
    await fetch(`/api/sessions/${code}/questions/${questionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async editQuestionContent(code: string, questionId: string, payload: object): Promise<boolean> {
    const res = await fetch(`/api/sessions/${code}/questions/${questionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async deleteQuestion(code: string, questionId: string, payload: object): Promise<boolean> {
    const res = await fetch(`/api/sessions/${code}/questions/${questionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async submitHumanAnswer(
    code: string,
    questionId: string,
    payload: object,
  ): Promise<{ question?: Question } | null> {
    const res = await fetch(`/api/sessions/${code}/questions/${questionId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async deleteHumanAnswer(
    code: string,
    questionId: string,
    answerId: string,
    payload: object,
  ): Promise<{ question?: Question } | null> {
    const res = await fetch(`/api/sessions/${code}/questions/${questionId}/answers/${answerId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async updateGroundingContext(code: string, contextData: string): Promise<boolean> {
    const res = await fetch(`/api/sessions/${code}/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextData }),
    });
    return res.ok;
  }

  async updateSettings(code: string, settings: object): Promise<boolean> {
    const res = await fetch(`/api/sessions/${code}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    return res.ok;
  }

  async translateText(code: string, text: string, targetLanguage: string): Promise<string> {
    try {
      const res = await fetch(`/api/sessions/${code}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage }),
      });
      const data = await res.json();
      return data.translatedText || text;
    } catch {
      return text;
    }
  }

  async generatePostSessionReport(code: string): Promise<PostSessionReport> {
    const res = await fetch(`/api/sessions/${code}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Report generation failed');
    return res.json();
  }

  async fetchSeriesReport(code: string): Promise<SeriesReport> {
    const res = await fetch(`/api/series/${code}/report`);
    if (!res.ok) throw new Error('Series report generation failed');
    return res.json();
  }

  async banParticipant(code: string, fingerprint: string, banned: boolean): Promise<boolean> {
    const res = await fetch(`/api/sessions/${code}/participants/${fingerprint}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned }),
    });
    return res.ok;
  }
}
