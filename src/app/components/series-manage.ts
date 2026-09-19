import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { Segment } from '../models/qa.models';

type SpeakerDraftField = 'email' | 'sessionDescription' | 'speakerX' | 'speakerLinkedIn' | 'speakerWebsite';

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
                Series settings, speaker invites, and audience share — without leaving the room.
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

          <div class="flex flex-wrap gap-2">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-50 border border-slate-200 text-slate-600">
              <mat-icon class="text-xs">key</mat-icon> Gemini key
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-50 border border-slate-200 text-slate-600">
              <mat-icon class="text-xs">mail</mat-icon> Speaker Gmail
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-50 border border-slate-200 text-slate-600">
              <mat-icon class="text-xs">share</mat-icon> X · LinkedIn · Web
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-50 border border-slate-200 text-slate-600">
              <mat-icon class="text-xs">notes</mat-icon> Session description
            </span>
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

        <!-- Speakers & invites -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <mat-icon class="text-indigo-600">record_voice_over</mat-icon>
                Speakers, socials &amp; session blurbs
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                Invite Gmail, X / LinkedIn / website, and a public description for each talk.
              </p>
            </div>
            <button
              type="button"
              (click)="qaService.navigateToTab('series-control')"
              class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl cursor-pointer"
            >
              <mat-icon class="text-sm">add</mat-icon>
              Add / edit talks
            </button>
          </div>

          @if (qaService.segments().length === 0) {
            <div class="text-center py-8 rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
              <p class="text-sm text-slate-600">No talks yet. Add speakers from Run of Show.</p>
            </div>
          } @else {
            <div class="space-y-4">
              @for (seg of qaService.segments(); track seg.id; let i = $index) {
                <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Talk {{ i + 1 }} · {{ seg.status }}
                      </div>
                      <div class="font-semibold text-sm text-slate-900">{{ seg.title }}</div>
                      <div class="text-xs text-slate-500">{{ seg.speakerName }}</div>
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

                  <div class="flex justify-end pt-1">
                    <button
                      type="button"
                      (click)="saveSpeakerProfile(seg)"
                      [disabled]="savingSegId() === seg.id"
                      class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <mat-icon class="text-sm">save</mat-icon>
                      Save speaker profile
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
export class SeriesManage implements OnInit {
  public qaService = inject(QaService);
  private fb = inject(FormBuilder);

  public showGeminiKey = signal(false);
  public isSavingSeries = signal(false);
  public savingSegId = signal<string | null>(null);
  /** Per-segment draft fields keyed by `${segId}:${field}` */
  public drafts = signal<Record<string, string>>({});

  public seriesForm = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    geminiApiKey: [''],
  });

  ngOnInit(): void {
    const series = this.qaService.currentSeries();
    if (series) {
      this.seriesForm.patchValue({
        title: series.title || '',
        description: series.description || '',
        geminiApiKey: '',
      });
    }
  }

  public draft(segId: string, field: SpeakerDraftField, fallback?: string | null): string {
    const key = `${segId}:${field}`;
    const map = this.drafts();
    if (key in map) return map[key];
    return fallback || '';
  }

  public setDraft(segId: string, field: SpeakerDraftField, value: string): void {
    const key = `${segId}:${field}`;
    this.drafts.update(m => ({ ...m, [key]: value }));
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
    const payload: { title: string; description?: string; geminiApiKey?: string } = {
      title: v.title || '',
      description: v.description || '',
    };
    const key = (v.geminiApiKey || '').trim();
    if (key) payload.geminiApiKey = key;

    const ok = await this.qaService.updateSeries(payload);
    this.isSavingSeries.set(false);
    if (ok) {
      this.seriesForm.patchValue({ geminiApiKey: '' });
    }
  }

  public async saveSpeakerProfile(seg: Segment): Promise<void> {
    const email = this.draft(seg.id, 'email', seg.speakerEmail).trim().toLowerCase();
    const sessionDescription = this.draft(
      seg.id,
      'sessionDescription',
      seg.sessionDescription || seg.topicSummary
    ).trim();
    const speakerX = this.draft(seg.id, 'speakerX', seg.speakerX).trim();
    const speakerLinkedIn = this.draft(seg.id, 'speakerLinkedIn', seg.speakerLinkedIn).trim();
    const speakerWebsite = this.draft(seg.id, 'speakerWebsite', seg.speakerWebsite).trim();

    this.savingSegId.set(seg.id);
    const ok = await this.qaService.updateSegment(seg.id, {
      speakerEmail: email,
      sessionDescription,
      topicSummary: sessionDescription,
      speakerX,
      speakerLinkedIn,
      speakerWebsite,
    });
    this.savingSegId.set(null);
    if (!ok) {
      this.qaService.showToast(this.qaService.errorMessage() || 'Could not save speaker profile');
    }
  }
}
