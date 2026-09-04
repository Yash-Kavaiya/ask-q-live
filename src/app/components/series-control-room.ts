import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { Segment } from '../models/qa.models';

@Component({
  selector: 'app-series-control-room',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div id="series-control-room-container" class="space-y-6">
      <!-- Control Room Header -->
      <div id="control-room-header" class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <mat-icon class="text-xs mr-1">theater_comedy</mat-icon> Workshop Run of Show
              </span>
              @if (qaService.isOrganizer()) {
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <mat-icon class="text-xs mr-1">verified_user</mat-icon> Organizer Control Room
                </span>
              }
              @if (qaService.isSpeaker()) {
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <mat-icon class="text-xs mr-1">mic</mat-icon> Speaker Green Room
                </span>
              }
            </div>
            <h2 class="text-2xl font-bold text-slate-900 tracking-tight">
              {{ qaService.currentSeries()?.title || 'Workshop Session Series' }}
            </h2>
            <p class="text-sm text-slate-500 mt-1 max-w-3xl">
              {{ qaService.currentSeries()?.description || 'Multi-speaker workshop running seamlessly under single audience join code: ' + (qaService.currentSeries()?.joinCode || '') }}
            </p>
          </div>

          <!-- Auth / Key Switcher -->
          <div class="flex items-center gap-2">
            <button
              id="open-auth-btn"
              type="button"
              (click)="showAuthModal.set(true)"
              class="inline-flex items-center px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <mat-icon class="text-sm mr-1.5">key</mat-icon>
              {{ qaService.userRole() === 'attendee' ? 'Unlock Host / Speaker Key' : 'Role: ' + (qaService.userRole() | uppercase) }}
            </button>
            @if (qaService.isOrganizer()) {
              <button
                id="add-segment-btn"
                type="button"
                (click)="openAddSegmentModal()"
                class="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <mat-icon class="text-sm mr-1.5">add_circle</mat-icon> Add Speaker Talk
              </button>

              <button
                id="btn-create-new-series-workshop"
                type="button"
                (click)="qaService.leaveSession()"
                class="inline-flex items-center px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Create another workshop series or switch room"
              >
                <mat-icon class="text-sm mr-1.5">add_to_photos</mat-icon> Create New Series
              </button>
            }
          </div>
        </div>

        <!-- Live Status Bar -->
        @if (qaService.activeSegment(); as activeSeg) {
          <div class="mt-6 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <span class="relative flex h-3.5 w-3.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold uppercase tracking-wider text-emerald-700">LIVE ON STAGE</span>
                  <span class="text-xs text-slate-500">Segment {{ activeSeg.order }} of {{ qaService.segments().length }}</span>
                </div>
                <h3 class="text-base font-bold text-slate-900">
                  {{ activeSeg.title }} — <span class="text-indigo-600 font-semibold">{{ activeSeg.speakerName }}</span>
                </h3>
              </div>
            </div>

            <!-- Active Segment Quick Controls -->
            @if (qaService.isOrganizer() || (qaService.isSpeaker() && qaService.speakerSegmentId() === activeSeg.id)) {
              <div class="flex items-center gap-2">
                <button
                  id="end-live-segment-btn"
                  type="button"
                  (click)="endSegment(activeSeg.id)"
                  [disabled]="isSubmitting()"
                  class="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm mr-1">stop_circle</mat-icon> Conclude Talk
                </button>
              </div>
            }
          </div>
        }
      </div>

      <!-- Segments Timeline & Run of Show Cards -->
      <div class="grid grid-cols-1 gap-4">
        @for (seg of qaService.segments(); track seg.id; let i = $index) {
          <div
            [id]="'segment-card-' + seg.id"
            class="bg-white rounded-2xl border transition-all duration-200 p-5 shadow-sm relative overflow-hidden"
            [class.border-emerald-500]="seg.status === 'LIVE'"
            [class.ring-2]="seg.status === 'LIVE'"
            [class.ring-emerald-500/20]="seg.status === 'LIVE'"
            [class.border-slate-200]="seg.status !== 'LIVE'"
            [class.opacity-80]="seg.status === 'ENDED'"
          >
            <!-- Left Status Indicator Strip -->
            <div
              class="absolute left-0 top-0 bottom-0 w-1.5"
              [class.bg-emerald-500]="seg.status === 'LIVE'"
              [class.bg-indigo-400]="seg.status === 'SCHEDULED'"
              [class.bg-amber-400]="seg.status === 'GRACE_WINDOW'"
              [class.bg-slate-300]="seg.status === 'ENDED'"
            ></div>

            <div class="pl-2">
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <!-- Speaker & Talk Details -->
                <div class="flex items-start gap-3">
                  <div
                    class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                    [class.bg-emerald-100]="seg.status === 'LIVE'"
                    [class.text-emerald-800]="seg.status === 'LIVE'"
                    [class.bg-slate-100]="seg.status !== 'LIVE'"
                    [class.text-slate-700]="seg.status !== 'LIVE'"
                  >
                    {{ i + 1 }}
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h4 class="text-lg font-bold text-slate-900">{{ seg.title }}</h4>
                      <span
                        class="px-2 py-0.5 text-xs font-semibold rounded-full uppercase"
                        [class.bg-emerald-100]="seg.status === 'LIVE'"
                        [class.text-emerald-800]="seg.status === 'LIVE'"
                        [class.bg-indigo-100]="seg.status === 'SCHEDULED'"
                        [class.text-indigo-800]="seg.status === 'SCHEDULED'"
                        [class.bg-amber-100]="seg.status === 'GRACE_WINDOW'"
                        [class.text-amber-800]="seg.status === 'GRACE_WINDOW'"
                        [class.bg-slate-100]="seg.status === 'ENDED'"
                        [class.text-slate-600]="seg.status === 'ENDED'"
                      >
                        {{ seg.status.replace('_', ' ') }}
                      </span>
                      <span class="text-xs text-slate-500 font-mono">{{ seg.durationMinutes }} mins</span>
                    </div>

                    <!-- Speaker Bio line -->
                    <div class="flex items-center gap-2 mt-1 text-sm text-slate-600 flex-wrap">
                      <span class="font-semibold text-indigo-700 flex items-center gap-1">
                        <mat-icon class="text-sm">record_voice_over</mat-icon> {{ seg.speakerName }}
                      </span>
                      @if (seg.speakerRole) {
                        <span class="text-slate-400">•</span>
                        <span class="text-slate-500 text-xs">{{ seg.speakerRole }}</span>
                      }
                      @if (seg.speakerOrg) {
                        <span class="text-slate-400">•</span>
                        <span class="text-slate-500 text-xs">{{ seg.speakerOrg }}</span>
                      }
                    </div>

                    <!-- Topic summary & Grounding Status -->
                    @if (seg.topicSummary) {
                      <p class="text-xs text-slate-500 mt-2 line-clamp-2 max-w-3xl">
                        {{ seg.topicSummary }}
                      </p>
                    }
                  </div>
                </div>

                <!-- Segment Action Controls -->
                <div class="flex items-center gap-2 self-end md:self-center shrink-0">
                  <!-- Question count for this segment -->
                  <div class="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center">
                    <span class="block text-xs text-slate-400 uppercase font-semibold">Questions</span>
                    <span class="text-sm font-bold text-slate-800">{{ getSegmentQuestionCount(seg.id) }}</span>
                  </div>

                  <!-- Action Button by Status for Organizers -->
                  @if (qaService.isOrganizer()) {
                    @if (seg.status === 'SCHEDULED') {
                      <button
                        [id]="'start-seg-btn-' + seg.id"
                        type="button"
                        (click)="startSegment(seg.id)"
                        [disabled]="isSubmitting()"
                        class="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                      >
                        <mat-icon class="text-sm mr-1">play_arrow</mat-icon> Start Talk
                      </button>
                    }

                    @if (seg.status === 'LIVE') {
                      <button
                        [id]="'end-seg-btn-' + seg.id"
                        type="button"
                        (click)="endSegment(seg.id)"
                        [disabled]="isSubmitting()"
                        class="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <mat-icon class="text-sm mr-1">stop</mat-icon> End Talk
                      </button>
                    }

                    @if (seg.status === 'ENDED') {
                      <button
                        [id]="'restart-seg-btn-' + seg.id"
                        type="button"
                        (click)="startSegment(seg.id)"
                        [disabled]="isSubmitting()"
                        class="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        title="Resume talk if ended by mistake"
                      >
                        <mat-icon class="text-sm mr-1">replay</mat-icon> Resume
                      </button>
                    }

                    <!-- Copy Private Speaker Link Button -->
                    <button
                      [id]="'copy-speaker-link-' + seg.id"
                      type="button"
                      (click)="copySpeakerLink(seg)"
                      class="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                      title="Copy unique speaker presenter link"
                    >
                      <mat-icon class="text-sm mr-1">link</mat-icon> Speaker Link
                    </button>

                    <!-- Edit Segment Button -->
                    <button
                      [id]="'edit-seg-btn-' + seg.id"
                      type="button"
                      (click)="openEditSegmentModal(seg)"
                      class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit Talk Details & Context"
                    >
                      <mat-icon class="text-base">edit</mat-icon>
                    </button>
                  }

                  <!-- Speaker's Own Link / Green Room View -->
                  @if (qaService.isSpeaker() && qaService.speakerSegmentId() === seg.id) {
                    <button
                      type="button"
                      (click)="qaService.activeTab.set('teleprompter')"
                      class="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm cursor-pointer"
                    >
                      <mat-icon class="text-sm mr-1">monitor</mat-icon> Open My Teleprompter
                    </button>
                  }
                </div>
              </div>

              <!-- Grounding context summary snippet -->
              @if (seg.groundingContext) {
                <div class="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                  <div class="flex items-center gap-1.5">
                    <mat-icon class="text-xs text-emerald-600">psychology</mat-icon>
                    <span class="font-medium text-slate-700">AI Grounding Active:</span>
                    <span class="italic truncate max-w-md">{{ seg.groundingContext.substring(0, 100) }}...</span>
                  </div>
                  <button
                    type="button"
                    (click)="openEditSegmentModal(seg)"
                    class="text-indigo-600 hover:underline text-xs cursor-pointer"
                  >
                    Inspect context & sensitivity
                  </button>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Question Routing & Re-assignment section for Organizers -->
      @if (qaService.isOrganizer()) {
        <div id="question-routing-tool" class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                <mat-icon class="text-indigo-600">alt_route</mat-icon> Cross-Segment Question Routing
              </h3>
              <p class="text-xs text-slate-500">Reassign inquiries asked for one speaker over to another speaker's talk queue.</p>
            </div>
          </div>

          @if (qaService.questions().length === 0) {
            <div class="text-center py-6 text-slate-400 text-xs">
              No questions submitted yet. As questions arrive, you can route them dynamically across speakers.
            </div>
          } @else {
            <div class="space-y-3 max-h-64 overflow-y-auto pr-1">
              @for (q of qaService.questions().slice(0, 8); track q.id) {
                <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs">
                  <div class="flex-1 truncate">
                    <span class="font-semibold text-slate-800">{{ q.authorName }}:</span>
                    <span class="text-slate-600 ml-1">"{{ q.content }}"</span>
                    <span class="ml-2 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px]">
                      Currently: {{ q.speakerName || 'Unassigned / Global' }}
                    </span>
                  </div>

                  <!-- Route dropdown -->
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-slate-400">Move to:</span>
                    <select
                      #targetSegSelect
                      (change)="moveQuestion(q.id, targetSegSelect.value)"
                      class="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-medium"
                    >
                      <option value="">Select speaker...</option>
                      @for (s of qaService.segments(); track s.id) {
                        <option [value]="s.id" [selected]="q.segmentId === s.id">
                          {{ s.speakerName }} ({{ s.title }})
                        </option>
                      }
                    </select>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Auth Key Entry Modal -->
      @if (showAuthModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div class="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in-95">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                <mat-icon class="text-indigo-600">vpn_key</mat-icon> Access Control & Tokens
              </h3>
              <button type="button" (click)="showAuthModal.set(false)" class="text-slate-400 hover:text-slate-600 cursor-pointer">
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <p class="text-xs text-slate-500 mb-4">
              Enter your private Organizer or Speaker Key to access presenter teleprompters, start/end talk stages, and moderate questions.
            </p>

            <form [formGroup]="authForm" (ngSubmit)="submitAuthToken()" class="space-y-4">
              <div>
                <label for="input-ctrl-token" class="block text-xs font-semibold text-slate-700 mb-1">Access Token / Passkey</label>
                <input
                  id="input-ctrl-token"
                  type="text"
                  formControlName="token"
                  placeholder="e.g. org-xxxx or spk-xxxx"
                  class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono"
                />
              </div>

              <div class="flex items-center justify-between gap-3 pt-2">
                @if (qaService.userRole() !== 'attendee') {
                  <button
                    type="button"
                    (click)="qaService.logoutRole(); showAuthModal.set(false)"
                    class="px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                  >
                    Sign out to Attendee
                  </button>
                }
                <div class="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    (click)="showAuthModal.set(false)"
                    class="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    [disabled]="authForm.invalid"
                    class="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    Verify Key
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Add/Edit Segment Modal -->
      @if (showSegmentModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div class="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-xl my-8">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                <mat-icon class="text-indigo-600">{{ isEditingSegment() ? 'edit' : 'add_circle' }}</mat-icon>
                {{ isEditingSegment() ? 'Edit Speaker Segment' : 'Add New Speaker Segment' }}
              </h3>
              <button type="button" (click)="showSegmentModal.set(false)" class="text-slate-400 hover:text-slate-600 cursor-pointer">
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <form [formGroup]="segmentForm" (ngSubmit)="saveSegment()" class="space-y-4">
              <div>
                <label for="input-seg-title" class="block text-xs font-semibold text-slate-700 mb-1">Talk Title *</label>
                <input
                  id="input-seg-title"
                  type="text"
                  formControlName="title"
                  placeholder="e.g. Distributed Agent Architectures with Gemini 2.5"
                  class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="input-seg-speaker-name" class="block text-xs font-semibold text-slate-700 mb-1">Speaker Name *</label>
                  <input
                    id="input-seg-speaker-name"
                    type="text"
                    formControlName="speakerName"
                    placeholder="e.g. Dr. Sundar Varma"
                    class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label for="input-seg-duration" class="block text-xs font-semibold text-slate-700 mb-1">Duration (Minutes)</label>
                  <input
                    id="input-seg-duration"
                    type="number"
                    formControlName="durationMinutes"
                    class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="input-seg-speaker-role" class="block text-xs font-semibold text-slate-700 mb-1">Speaker Title / Role</label>
                  <input
                    id="input-seg-speaker-role"
                    type="text"
                    formControlName="speakerRole"
                    placeholder="e.g. Principal AI Research Lead"
                    class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label for="input-seg-speaker-org" class="block text-xs font-semibold text-slate-700 mb-1">Organization</label>
                  <input
                    id="input-seg-speaker-org"
                    type="text"
                    formControlName="speakerOrg"
                    placeholder="e.g. Google DeepMind"
                    class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label for="input-seg-topic-summary" class="block text-xs font-semibold text-slate-700 mb-1">Topic Summary</label>
                <textarea
                  id="input-seg-topic-summary"
                  formControlName="topicSummary"
                  rows="2"
                  placeholder="Key concepts, architecture diagrams, and takeaways covered in this talk..."
                  class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                ></textarea>
              </div>

              <div>
                <label for="input-seg-grounding-context" class="block text-xs font-semibold text-slate-700 mb-1">Speaker Grounding Context (AI Synthesis Base)</label>
                <textarea
                  id="input-seg-grounding-context"
                  formControlName="groundingContext"
                  rows="3"
                  placeholder="Paste the slide notes, talk abstract, technical terms, or speaker background to ground Gemini AI answers specifically for this speaker..."
                  class="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono text-xs"
                ></textarea>
              </div>

              <div class="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  (click)="showSegmentModal.set(false)"
                  class="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  [disabled]="segmentForm.invalid || isSubmitting()"
                  class="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {{ isEditingSegment() ? 'Save Changes' : 'Create Segment' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
})
export class SeriesControlRoom {
  public qaService = inject(QaService);
  private fb = inject(FormBuilder);

  public showAuthModal = signal<boolean>(false);
  public showSegmentModal = signal<boolean>(false);
  public isEditingSegment = signal<boolean>(false);
  public editingSegmentId = signal<string | null>(null);
  public isSubmitting = signal<boolean>(false);

  public authForm = this.fb.group({
    token: ['', Validators.required],
  });

  public segmentForm = this.fb.group({
    title: ['', Validators.required],
    speakerName: ['', Validators.required],
    speakerRole: [''],
    speakerOrg: [''],
    durationMinutes: [45],
    topicSummary: [''],
    groundingContext: [''],
  });

  public getSegmentQuestionCount(segmentId: string): number {
    return this.qaService.questions().filter(q => q.segmentId === segmentId).length;
  }

  public async submitAuthToken(): Promise<void> {
    const token = this.authForm.get('token')?.value;
    if (token) {
      await this.qaService.authenticateRole(token);
      this.showAuthModal.set(false);
      this.authForm.reset();
    }
  }

  public async startSegment(segmentId: string): Promise<void> {
    this.isSubmitting.set(true);
    await this.qaService.startSegment(segmentId);
    this.isSubmitting.set(false);
  }

  public async endSegment(segmentId: string): Promise<void> {
    this.isSubmitting.set(true);
    await this.qaService.endSegment(segmentId);
    this.isSubmitting.set(false);
  }

  public copySpeakerLink(seg: Segment): void {
    const code = this.qaService.currentSeries()?.joinCode || this.qaService.currentSession()?.joinCode;
    if (!code) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/?joinCode=${code}&token=${seg.adminToken}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.qaService.showToast(`Private Speaker Link copied for ${seg.speakerName}!`);
      });
    }
  }

  public openAddSegmentModal(): void {
    this.isEditingSegment.set(false);
    this.editingSegmentId.set(null);
    this.segmentForm.reset({
      durationMinutes: 45,
    });
    this.showSegmentModal.set(true);
  }

  public openEditSegmentModal(seg: Segment): void {
    this.isEditingSegment.set(true);
    this.editingSegmentId.set(seg.id);
    this.segmentForm.patchValue({
      title: seg.title,
      speakerName: seg.speakerName,
      speakerRole: seg.speakerRole || '',
      speakerOrg: seg.speakerOrg || '',
      durationMinutes: seg.durationMinutes || 45,
      topicSummary: seg.topicSummary || '',
      groundingContext: seg.groundingContext || '',
    });
    this.showSegmentModal.set(true);
  }

  public async saveSegment(): Promise<void> {
    if (this.segmentForm.invalid) return;

    this.isSubmitting.set(true);
    const formVal = this.segmentForm.value;

    if (this.isEditingSegment() && this.editingSegmentId()) {
      await this.qaService.updateSegment(this.editingSegmentId()!, {
        title: formVal.title || '',
        speakerName: formVal.speakerName || '',
        speakerRole: formVal.speakerRole || '',
        speakerOrg: formVal.speakerOrg || '',
        durationMinutes: formVal.durationMinutes || 45,
        topicSummary: formVal.topicSummary || '',
        groundingContext: formVal.groundingContext || '',
      });
    } else {
      await this.qaService.addSegment({
        title: formVal.title || '',
        speakerName: formVal.speakerName || '',
        speakerRole: formVal.speakerRole || '',
        speakerOrg: formVal.speakerOrg || '',
        durationMinutes: formVal.durationMinutes || 45,
        topicSummary: formVal.topicSummary || '',
        groundingContext: formVal.groundingContext || '',
      });
    }

    this.isSubmitting.set(false);
    this.showSegmentModal.set(false);
  }

  public async moveQuestion(questionId: string, targetSegmentId: string): Promise<void> {
    if (!targetSegmentId) return;
    await this.qaService.moveQuestionToSegment(questionId, targetSegmentId);
  }
}
