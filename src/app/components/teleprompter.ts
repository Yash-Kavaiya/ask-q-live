import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { VoiceService } from '../services/voice.service';
import { Question } from '../models/qa.models';

@Component({
  selector: 'app-teleprompter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, SlicePipe],
  template: `
    <div class="space-y-6">
      
      <!-- Presenter Header & Speech Settings Bar -->
      <div class="bg-white rounded-2xl p-5 border border-[#E0E2EC] shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[#0842A0] text-white flex items-center justify-center">
            <mat-icon class="text-xl">live_tv</mat-icon>
          </div>
          <div>
            <h2 class="font-display font-bold text-lg text-[#1F1F1F]">Presenter Teleprompter</h2>
            <p class="text-xs text-[#747775]">
              Real-time time-decay queue • High-contrast stage typography • Auditory speech synthesis
            </p>
          </div>
        </div>

        <!-- Voice & Rate Controls -->
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <!-- Voice Selector -->
          @if (voiceService.voices().length > 0) {
            <div class="flex items-center gap-1.5 text-[#444746]">
              <mat-icon class="text-sm">record_voice_over</mat-icon>
              <select
                id="select-speech-voice"
                (change)="onVoiceChange($event)"
                class="bg-[#F8F9FA] border border-[#E0E2EC] rounded-lg px-2 py-1 text-xs text-[#1F1F1F] outline-none max-w-[160px] truncate cursor-pointer"
              >
                @for (v of voiceService.voices(); track v.name) {
                  <option [value]="v.name" [selected]="v.name === voiceService.selectedVoice()?.name">
                    {{ v.name }}
                  </option>
                }
              </select>
            </div>
          }

          <!-- Speed slider -->
          <div class="flex items-center gap-1.5 text-[#444746] bg-[#F8F9FA] px-2.5 py-1 rounded-lg border border-[#E0E2EC]">
            <mat-icon class="text-sm">speed</mat-icon>
            <span>Rate: {{ voiceService.rate() }}x</span>
            <input
              id="slider-voice-rate"
              type="range"
              min="0.8"
              max="1.6"
              step="0.1"
              [value]="voiceService.rate()"
              (input)="onRateChange($event)"
              class="w-16 accent-[#1A73E8] cursor-pointer"
            />
          </div>

          <!-- Timer Reset -->
          <button
            type="button"
            (click)="resetTimer()"
            class="px-2.5 py-1 rounded-lg bg-[#F1F3F4] hover:bg-[#E0E2EC] text-[#444746] font-medium flex items-center gap-1 cursor-pointer"
            title="Reset question timer"
          >
            <mat-icon class="text-xs">replay</mat-icon>
            <span>Timer: {{ formattedTimer() }}</span>
          </button>
        </div>
      </div>

      <!-- Main Stage Spotlight Card -->
      @if (currentSpotlight(); as q) {
        <div
          id="teleprompter-spotlight-card"
          class="bg-white rounded-3xl p-6 sm:p-10 border-2 border-[#1A73E8] shadow-md transition-all relative overflow-hidden"
        >
          <!-- Top Accent Ribbon -->
          <div class="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-[#1A73E8] via-[#185ABC] to-[#1E8E3E]"></div>

          <div class="flex items-center justify-between gap-3 flex-wrap mb-4 pt-1">
            <div class="flex items-center gap-2 text-xs">
              <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#E8F0FE] text-[#1A73E8] font-bold border border-[#D2E3FC] uppercase tracking-wider">
                <mat-icon class="text-xs animate-pulse">mic</mat-icon>
                Active On Stage
              </span>
              <span class="px-2.5 py-0.5 rounded-md bg-[#F1F3F4] text-[#444746] font-medium border border-[#E0E2EC]">
                {{ q.category || 'General' }}
              </span>
              <span class="font-mono font-bold text-[#1A73E8]">
                ▲ {{ q.upvotes }} Upvotes
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs text-[#747775]">Speaker Time:</span>
              <span class="font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg bg-[#F8F9FA] border border-[#E0E2EC] text-[#1F1F1F]">
                {{ formattedTimer() }}
              </span>
            </div>
          </div>

          <!-- Huge Stage Headline Text -->
          <h1 class="font-display font-bold text-2xl sm:text-4xl text-[#1F1F1F] leading-tight tracking-tight mb-6">
            "{{ q.content }}"
          </h1>

          <!-- Author & Metadata -->
          <div class="flex items-center gap-2 text-xs text-[#747775] mb-6">
            <span class="font-medium text-[#1F1F1F]">{{ q.isAnonymous ? 'Anonymous Attendee' : q.authorName }}</span>
            <span>•</span>
            <span>Submitted {{ q.createdAt | slice:11:16 }}</span>
            @if (q.clusterCount) {
              <span>•</span>
              <span class="text-[#B06000] font-semibold">+{{ q.clusterCount }} duplicate questions merged</span>
            }
          </div>

          <!-- Structured 2-Line AI Keynote Prompt -->
          @if (q.aiLine1) {
            <div class="p-5 rounded-2xl bg-[#F8F9FA] border-l-4 border-l-[#1A73E8] border border-[#E0E2EC] mb-6 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 text-xs font-bold text-[#1A73E8]">
                  <mat-icon class="text-base">lightbulb</mat-icon>
                  <span>Gemini Grounded Talking Points (2-Line Takeaway)</span>
                </div>
                @if (q.aiConfidence) {
                  <span class="text-[11px] font-mono font-bold text-[#137333]">
                    {{ (q.aiConfidence * 100).toFixed(0) }}% Confidence
                  </span>
                }
              </div>
              <p class="text-sm sm:text-base font-semibold text-[#1F1F1F] leading-snug">
                1. {{ q.aiLine1 }}
              </p>
              @if (q.aiLine2) {
                <p class="text-xs sm:text-sm text-[#444746] leading-relaxed">
                  2. {{ q.aiLine2 }}
                </p>
              }
            </div>
          }

          <!-- Stage Actions Toolbar -->
          <div class="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-[#E0E2EC]">
            
            <!-- Auditory Web Speech Trigger -->
            <button
              id="btn-teleprompter-speak"
              type="button"
              (click)="speakCurrent(q)"
              class="px-5 py-2.5 rounded-xl font-display font-semibold text-sm flex items-center gap-2 cursor-pointer transition-all border"
              [class.bg-[#1A73E8]]="voiceService.isSpeaking()"
              [class.text-white]="voiceService.isSpeaking()"
              [class.border-[#1A73E8]]="voiceService.isSpeaking()"
              [class.bg-[#F8F9FA]]="!voiceService.isSpeaking()"
              [class.text-[#1F1F1F]]="!voiceService.isSpeaking()"
              [class.border-[#E0E2EC]]="!voiceService.isSpeaking()"
              [class.hover:bg-[#E8F0FE]]="!voiceService.isSpeaking()"
            >
              @if (voiceService.isSpeaking()) {
                <mat-icon class="text-lg">stop</mat-icon>
                <span>Stop Speech</span>
              } @else {
                <mat-icon class="text-lg">volume_up</mat-icon>
                <span>Read 2-Line Answer Aloud</span>
              }
            </button>

            <!-- Complete / Mark Answered & Next -->
            <div class="flex items-center gap-2 ml-auto">
              <button
                id="btn-teleprompter-skip"
                type="button"
                (click)="advanceNext(false)"
                class="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#444746] hover:bg-[#F1F3F4] cursor-pointer"
              >
                Skip / Next
              </button>

              <button
                id="btn-teleprompter-finish"
                type="button"
                (click)="markAnswered(q.id)"
                class="px-6 py-2.5 rounded-xl font-display font-semibold text-sm text-white bg-[#1E8E3E] hover:bg-[#137333] active:bg-[#0D652D] shadow-xs flex items-center gap-2 cursor-pointer transition-all"
              >
                <mat-icon class="text-lg">check_circle</mat-icon>
                <span>Mark Answered &amp; Advance</span>
              </button>
            </div>
          </div>

        </div>
      } @else {
        <!-- Empty State -->
        <div class="bg-white rounded-3xl p-12 text-center border border-[#E0E2EC] shadow-xs">
          <div class="w-14 h-14 rounded-2xl bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center mx-auto mb-4">
            <mat-icon class="text-3xl">done_all</mat-icon>
          </div>
          <h3 class="font-display font-bold text-xl text-[#1F1F1F] mb-1">
            All Queued Questions Addressed!
          </h3>
          <p class="text-xs sm:text-sm text-[#747775] max-w-md mx-auto mb-6">
            There are no active inquiries waiting in the time-decay teleprompter queue. You can pick any question from the queue below or wait for new audience submissions.
          </p>
          <button
            type="button"
            (click)="qaService.simulateTraffic()"
            class="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#1A73E8] hover:bg-[#185ABC] cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
          >
            <mat-icon class="text-sm">bolt</mat-icon>
            <span>Simulate Audience Question</span>
          </button>
        </div>
      }

      <!-- Upcoming Decay Queue List -->
      <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs">
        <div class="flex items-center justify-between pb-4 border-b border-[#E0E2EC] mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center">
              <mat-icon class="text-lg">queue</mat-icon>
            </div>
            <div>
              <h3 class="font-display font-bold text-base text-[#1F1F1F]">Time-Decay Priority Queue</h3>
              <p class="text-xs text-[#747775]">
                Formula: Score(q) = (Upvotes - 1) / (ElapsedMinutes + 2)^1.5
              </p>
            </div>
          </div>
          <span class="text-xs font-mono font-bold text-[#747775]">
            {{ upcomingQueue().length }} in Queue
          </span>
        </div>

        <div class="space-y-3">
          @for (item of upcomingQueue(); track item.id) {
            <button
              [id]="'queue-item-' + item.id"
              type="button"
              class="w-full text-left p-4 rounded-xl border border-[#E0E2EC] hover:border-[#1A73E8] hover:bg-[#F8F9FA] transition-all flex items-center justify-between gap-4 cursor-pointer group"
              (click)="selectSpotlight(item)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-[#E8F0FE] text-[#1A73E8] flex flex-col items-center justify-center shrink-0 border border-[#D2E3FC]" [class.bg-[#FEF7E0]]="item.upvotes >= 3" [class.text-[#B06000]]="item.upvotes >= 3" [class.border-[#FEEFC3]]="item.upvotes >= 3">
                  <span class="text-[10px] font-bold">▲</span>
                  <span class="font-mono text-xs font-bold -mt-0.5">{{ item.upvotes }}</span>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span class="text-xs font-medium text-[#747775]">{{ item.authorName }}</span>
                    <span class="px-2 py-0.2 rounded text-[10px] font-semibold bg-[#F1F3F4] text-[#444746]">
                      {{ item.category || 'General' }}
                    </span>
                    @if (item.upvotes >= 3) {
                      <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#FEF7E0] text-[#B06000] border border-[#FEEFC3] flex items-center gap-0.5">
                        <mat-icon class="text-[10px]">local_fire_department</mat-icon>
                        Popular ({{ item.upvotes }})
                      </span>
                    }
                  </div>
                  <p class="font-display font-semibold text-sm text-[#1F1F1F] truncate group-hover:text-[#1A73E8] transition-colors">
                    {{ item.content }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <span
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E0E2EC] group-hover:bg-[#1A73E8] group-hover:text-white group-hover:border-[#1A73E8] transition-all"
                >
                  Spotlight
                </span>
              </div>
            </button>
          } @empty {
            <p class="text-xs text-[#747775] text-center py-6">
              No additional upcoming questions in the queue.
            </p>
          }
        </div>
      </div>

    </div>
  `,
})
export class Teleprompter implements OnInit, OnDestroy {
  public qaService = inject(QaService);
  public voiceService = inject(VoiceService);

  public manuallySelectedSpotlight = signal<Question | null>(null);
  public elapsedSeconds = signal<number>(0);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public currentSpotlight = computed<Question | null>(() => {
    // If user clicked a specific question
    const manual = this.manuallySelectedSpotlight();
    if (manual) {
      const live = this.qaService.questions().find(q => q.id === manual.id);
      if (live && live.status !== 'ANSWERED') return live;
    }

    // Otherwise check if any question has status 'ANSWERING'
    const answering = this.qaService.questions().find(q => q.status === 'ANSWERING');
    if (answering) return answering;

    // Otherwise take first from teleprompter queue
    const queue = this.qaService.teleprompterQuestions();
    return queue.length > 0 ? queue[0] : null;
  });

  public upcomingQueue = computed<Question[]>(() => {
    const current = this.currentSpotlight();
    return this.qaService.teleprompterQuestions().filter(q => q.id !== current?.id);
  });

  public formattedTimer = computed(() => {
    const s = this.elapsedSeconds();
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  });

  public ngOnInit(): void {
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds.update(s => s + 1);
    }, 1000);
  }

  public ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  public resetTimer(): void {
    this.elapsedSeconds.set(0);
  }

  public selectSpotlight(q: Question): void {
    this.manuallySelectedSpotlight.set(q);
    this.qaService.updateQuestionStatus(q.id, 'ANSWERING');
    this.resetTimer();
  }

  public speakCurrent(q: Question): void {
    const l1 = q.aiLine1 || q.content;
    const l2 = q.aiLine2 || '';
    this.voiceService.speakTwoLineAnswer(q.id, l1, l2);
  }

  public onVoiceChange(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const found = this.voiceService.voices().find(v => v.name === name);
    if (found) {
      this.voiceService.setVoice(found);
    }
  }

  public onRateChange(event: Event): void {
    const r = parseFloat((event.target as HTMLInputElement).value);
    this.voiceService.setRate(r);
  }

  public async markAnswered(questionId: string): Promise<void> {
    this.voiceService.stop();
    await this.qaService.updateQuestionStatus(questionId, 'ANSWERED');
    this.manuallySelectedSpotlight.set(null);
    this.resetTimer();
    this.qaService.showToast('Question marked answered! Advanced teleprompter.');
  }

  public advanceNext(markCurrentAnswered = false): void {
    const curr = this.currentSpotlight();
    if (curr && markCurrentAnswered) {
      this.markAnswered(curr.id);
      return;
    }
    const up = this.upcomingQueue();
    if (up.length > 0) {
      this.selectSpotlight(up[0]);
    } else {
      this.manuallySelectedSpotlight.set(null);
    }
  }
}
