import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Question, QuestionStatus } from '../models/qa.models';
import { QaService } from '../services/qa.service';
import { VoiceService } from '../services/voice.service';

@Component({
  selector: 'app-question-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, ReactiveFormsModule],
  template: `
    @let q = question();
    @if (q) {
      <article
        [id]="'question-card-' + q.id"
        class="bg-white rounded-2xl p-5 border transition-all duration-200 shadow-xs hover:shadow-sm"
        [class.border-[#1A73E8]]="q.status === 'ANSWERING'"
        [class.ring-2]="q.status === 'ANSWERING'"
        [class.ring-[#D2E3FC]]="q.status === 'ANSWERING'"
        [class.bg-[#F8F9FA]]="q.status === 'ANSWERED'"
        [class.border-[#E0E2EC]]="q.status !== 'ANSWERING'"
      >
        <div class="flex items-start gap-4">
          
          <!-- Upvote / Thumbs-up Button Column -->
          <div class="shrink-0 flex flex-col items-center">
            <button
              [id]="'btn-upvote-' + q.id"
              type="button"
              (click)="onUpvoteClick(q.id)"
              class="w-13 h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-150 cursor-pointer border select-none active:scale-95 group relative"
              [class.bg-[#E8F0FE]]="isUpvoted()"
              [class.border-[#1A73E8]]="isUpvoted()"
              [class.text-[#1A73E8]]="isUpvoted()"
              [class.shadow-xs]="isUpvoted()"
              [class.bg-[#F8F9FA]]="!isUpvoted()"
              [class.border-[#E0E2EC]]="!isUpvoted()"
              [class.text-[#444746]]="!isUpvoted()"
              [class.hover:border-[#1A73E8]]="!isUpvoted()"
              [class.hover:bg-[#E8F0FE]/60]="!isUpvoted()"
              [class.hover:text-[#1A73E8]]="!isUpvoted()"
              [title]="isUpvoted() ? 'Thumbs-up vote recorded. Click to remove vote' : 'Thumbs-up: Vote on this question to increase its popularity'"
              [attr.aria-label]="isUpvoted() ? 'Remove thumbs-up vote' : 'Thumbs-up vote on this question'"
            >
              <mat-icon
                class="text-xl transition-all duration-150 group-hover:scale-110"
                [class.-translate-y-0.5]="isUpvoted()"
                [class.text-[#1A73E8]]="isUpvoted()"
              >
                {{ isUpvoted() ? 'thumb_up' : 'thumb_up_off_alt' }}
              </mat-icon>
              <span
                class="font-mono font-bold text-xs tracking-tight"
                [class.text-[#1A73E8]]="isUpvoted()"
              >
                {{ q.upvotes }}
              </span>
              <span class="text-[9px] font-semibold uppercase tracking-wider opacity-75">
                {{ isUpvoted() ? 'Voted' : 'Vote' }}
              </span>
            </button>
          </div>

          <!-- Main Content Body -->
          <div class="flex-1 min-w-0">
            
            <!-- Metadata Top Row -->
            <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div class="flex items-center gap-2 text-xs flex-wrap">
                <!-- Author Avatar & Name -->
                <div class="flex items-center gap-1.5 font-medium text-[#1F1F1F]">
                  <div
                    class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0"
                    [style.background-color]="getAvatarColor(q.authorName)"
                  >
                    {{ q.isAnonymous ? '?' : q.authorName.charAt(0) }}
                  </div>
                  <span class="truncate max-w-[130px]">
                    {{ q.isAnonymous ? 'Anonymous' : q.authorName }}
                  </span>
                  @if (isAuthor()) {
                    <span class="px-1.5 py-0.2 rounded bg-[#E8F0FE] text-[#1A73E8] text-[10px] font-bold">YOU</span>
                  }
                </div>

                <span class="text-[#747775]">•</span>

                <!-- Speaker Tag if workshop series -->
                @if (q.speakerName) {
                  <span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-200/70 flex items-center gap-1">
                    <mat-icon class="text-xs">record_voice_over</mat-icon>
                    {{ q.speakerName }}
                  </span>
                  <span class="text-[#747775]">•</span>
                }

                <!-- Category Tag -->
                @if (q.category) {
                  <span class="px-2 py-0.5 rounded-md bg-[#F1F3F4] text-[#444746] text-[11px] font-medium border border-[#E0E2EC]">
                    {{ q.category }}
                  </span>
                }

                <span class="text-[#747775]">•</span>

                <!-- Time Elapsed -->
                <span class="text-[#747775] text-[11px]">{{ getRelativeTime(q.createdAt) }}</span>

                <!-- Popularity Rank or Crowd Favorite Priority Badge -->
                @if (showRank() && rank()) {
                  @if (rank() === 1) {
                    <span
                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold shadow-2xs"
                      title="#1 Most popular question by audience thumbs-up votes"
                    >
                      <mat-icon class="text-xs text-amber-700">workspace_premium</mat-icon>
                      #1 Most Popular ({{ q.upvotes }} votes)
                    </span>
                  } @else if (rank() === 2) {
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-bold"
                      title="#2 Popular question by audience thumbs-up votes"
                    >
                      <mat-icon class="text-xs text-slate-600">thumb_up</mat-icon>
                      #2 Popular ({{ q.upvotes }})
                    </span>
                  } @else if (rank() === 3) {
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold"
                      title="#3 Popular question by audience thumbs-up votes"
                    >
                      <mat-icon class="text-xs text-amber-600">thumb_up</mat-icon>
                      #3 Popular ({{ q.upvotes }})
                    </span>
                  } @else {
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F1F3F4] text-[#444746] border border-[#E0E2EC] text-[11px] font-medium font-mono"
                      title="Popularity Rank #{{ rank() }}"
                    >
                      #{{ rank() }} in Popularity
                    </span>
                  }
                } @else if (q.upvotes >= 3) {
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEF7E0] text-[#B06000] border border-[#FEEFC3] text-[11px] font-bold"
                    title="Popular question heavily upvoted by the audience and prioritized on the presenter teleprompter"
                  >
                    <mat-icon class="text-xs">local_fire_department</mat-icon>
                    Popular Topic ({{ q.upvotes }})
                  </span>
                }

                <!-- Semantic Cluster Merge Indicator -->
                @if (q.clusterCount && q.clusterCount > 0) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F3E8FD] text-[#6200EE] border border-[#E8DEF8] text-[11px] font-semibold" title="Multiple similar questions were automatically merged into this topic">
                    <mat-icon class="text-xs">merge_type</mat-icon>
                    +{{ q.clusterCount }} merged
                  </span>
                }
              </div>

              <!-- Status Badge -->
              <div class="flex items-center gap-1.5">
                @if (q.status === 'ANSWERING') {
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E8F0FE] text-[#1A73E8] border border-[#D2E3FC] text-xs font-bold animate-pulse">
                    <mat-icon class="text-xs">mic</mat-icon>
                    Answering Live
                  </span>
                } @else if (q.status === 'ANSWERED') {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6] text-xs font-semibold">
                    <mat-icon class="text-xs">check_circle</mat-icon>
                    Answered
                  </span>
                } @else if (q.status === 'PENDING_REVIEW') {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEF7E0] text-[#B06000] border border-[#FEEFC3] text-xs font-semibold">
                    <mat-icon class="text-xs">hourglass_top</mat-icon>
                    Pending Review
                  </span>
                }
              </div>
            </div>

            <!-- Question Text or Edit Form -->
            @if (isEditing()) {
              <div class="my-2 space-y-2">
                <textarea
                  [formControl]="editControl"
                  rows="2"
                  class="w-full p-2.5 bg-[#F8F9FA] border border-[#1A73E8] rounded-xl text-sm outline-none resize-none font-medium"
                ></textarea>
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    (click)="isEditing.set(false)"
                    class="px-3 py-1 rounded-lg text-xs font-semibold text-[#444746] hover:bg-[#F1F3F4] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    (click)="saveEdit(q.id)"
                    class="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-[#1A73E8] hover:bg-[#185ABC] cursor-pointer shadow-xs"
                  >
                    Save
                  </button>
                </div>
              </div>
            } @else {
              <p class="text-[#1F1F1F] text-sm sm:text-base font-normal leading-relaxed mb-3">
                {{ displayContent() }}
              </p>
            }

            <!-- Grounded RAG AI Answer Card -->
            @if (q.aiLine1 && q.aiStatus === 'READY') {
              <div class="mt-3 rounded-xl bg-[#F8F9FA] p-3.5 border-l-4 border-l-[#1A73E8] border border-[#E0E2EC] transition-all">
                
                <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div class="flex items-center gap-1.5 text-xs font-bold text-[#1A73E8]">
                    <mat-icon class="text-base">auto_awesome</mat-icon>
                    <span>Grounded RAG Answer</span>
                    <span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <mat-icon class="text-[10px]">menu_book</mat-icon>
                      Grounded on Deck
                    </span>
                  </div>

                  <div class="flex items-center gap-2">
                    <!-- Confidence Score Badge -->
                    @if (q.aiConfidence) {
                      <span
                        class="px-2 py-0.5 rounded text-[11px] font-mono font-bold"
                        [class.bg-[#E6F4EA]]="q.aiConfidence >= 0.9"
                        [class.text-[#137333]]="q.aiConfidence >= 0.9"
                        [class.bg-[#FEF7E0]]="q.aiConfidence < 0.9"
                        [class.text-[#B06000]]="q.aiConfidence < 0.9"
                      >
                        {{ (q.aiConfidence * 100).toFixed(0) }}% Conf
                      </span>
                    }

                    <!-- Audio Playback Button (Web Speech API) -->
                    <button
                      [id]="'btn-speech-' + q.id"
                      type="button"
                      (click)="speakAnswer(q.id, q.aiLine1, q.aiLine2)"
                      class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border"
                      [class.bg-[#1A73E8]]="isCurrentSpeaking(q.id)"
                      [class.text-white]="isCurrentSpeaking(q.id)"
                      [class.border-[#1A73E8]]="isCurrentSpeaking(q.id)"
                      [class.bg-white]="!isCurrentSpeaking(q.id)"
                      [class.text-[#444746]]="!isCurrentSpeaking(q.id)"
                      [class.border-[#E0E2EC]]="!isCurrentSpeaking(q.id)"
                      [class.hover:bg-[#E8F0FE]]="!isCurrentSpeaking(q.id)"
                      [title]="isCurrentSpeaking(q.id) ? 'Stop speaking' : 'Read 2-line answer aloud'"
                    >
                      @if (isCurrentSpeaking(q.id)) {
                        <div class="flex items-center gap-0.5 h-3">
                          <span class="w-1 bg-white rounded-full sound-bar-1"></span>
                          <span class="w-1 bg-white rounded-full sound-bar-2"></span>
                          <span class="w-1 bg-white rounded-full sound-bar-3"></span>
                        </div>
                        <span>Stop</span>
                      } @else {
                        <mat-icon class="text-sm">volume_up</mat-icon>
                        <span class="hidden sm:inline">Read Aloud</span>
                      }
                    </button>
                  </div>
                </div>

                <!-- 2-Line Structured Content -->
                <div class="text-xs space-y-1.5 text-[#1F1F1F]">
                  <div class="flex items-start gap-1.5">
                    <span class="font-bold text-[#1A73E8] shrink-0">1.</span>
                    <p class="font-medium leading-snug">{{ displayAiLine1() }}</p>
                  </div>
                  @if (q.aiLine2) {
                    <div class="flex items-start gap-1.5">
                      <span class="font-bold text-[#747775] shrink-0">2.</span>
                      <p class="text-[#444746] leading-snug">{{ displayAiLine2() }}</p>
                    </div>
                  }
                </div>

                <!-- Translation Controls & Regenerate -->
                <div class="mt-2.5 pt-2 border-t border-[#E0E2EC]/70 flex items-center justify-between text-xs flex-wrap gap-2">
                  <div class="flex items-center gap-1.5 text-[#747775]">
                    <mat-icon class="text-sm">translate</mat-icon>
                    <span>Translate:</span>
                    <select
                      (change)="onLanguageSelect(q.id, $event)"
                      class="bg-white border border-[#E0E2EC] rounded px-1.5 py-0.5 text-xs text-[#1F1F1F] outline-none cursor-pointer"
                    >
                      <option value="ORIGINAL">Original (English)</option>
                      <option value="Spanish">Español (Spanish)</option>
                      <option value="French">Français (French)</option>
                      <option value="German">Deutsch (German)</option>
                      <option value="Japanese">日本語 (Japanese)</option>
                      <option value="Chinese">中文 (Chinese)</option>
                      <option value="Hindi">हिन्दी (Hindi)</option>
                      <option value="Arabic">العربية (Arabic)</option>
                    </select>
                  </div>

                  <div class="flex items-center gap-2">
                    @if (isTranslating()) {
                      <span class="text-[11px] text-[#1A73E8] flex items-center gap-1">
                        <span class="w-2.5 h-2.5 border border-[#1A73E8] border-t-transparent rounded-full animate-spin"></span>
                        Translating...
                      </span>
                    }
                    <button
                      type="button"
                      (click)="requestRagAnswer(q.id)"
                      [disabled]="isGeneratingRag()"
                      class="text-[11px] text-slate-500 hover:text-[#1A73E8] flex items-center gap-1 cursor-pointer"
                      title="Re-synthesize answer using latest deck context"
                    >
                      <mat-icon class="text-xs">refresh</mat-icon>
                      <span>Re-synthesize RAG</span>
                    </button>
                  </div>
                </div>
              </div>
            } @else if (q.aiStatus === 'GENERATING' || isGeneratingRag()) {
              <div class="mt-2.5 p-3 rounded-xl bg-[#F8F9FA] border border-[#D2E3FC] flex items-center gap-2.5 text-xs text-[#1A73E8]">
                <span class="w-3.5 h-3.5 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin shrink-0"></span>
                <span>Synthesizing grounded RAG answer from presenter deck and session notes...</span>
              </div>
            } @else {
              <!-- Explicit RAG Synthesis Trigger for Unanswered Inquiries -->
              <div class="mt-2.5 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  (click)="requestRagAnswer(q.id)"
                  [disabled]="isGeneratingRag()"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#1A73E8] bg-[#E8F0FE] hover:bg-[#D2E3FC] active:bg-[#C2D7FA] transition-all cursor-pointer border border-[#D2E3FC]"
                  title="Synthesize a 2-line AI answer grounded in the speaker's presentation and notes"
                >
                  <mat-icon class="text-sm">auto_awesome</mat-icon>
                  <span>Synthesize Grounded RAG Answer</span>
                </button>
                @if (q.aiStatus === 'FAILED') {
                  <span class="text-[11px] text-amber-600 flex items-center gap-1">
                    <mat-icon class="text-xs">info</mat-icon>
                    <span>Could not synthesize answer. Click to retry.</span>
                  </span>
                }
              </div>
            }

            <!-- Bottom Action Row -->
            <div class="mt-3.5 pt-2.5 border-t border-[#E0E2EC]/60 flex items-center justify-between gap-2 flex-wrap">
              
              <!-- Left: Author Actions & Mobile Thumbs-Up -->
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Mobile Thumbs-Up Action Button -->
                <button
                  [id]="'btn-mobile-upvote-' + q.id"
                  type="button"
                  (click)="onUpvoteClick(q.id)"
                  class="inline-flex sm:hidden items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer select-none active:scale-95"
                  [class.bg-[#E8F0FE]]="isUpvoted()"
                  [class.text-[#1A73E8]]="isUpvoted()"
                  [class.border-[#1A73E8]]="isUpvoted()"
                  [class.bg-[#F8F9FA]]="!isUpvoted()"
                  [class.text-[#444746]]="!isUpvoted()"
                  [class.border-[#E0E2EC]]="!isUpvoted()"
                  title="Thumbs-up vote"
                >
                  <mat-icon class="text-sm">{{ isUpvoted() ? 'thumb_up' : 'thumb_up_off_alt' }}</mat-icon>
                  <span>{{ isUpvoted() ? 'Thumbs Up ✓' : 'Thumbs Up' }}</span>
                  <span class="font-mono font-bold">({{ q.upvotes }})</span>
                </button>

                @if (isAuthor() || qaService.isAdmin()) {
                  <button
                    type="button"
                    (click)="startEdit(q.content)"
                    class="p-1 rounded-md text-[#747775] hover:text-[#1F1F1F] hover:bg-[#F1F3F4] text-xs flex items-center gap-1 cursor-pointer"
                    title="Edit question"
                  >
                    <mat-icon class="text-sm">edit</mat-icon>
                    <span class="hidden sm:inline">Edit</span>
                  </button>

                  <button
                    type="button"
                    (click)="deleteQuestion(q.id)"
                    class="p-1 rounded-md text-[#747775] hover:text-[#D93025] hover:bg-[#FCE8E6] text-xs flex items-center gap-1 cursor-pointer"
                    title="Delete question"
                  >
                    <mat-icon class="text-sm">delete</mat-icon>
                    <span class="hidden sm:inline">Delete</span>
                  </button>
                }
              </div>

              <!-- Right: Admin / Presenter Moderation Controls -->
              @if (qaService.isAdmin()) {
                <div class="flex items-center gap-1.5 text-xs">
                  @if (q.status !== 'ANSWERING' && q.status !== 'ANSWERED') {
                    <button
                      type="button"
                      (click)="setStatus(q.id, 'ANSWERING')"
                      class="px-2.5 py-1 rounded-lg bg-[#E8F0FE] text-[#1A73E8] hover:bg-[#D2E3FC] font-semibold flex items-center gap-1 cursor-pointer border border-[#D2E3FC]"
                      title="Put this question into live presenter spotlight"
                    >
                      <mat-icon class="text-sm">podium</mat-icon>
                      <span>Answer Live</span>
                    </button>
                  }

                  @if (q.status === 'ANSWERING') {
                    <button
                      type="button"
                      (click)="setStatus(q.id, 'ANSWERED')"
                      class="px-2.5 py-1 rounded-lg bg-[#E6F4EA] text-[#137333] hover:bg-[#CEEAD6] font-semibold flex items-center gap-1 cursor-pointer border border-[#CEEAD6]"
                    >
                      <mat-icon class="text-sm">check</mat-icon>
                      <span>Mark Answered</span>
                    </button>
                  }

                  @if (q.status === 'PENDING_REVIEW') {
                    <button
                      type="button"
                      (click)="setStatus(q.id, 'APPROVED')"
                      class="px-2 py-1 rounded-lg bg-[#E6F4EA] text-[#137333] hover:bg-[#CEEAD6] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <mat-icon class="text-sm">done</mat-icon>
                      <span>Approve</span>
                    </button>

                    <button
                      type="button"
                      (click)="setStatus(q.id, 'REJECTED')"
                      class="px-2 py-1 rounded-lg bg-[#FCE8E6] text-[#D93025] hover:bg-[#F5C2C7] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <mat-icon class="text-sm">block</mat-icon>
                      <span>Reject</span>
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </article>
    }
  `,
})
export class QuestionCard {
  public question = input.required<Question>();
  public rank = input<number | undefined>(undefined);
  public showRank = input<boolean>(false);
  public qaService = inject(QaService);
  public voiceService = inject(VoiceService);

  public isEditing = signal<boolean>(false);
  public isTranslating = signal<boolean>(false);
  public isGeneratingRag = signal<boolean>(false);
  public translatedContent = signal<string | null>(null);
  public translatedAi1 = signal<string | null>(null);
  public translatedAi2 = signal<string | null>(null);

  public editControl = new FormControl('', [Validators.required]);

  public isUpvoted(): boolean {
    const q = this.question();
    return q ? this.qaService.userUpvotedIds().has(q.id) : false;
  }

  public isAuthor(): boolean {
    const q = this.question();
    return q ? q.clientFingerprint === this.qaService.userFingerprint() : false;
  }

  public isCurrentSpeaking(qId: string): boolean {
    return this.voiceService.isSpeaking() && this.voiceService.currentSpeakingId() === qId;
  }

  public displayContent(): string {
    return this.translatedContent() || this.question().content;
  }

  public displayAiLine1(): string {
    return this.translatedAi1() || this.question().aiLine1 || '';
  }

  public displayAiLine2(): string {
    return this.translatedAi2() || this.question().aiLine2 || '';
  }

  public onUpvoteClick(questionId: string): void {
    this.qaService.toggleUpvote(questionId);
  }

  public async requestRagAnswer(questionId: string): Promise<void> {
    this.isGeneratingRag.set(true);
    try {
      await this.qaService.requestRagAnswer(questionId);
    } finally {
      this.isGeneratingRag.set(false);
    }
  }

  public speakAnswer(questionId: string, line1?: string, line2?: string): void {
    if (!line1) return;
    const l1 = this.translatedAi1() || line1;
    const l2 = this.translatedAi2() || line2 || '';
    this.voiceService.speakTwoLineAnswer(questionId, l1, l2);
  }

  public async onLanguageSelect(questionId: string, event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    const lang = target.value;

    if (lang === 'ORIGINAL') {
      this.translatedContent.set(null);
      this.translatedAi1.set(null);
      this.translatedAi2.set(null);
      return;
    }

    this.isTranslating.set(true);
    const q = this.question();

    try {
      const [tContent, tAi1, tAi2] = await Promise.all([
        this.qaService.translateText(questionId + '-c', q.content, lang),
        q.aiLine1 ? this.qaService.translateText(questionId + '-a1', q.aiLine1, lang) : Promise.resolve(''),
        q.aiLine2 ? this.qaService.translateText(questionId + '-a2', q.aiLine2, lang) : Promise.resolve(''),
      ]);

      this.translatedContent.set(tContent);
      this.translatedAi1.set(tAi1);
      this.translatedAi2.set(tAi2);
    } finally {
      this.isTranslating.set(false);
    }
  }

  public startEdit(currentContent: string): void {
    this.editControl.setValue(currentContent);
    this.isEditing.set(true);
  }

  public async saveEdit(questionId: string): Promise<void> {
    if (this.editControl.invalid) return;
    const val = this.editControl.value || '';
    const ok = await this.qaService.editQuestionContent(questionId, val);
    if (ok) {
      this.isEditing.set(false);
    }
  }

  public deleteQuestion(questionId: string): void {
    if (confirm('Are you sure you want to delete this question?')) {
      this.qaService.deleteQuestion(questionId);
    }
  }

  public setStatus(questionId: string, status: QuestionStatus): void {
    this.qaService.updateQuestionStatus(questionId, status);
  }

  public getRelativeTime(isoString: string): string {
    const ms = Date.now() - new Date(isoString).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 45) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  public getAvatarColor(name: string): string {
    const colors = ['#1A73E8', '#185ABC', '#1E8E3E', '#F9AB00', '#D93025', '#9334E6', '#007B83', '#E37400'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
