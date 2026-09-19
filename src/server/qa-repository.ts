import { Session, Participant, Series, SeriesParticipant, Question } from '../app/models/qa.models.js';

export class QaRepository {
  private sessions = new Map<string, Session>();
  private participants = new Map<string, Map<string, Participant>>();
  private series = new Map<string, Series>();
  private seriesParticipants = new Map<string, Map<string, SeriesParticipant>>();
  private questions = new Map<string, Question>(); // questionId -> Question
  private sessionQuestions = new Map<string, string[]>(); // joinCode -> questionId[]
  private upvoteLedger = new Set<string>(); // `${questionId}:${clientFingerprint}`

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

  getQuestion(id: string): Question | undefined {
    return this.questions.get(id);
  }

  setQuestion(id: string, question: Question): void {
    this.questions.set(id, question);
  }

  deleteQuestion(id: string): void {
    this.questions.delete(id);
  }

  getQuestionIds(joinCode: string): string[] {
    return this.sessionQuestions.get(joinCode) || [];
  }

  addQuestionId(joinCode: string, questionId: string): void {
    const list = this.sessionQuestions.get(joinCode);
    if (list) {
      list.push(questionId);
    } else {
      this.sessionQuestions.set(joinCode, [questionId]);
    }
  }

  setQuestionIds(joinCode: string, ids: string[]): void {
    this.sessionQuestions.set(joinCode, ids);
  }

  private upvoteKey(questionId: string, fingerprint: string): string {
    return `${questionId}:${fingerprint}`;
  }

  hasUpvote(questionId: string, fingerprint: string): boolean {
    return this.upvoteLedger.has(this.upvoteKey(questionId, fingerprint));
  }

  addUpvote(questionId: string, fingerprint: string): void {
    this.upvoteLedger.add(this.upvoteKey(questionId, fingerprint));
  }

  removeUpvote(questionId: string, fingerprint: string): void {
    this.upvoteLedger.delete(this.upvoteKey(questionId, fingerprint));
  }
}
