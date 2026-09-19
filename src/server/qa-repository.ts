import { Session, Participant, Series, SeriesParticipant } from '../app/models/qa.models.js';

export class QaRepository {
  private sessions = new Map<string, Session>();
  private participants = new Map<string, Map<string, Participant>>();
  private series = new Map<string, Series>();
  private seriesParticipants = new Map<string, Map<string, SeriesParticipant>>();

  getSession(joinCode: string): Session | undefined {
    return this.sessions.get(joinCode);
  }

  setSession(joinCode: string, session: Session): void {
    this.sessions.set(joinCode, session);
  }

  hasSession(joinCode: string): boolean {
    return this.sessions.has(joinCode);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getParticipant(joinCode: string, fingerprint: string): Participant | undefined {
    return this.participants.get(joinCode)?.get(fingerprint);
  }

  setParticipant(joinCode: string, fingerprint: string, participant: Participant): void {
    let map = this.participants.get(joinCode);
    if (!map) {
      map = new Map();
      this.participants.set(joinCode, map);
    }
    map.set(fingerprint, participant);
  }

  listParticipants(joinCode: string): Participant[] {
    const map = this.participants.get(joinCode);
    return map ? Array.from(map.values()) : [];
  }

  countParticipants(joinCode: string): number {
    return this.participants.get(joinCode)?.size || 0;
  }

  initParticipants(joinCode: string): void {
    if (!this.participants.has(joinCode)) {
      this.participants.set(joinCode, new Map());
    }
  }

  hasParticipants(joinCode: string): boolean {
    return this.participants.has(joinCode);
  }

  getSeries(code: string): Series | undefined {
    return this.series.get(code);
  }

  setSeries(code: string, series: Series): void {
    this.series.set(code, series);
  }

  hasSeries(code: string): boolean {
    return this.series.has(code);
  }

  listSeries(): Series[] {
    return Array.from(this.series.values());
  }

  getSeriesParticipant(seriesCode: string, fingerprint: string): SeriesParticipant | undefined {
    return this.seriesParticipants.get(seriesCode)?.get(fingerprint);
  }

  setSeriesParticipant(seriesCode: string, fingerprint: string, participant: SeriesParticipant): void {
    let map = this.seriesParticipants.get(seriesCode);
    if (!map) {
      map = new Map();
      this.seriesParticipants.set(seriesCode, map);
    }
    map.set(fingerprint, participant);
  }

  listSeriesParticipants(seriesCode: string): SeriesParticipant[] {
    const map = this.seriesParticipants.get(seriesCode);
    return map ? Array.from(map.values()) : [];
  }

  countSeriesParticipants(seriesCode: string): number {
    return this.seriesParticipants.get(seriesCode)?.size || 0;
  }

  initSeriesParticipants(seriesCode: string): void {
    if (!this.seriesParticipants.has(seriesCode)) {
      this.seriesParticipants.set(seriesCode, new Map());
    }
  }

  hasSeriesParticipants(seriesCode: string): boolean {
    return this.seriesParticipants.has(seriesCode);
  }
}
