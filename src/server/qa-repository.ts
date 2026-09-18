import { Session, Participant } from '../app/models/qa.models.js';

export class QaRepository {
  private sessions = new Map<string, Session>();
  private participants = new Map<string, Map<string, Participant>>();

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
}
