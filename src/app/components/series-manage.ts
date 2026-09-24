import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { Segment, SegmentType } from '../models/qa.models';

type TalkDraftField =
  | 'title'
  | 'speakerName'
  | 'speakerRole'
  | 'speakerBio'
  | 'email'
  | 'sessionDescription'
  | 'speakerX'
  | 'speakerLinkedIn'
  | 'speakerWebsite'
  | 'durationMinutes'
  | 'type'
  | 'groundingContext';

@Component({
  selector: 'app-series-manage',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div id="series-manage-container" class="space-y-6 max-w-4xl mx-auto animate-fade-in">
      @if (!qaService.isOrganizer()) {
        <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <mat-icon class="text-4xl text-slate-300 mb-2">lock</mat-icon>
          <h2 class="font-display font-bold text-lg text-slate-900">Organizer only</h2>
          <p class="text-sm text-slate-500 mt-1">
            Series Manage is for the host. Speakers use Run of Show and Teleprompter for their talk.
          </p>
        </div>
      } @else if (!qaService.currentSeries()) {
        <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
          <mat-icon class="text-4xl text-slate-300">view_timeline</mat-icon>
          <h2 class="font-display font-bold text-lg text-slate-900">No series loaded</h2>
          <p class="text-sm text-slate-500">
            Manage is for multi-speaker workshops. Open a series room, or create one from Host Studio.
          </p>
          <button
            type="button"
            (click)="qaService.leaveSessionToHostStudio()"
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
          >
            <mat-icon class="text-sm">home</mat-icon>
            Host Studio
          </button>
        </div>
      } @else {
        <!-- Header -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <mat-icon class="text-xs mr-1">settings</mat-icon> Manage Series
                </span>
                <span class="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                  #{{ qaService.currentSeries()?.joinCode }}
                </span>
              </div>
              <h2 class="text-2xl font-bold text-slate-900 tracking-tight">
                {{ qaService.currentSeries()?.title }}
              </h2>
              <p class="text-sm text-slate-500 mt-1">
                Edit series settings and every talk — title, speaker, invites, socials, grounding — or delete a talk (confirmed twice).
              </p>
            </div>
            <div class="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                (click)="shareAudience()"
                class="inline-flex items-center px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl cursor-pointer"
              >
                <mat-icon class="text-sm mr-1.5">qr_code_2</mat-icon> Share Audience
              </button>
              <button
                type="button"
                (click)="qaService.navigateToTab('series-control')"
                class="inline-flex items-center px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer"
              >
                <mat-icon class="text-sm mr-1.5">theater_comedy</mat-icon> Run of Show
              </button>
            </div>
          </div>
        </div>

        <!-- Series details + Gemini -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <h3 class="font-display font-bold text-base text-slate-900 flex items-center gap-2">
            <mat-icon class="text-indigo-600">edit_note</mat-icon>
            Series details
          </h3>
          <form [formGroup]="seriesForm" (ngSubmit)="saveSeriesDetails()" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Title</label>
              <input
                type="text"
                formControlName="title"
                class="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                formControlName="description"
                rows="2"
                class="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              ></textarea>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Series grounding context</label>
              <textarea
                formControlName="contextData"
                rows="3"
                placeholder="Shared event context for Gemini across all talks…"
                class="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono text-xs"
              ></textarea>
            </div>
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <label class="block text-xs font-bold text-amber-950 uppercase tracking-wider">
                Host Gemini API key (optional)
              </label>
              <div class="relative">
                <input
                  [type]="showGeminiKey() ? 'text' : 'password'"
                  formControlName="geminiApiKey"
                  placeholder="Leave blank to keep current / use platform key"
                  class="w-full pr-10 px-3 py-2.5 text-sm border border-amber-200 rounded-xl bg-white focus:ring-2 focus:ring-amber-400 focus:outline-hidden font-mono text-xs"
                />
                <button
                  type="button"
                  (click)="showGeminiKey.set(!showGeminiKey())"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center text-amber-700 cursor-pointer"
                >
                  <mat-icon class="text-base">{{ showGeminiKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </div>
              <p class="text-[11px] text-amber-900/80">
                Only sent when you paste a new key. Blank field does not clear the existing key.
              </p>
            </div>
            <div class="flex justify-end">
              <button
                type="submit"
                [disabled]="seriesForm.invalid || isSavingSeries()"
                class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <mat-icon class="text-sm">save</mat-icon>
                Save series
              </button>
            </div>
          </form>
        </div>

        <!-- Speakers — full edit + delete -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <mat-icon class="text-indigo-600">record_voice_over</mat-icon>
                Speakers, socials &amp; session blurbs
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                Edit talk title, speaker, duration, grounding, invites, and socials. Delete requires two confirmations.
              </p>
            </div>
            <button
              type="button"
              (click)="addTalk()"
              [disabled]="isAddingTalk()"
              class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl cursor-pointer disabled:opacity-50"
            >
              <mat-icon class="text-sm">add</mat-icon>
              Add talk
            </button>
          </div>

          @if (qaService.segments().length === 0) {
            <div class="text-center py-8 rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
              <p class="text-sm text-slate-600">No talks yet. Add a talk above.</p>
            </div>
          } @else {
            <div class="space-y-4">
              @for (seg of qaService.segments(); track seg.id; let i = $index) {
                <div
                  class="p-4 rounded-xl border space-y-3"
                  [class.border-red-300]="deleteStep(seg.id) > 0"
                  [class.bg-red-50/40]="deleteStep(seg.id) > 0"
                  [class.border-slate-200]="deleteStep(seg.id) === 0"
                  [class.bg-slate-50/50]="deleteStep(seg.id) === 0"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Talk {{ i + 1 }} · {{ seg.status }}
                      @if (seg.id === 'general') {
                        <span class="ml-1 text-amber-700">(lobby)</span>
                      }
                    </div>
                    <button
                      type="button"
                      (click)="qaService.copySpeakerLink(seg)"
                      class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer shrink-0"
                    >
                      <mat-icon class="text-sm">link</mat-icon>
                      Speaker Link
                    </button>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div class="sm:col-span-2">
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Talk title
                      </label>
                      <input
                        type="text"
                        [value]="draft(seg.id, 'title', seg.title)"
                        (input)="setDraft(seg.id, 'title', $any($event.target).value)"
                        class="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Speaker name
                      </label>
                      <input
                        type="text"
                        [value]="draft(seg.id, 'speakerName', seg.speakerName)"
                        (input)="setDraft(seg.id, 'speakerName', $any($event.target).value)"
                        class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Speaker role / title
                      </label>
                      <input
                        type="text"
                        [value]="draft(seg.id, 'speakerRole', seg.speakerRole)"
                        (input)="setDraft(seg.id, 'speakerRole', $any($event.target).value)"
                        placeholder="e.g. Staff Engineer"
                        class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Type
                      </label>
                      <select
                        [value]="draft(seg.id, 'type', seg.type || 'TALK')"
                        (change)="setDraft(seg.id, 'type', $any($event.target).value)"
                        class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      >
                        <option value="TALK">Talk</option>
                        <option value="PANEL">Panel</option>
                        <option value="BREAK">Break</option>
                        <option value="LOBBY">Lobby</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Duration (minutes)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="480"
                        [value]="draft(seg.id, 'durationMinutes', durationText(seg))"
                        (input)="setDraft(seg.id, 'durationMinutes', $any($event.target).value)"
                        class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Speaker bio
                    </label>
                    <textarea
                      rows="2"
                      [value]="draft(seg.id, 'speakerBio', seg.speakerBio)"
                      (input)="setDraft(seg.id, 'speakerBio', $any($event.target).value)"
                      placeholder="Short bio shown on the lobby…"
                      class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                    ></textarea>
                  </div>

                  <div>
                    <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Invite Gmail
                    </label>
                    <input
                      type="email"
                      [value]="draft(seg.id, 'email', seg.speakerEmail)"
                      (input)="setDraft(seg.id, 'email', $any($event.target).value)"
                      placeholder="speaker@gmail.com"
                      class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Session description
                    </label>
                    <textarea
                      rows="2"
                      [value]="draft(seg.id, 'sessionDescription', seg.sessionDescription || seg.topicSummary)"
                      (input)="setDraft(seg.id, 'sessionDescription', $any($event.target).value)"
                      placeholder="What this talk covers for the audience…"
                      class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                    ></textarea>
                  </div>

                  <div>
                    <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Talk grounding (Gemini)
                    </label>
                    <textarea
                      rows="3"
                      [value]="draft(seg.id, 'groundingContext', seg.groundingContext || seg.contextData)"
                      (input)="setDraft(seg.id, 'groundingContext', $any($event.target).value)"
                      placeholder="Speaker notes / deck text for AI answers…"
                      class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none font-mono"
                    ></textarea>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        X (Twitter)
                      </label>
                      <input
                        type="text"
                        [value]="draft(seg.id, 'speakerX', seg.speakerX)"
                        (input)="setDraft(seg.id, 'speakerX', $any($event.target).value)"
                        placeholder="@handle or url"
                        class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        LinkedIn
                      </label>
                      <input
                        type="text"
                        [value]="draft(seg.id, 'speakerLinkedIn', seg.speakerLinkedIn)"
                        (input)="setDraft(seg.id, 'speakerLinkedIn', $any($event.target).value)"
                        placeholder="linkedin.com/in/…"
                        class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Website
                      </label>
                      <input
                        type="text"
                        [value]="draft(seg.id, 'speakerWebsite', seg.speakerWebsite)"
                        (input)="setDraft(seg.id, 'speakerWebsite', $any($event.target).value)"
                        placeholder="https://…"
                        class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <!-- Double-confirm delete banner -->
                  @if (deleteStep(seg.id) === 1) {
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p class="text-xs text-amber-950 font-medium">
                        Delete <strong>{{ seg.title }}</strong>? Click confirm again to proceed.
                      </p>
                      <div class="flex gap-2 shrink-0">
                        <button
                          type="button"
                          (click)="cancelDelete(seg.id)"
                          class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          (click)="requestDelete(seg)"
                          class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                        >
                          Yes — confirm again
                        </button>
                      </div>
                    </div>
                  } @else if (deleteStep(seg.id) === 2) {
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-red-50 border border-red-300">
                      <p class="text-xs text-red-950 font-medium">
                        Final confirmation: permanently remove this talk? Questions must be moved first if any exist.
                      </p>
                      <div class="flex gap-2 shrink-0">
                        <button
                          type="button"
                          (click)="cancelDelete(seg.id)"
                          class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          (click)="confirmDelete(seg)"
                          [disabled]="deletingSegId() === seg.id"
                          class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white cursor-pointer disabled:opacity-50"
                        >
                          Delete permanently
                        </button>
                      </div>
                    </div>
                  }

                  <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      (click)="requestDelete(seg)"
                      [disabled]="seg.id === 'general' || deletingSegId() === seg.id"
                      class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      [title]="seg.id === 'general' ? 'Lobby segment cannot be deleted' : 'Delete this talk'"
                    >
                      <mat-icon class="text-sm">delete</mat-icon>
                      Delete talk
                    </button>
                    <button
                      type="button"
                      (click)="saveTalk(seg)"
                      [disabled]="savingSegId() === seg.id"
                      class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <mat-icon class="text-sm">save</mat-icon>
                      Save talk
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class SeriesManage implements OnInit, OnDestroy {
  public qaService = inject(QaService);
  private fb = inject(FormBuilder);

  public showGeminiKey = signal(false);
  public isSavingSeries = signal(false);
  public isAddingTalk = signal(false);
  public savingSegId = signal<string | null>(null);
  public deletingSegId = signal<string | null>(null);
  /** 0 = idle, 1 = first confirm, 2 = final confirm */
  public deleteSteps = signal<Record<string, 0 | 1 | 2>>({});
  public drafts = signal<Record<string, string>>({});
  private deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public seriesForm = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    contextData: [''],
    geminiApiKey: [''],
  });

  ngOnInit(): void {
    const series = this.qaService.currentSeries();
    if (series) {
      this.seriesForm.patchValue({
        title: series.title || '',
        description: series.description || '',
        contextData: series.contextData || series.seriesContextData || '',
        geminiApiKey: '',
      });
    }
  }

  ngOnDestroy(): void {
    for (const t of this.deleteTimers.values()) clearTimeout(t);
    this.deleteTimers.clear();
  }

  public draft(segId: string, field: TalkDraftField, fallback?: string | null): string {
    const key = `${segId}:${field}`;
    const map = this.drafts();
    if (key in map) return map[key];
    return fallback || '';
  }

  public setDraft(segId: string, field: TalkDraftField, value: string): void {
    const key = `${segId}:${field}`;
    this.drafts.update((m) => ({ ...m, [key]: value }));
  }

  public durationText(seg: Segment): string {
    return `${seg.durationMinutes || seg.scheduledDurationMinutes || 45}`;
  }

  public deleteStep(segId: string): 0 | 1 | 2 {
    return this.deleteSteps()[segId] || 0;
  }

  public shareAudience(): void {
    const series = this.qaService.currentSeries();
    if (!series) return;
    this.qaService.openShareModal(series.joinCode, series.title, 'series', series.description);
  }

  public async saveSeriesDetails(): Promise<void> {
    if (this.seriesForm.invalid) return;
    this.isSavingSeries.set(true);
    const v = this.seriesForm.value;
    const payload: {
      title: string;
      description?: string;
      contextData?: string;
      geminiApiKey?: string;
    } = {
      title: v.title || '',
      description: v.description || '',
      contextData: v.contextData || '',
    };
    const key = (v.geminiApiKey || '').trim();
    if (key) payload.geminiApiKey = key;

    const ok = await this.qaService.updateSeries(payload);
    this.isSavingSeries.set(false);
    if (ok) {
      this.seriesForm.patchValue({ geminiApiKey: '' });
    }
  }

  public async addTalk(): Promise<void> {
    this.isAddingTalk.set(true);
    const n = (this.qaService.segments()?.length || 0) + 1;
    await this.qaService.addSegment({
      title: `Talk ${n}`,
      speakerName: 'Featured Speaker',
      type: 'TALK',
      durationMinutes: 45,
    });
    this.isAddingTalk.set(false);
  }

  public async saveTalk(seg: Segment): Promise<void> {
    const title = this.draft(seg.id, 'title', seg.title).trim();
    const speakerName = this.draft(seg.id, 'speakerName', seg.speakerName).trim();
    const speakerRole = this.draft(seg.id, 'speakerRole', seg.speakerRole).trim();
    const speakerBio = this.draft(seg.id, 'speakerBio', seg.speakerBio).trim();
    const email = this.draft(seg.id, 'email', seg.speakerEmail).trim().toLowerCase();
    const sessionDescription = this.draft(
      seg.id,
      'sessionDescription',
      seg.sessionDescription || seg.topicSummary
    ).trim();
    const groundingContext = this.draft(
      seg.id,
      'groundingContext',
      seg.groundingContext || seg.contextData
    ).trim();
    const speakerX = this.draft(seg.id, 'speakerX', seg.speakerX).trim();
    const speakerLinkedIn = this.draft(seg.id, 'speakerLinkedIn', seg.speakerLinkedIn).trim();
    const speakerWebsite = this.draft(seg.id, 'speakerWebsite', seg.speakerWebsite).trim();
    const type = (this.draft(seg.id, 'type', seg.type || 'TALK') || 'TALK') as SegmentType;
    const durationRaw = Number(this.draft(seg.id, 'durationMinutes', this.durationText(seg)));
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw >= 5 ? Math.round(durationRaw) : 45;

    if (!title || !speakerName) {
      this.qaService.showToast('Talk title and speaker name are required');
      return;
    }

    this.savingSegId.set(seg.id);
    const ok = await this.qaService.updateSegment(seg.id, {
      title,
      speakerName,
      speakerRole,
      speakerBio,
      speakerEmail: email,
      sessionDescription,
      topicSummary: sessionDescription,
      groundingContext,
      contextData: groundingContext,
      speakerX,
      speakerLinkedIn,
      speakerWebsite,
      type,
      durationMinutes,
      scheduledDurationMinutes: durationMinutes,
    });
    this.savingSegId.set(null);
    if (!ok) {
      this.qaService.showToast(this.qaService.errorMessage() || 'Could not save talk');
    }
  }

  public requestDelete(seg: Segment): void {
    if (seg.id === 'general') {
      this.qaService.showToast('Cannot delete the series lobby segment');
      return;
    }
    const current = this.deleteStep(seg.id);
    const next = (current === 0 ? 1 : current === 1 ? 2 : 2) as 1 | 2;
    this.deleteSteps.update((m) => ({ ...m, [seg.id]: next }));
    this.armDeleteTimeout(seg.id);
  }

  public cancelDelete(segId: string): void {
    this.clearDeleteTimeout(segId);
    this.deleteSteps.update((m) => {
      const next = { ...m };
      delete next[segId];
      return next;
    });
  }

  public async confirmDelete(seg: Segment): Promise<void> {
    if (this.deleteStep(seg.id) !== 2) {
      this.requestDelete(seg);
      return;
    }
    this.deletingSegId.set(seg.id);
    const ok = await this.qaService.deleteSegment(seg.id);
    this.deletingSegId.set(null);
    this.cancelDelete(seg.id);
    if (ok) {
      // Drop drafts for removed segment
      this.drafts.update((m) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!k.startsWith(`${seg.id}:`)) next[k] = v;
        }
        return next;
      });
    }
  }

  private armDeleteTimeout(segId: string): void {
    this.clearDeleteTimeout(segId);
    this.deleteTimers.set(
      segId,
      setTimeout(() => this.cancelDelete(segId), 12_000)
    );
  }

  private clearDeleteTimeout(segId: string): void {
    const t = this.deleteTimers.get(segId);
    if (t) clearTimeout(t);
    this.deleteTimers.delete(segId);
  }
}
