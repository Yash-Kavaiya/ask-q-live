import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class VoiceService {
  public isSpeaking = signal<boolean>(false);
  public currentSpeakingId = signal<string | null>(null);
  public rate = signal<number>(1.0);
  public voices = signal<SpeechSynthesisVoice[]>([]);
  public selectedVoice = signal<SpeechSynthesisVoice | null>(null);

  private synth: SpeechSynthesis | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  private initVoices(): void {
    if (!this.synth) return;
    const available = this.synth.getVoices();
    this.voices.set(available);

    if (available.length > 0 && !this.selectedVoice()) {
      // Prefer Google English voices or standard en-US voices
      const googleVoice = available.find(
        v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))
      );
      const enVoice = available.find(v => v.lang.startsWith('en'));
      this.selectedVoice.set(googleVoice || enVoice || available[0]);
    }
  }

  public setVoice(voice: SpeechSynthesisVoice): void {
    this.selectedVoice.set(voice);
  }

  public setRate(newRate: number): void {
    this.rate.set(Math.max(0.5, Math.min(2.0, newRate)));
  }

  public speakTwoLineAnswer(
    questionId: string,
    firstLine: string,
    secondLine: string
  ): void {
    if (!this.synth) return;

    // If already speaking this question, stop
    if (this.isSpeaking() && this.currentSpeakingId() === questionId) {
      this.stop();
      return;
    }

    this.stop();

    const fullText = `${firstLine} ${secondLine}`;
    const utterance = new SpeechSynthesisUtterance(fullText);

    if (this.selectedVoice()) {
      utterance.voice = this.selectedVoice();
    }
    utterance.rate = this.rate();
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      this.isSpeaking.set(true);
      this.currentSpeakingId.set(questionId);
    };

    utterance.onend = () => {
      this.isSpeaking.set(false);
      this.currentSpeakingId.set(null);
    };

    utterance.onerror = () => {
      this.isSpeaking.set(false);
      this.currentSpeakingId.set(null);
    };

    this.synth.speak(utterance);
  }

  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking.set(false);
    this.currentSpeakingId.set(null);
  }
}
