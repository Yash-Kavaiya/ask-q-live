import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { FirebaseService } from '../services/firebase.service';
import { HostedSessionRecord, SegmentType, SpeakerInviteRecord } from '../models/qa.models';
import { extractGroundingTextFromFile, GROUNDING_FILE_ACCEPT } from '../utils/document-extract';

export interface SegmentDraft {
  id: string;
  title: string;
  speakerName: string;
  speakerRole?: string;
  speakerOrg?: string;
  speakerEmail?: string;
  topicSummary?: string;
  durationMinutes: number;
  startTime?: string;
  categories?: string;
  type: SegmentType;
  groundingContext?: string;
}

@Component({
  selector: 'app-host-studio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="max-w-6xl mx-auto px-4 py-6 sm:py-10 animate-fade-in space-y-8">
      
      <!-- Top Navigation & Host Header Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E0E2EC]">
        <div>
          <button
            type="button"
            (click)="qaService.navigateToJoin()"
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer mb-2"
          >
            <mat-icon class="text-base">arrow_back</mat-icon>
            <span>Back to Join Room</span>
          </button>
          <div class="flex items-center gap-2.5">
            <h1 class="font-display font-bold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              {{ qaService.userRole() === 'speaker' ? 'Speaker Studio' : 'Host & Organizer Studio' }}
            </h1>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {{ qaService.userRole() === 'speaker' ? 'Speaker' : 'Enterprise' }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            @if (qaService.userRole() === 'speaker') {
              Your invited talks appear below. Open one to enter your green room and teleprompter.
            } @else {
              Create events, manage multi-speaker workshop series, and resume stage controls.
            }
          </p>
        </div>

        <!-- Authenticated Host Card & Sign Out -->
        <div class="flex items-center gap-3 p-2.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            {{ getInitials() }}
          </div>
          <div class="text-left pr-2">
            <div class="font-bold text-xs text-slate-900 truncate max-w-[180px]">
              {{ qaService.userName() || firebaseService.currentUser()?.displayName || 'Event Organizer' }}
            </div>
            <div class="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
              <mat-icon class="text-xs text-emerald-500">verified</mat-icon>
              <span>{{ getRoleBadge() }}</span>
            </div>
          </div>
          <button
            type="button"
            (click)="signOut()"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer"
            title="Sign out of Host Portal"
          >
            Sign Out
          </button>
        </div>
      </div>

      <!-- Quick Action Cards: Launch New Events (organizers only) -->
      @if (qaService.userRole() !== 'speaker') {
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- Action 1: Create Workshop Series -->
        <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-md border border-indigo-900/50 relative overflow-hidden group">
          <div class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none"></div>
          
          <div class="relative z-10 space-y-4">
            <div class="flex items-center justify-between">
              <div class="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                <mat-icon class="text-indigo-300 text-2xl">view_timeline</mat-icon>
              </div>
              <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/30">
                Host Gemini Key
              </span>
            </div>

            <div>
              <h2 class="font-display font-bold text-xl text-white">Create Multi-Speaker Series</h2>
              <p class="text-indigo-200/80 text-xs leading-relaxed mt-1">
                Single master URL for attendees. After launch, use the in-room <strong class="text-white">Manage</strong> tab for invites, Gemini key, and speaker links.
              </p>
            </div>

            <button
              id="btn-studio-create-series"
              type="button"
              (click)="openCreateModal('series')"
              class="w-full py-3 px-4 rounded-xl font-display font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-all flex items-center justify-between cursor-pointer shadow-sm"
            >
              <span class="flex items-center gap-2">
                <mat-icon class="text-base">add_circle</mat-icon>
                <span>Launch New Series Workshop</span>
              </span>
              <mat-icon class="text-sm text-indigo-200">arrow_forward</mat-icon>
            </button>
          </div>
        </div>

        <!-- Action 2: Create Single Keynote Session -->
        <div class="bg-white rounded-2xl p-6 sm:p-7 border border-[#E0E2EC] shadow-2xs hover:border-slate-300 transition-all space-y-4">
          <div class="flex items-center justify-between">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <mat-icon class="text-indigo-600 text-2xl">podium</mat-icon>
            </div>
            <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Free
            </span>
          </div>

          <div>
            <h2 class="font-display font-bold text-xl text-slate-900">Create Single Keynote Session</h2>
            <p class="text-slate-500 text-xs leading-relaxed mt-1">
              Free to create — no Gemini API key needed. Ideal for stand-alone webinars, AMAs, and keynotes with platform AI grounding.
            </p>
          </div>

          <button
            id="btn-studio-create-single"
            type="button"
            (click)="openCreateModal('single')"
            class="w-full py-3 px-4 rounded-xl font-display font-semibold text-xs text-slate-700 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 transition-all flex items-center justify-between cursor-pointer"
          >
            <span class="flex items-center gap-2">
              <mat-icon class="text-base">add</mat-icon>
              <span>Create Single Presentation Session</span>
            </span>
            <mat-icon class="text-sm text-slate-400">arrow_forward</mat-icon>
          </button>
        </div>

      </div>
      }

      <!-- ================= SPEAKER INVITES (Gmail claim) ================= -->
      @if (qaService.userRole() === 'speaker') {
        <div id="studio-speaker-invites" class="bg-white rounded-2xl p-6 sm:p-8 border border-[#E0E2EC] shadow-xs space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <mat-icon class="text-xl">record_voice_over</mat-icon>
              </div>
              <div>
                <h2 class="font-display font-bold text-lg text-slate-900">Your Invited Talks</h2>
                <p class="text-xs text-slate-500">
                  Talks where the host registered
                  <strong class="text-slate-700">{{ qaService.userEmail() || 'your Gmail' }}</strong>.
                  Open one to enter your speaker green room.
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="refreshSpeakerInvites()"
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer"
            >
              <mat-icon class="text-sm">refresh</mat-icon>
              Refresh Invites
            </button>
          </div>

          @if (qaService.speakerInvites().length === 0) {
            <div class="text-center py-12 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
              <div class="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <mat-icon class="text-2xl">mail_outline</mat-icon>
              </div>
              <h3 class="font-display font-bold text-sm text-slate-800">No invited talks yet</h3>
              <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Ask the host to add your Gmail on your segment (Invite Speaker Gmail), or open the Speaker Link they shared.
              </p>
            </div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              @for (invite of qaService.speakerInvites(); track invite.segmentId + invite.joinCode) {
                <div class="p-5 rounded-2xl border border-amber-200 bg-amber-50/40 hover:bg-white hover:border-amber-400 hover:shadow-md transition-all space-y-3">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-bold px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900">
                      #{{ invite.joinCode }}
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                      {{ invite.status }}
                    </span>
                  </div>
                  <div>
                    <h3 class="font-display font-bold text-base text-slate-900 leading-snug">{{ invite.segmentTitle }}</h3>
                    <p class="text-xs text-slate-500 mt-0.5">{{ invite.seriesTitle }} · {{ invite.speakerName }}</p>
                  </div>
                  <button
                    type="button"
                    (click)="openSpeakerInvite(invite)"
                    [disabled]="qaService.isLoading()"
                    class="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <mat-icon class="text-sm">mic</mat-icon>
                    <span>Open My Green Room</span>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ================= PAST HOSTED SESSIONS SECTION ================= -->
      @if (qaService.userRole() !== 'speaker') {
      <div id="studio-past-sessions" class="bg-white rounded-2xl p-6 sm:p-8 border border-[#E0E2EC] shadow-xs space-y-5">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <mat-icon class="text-xl">history</mat-icon>
            </div>
            <div>
              <h2 class="font-display font-bold text-lg text-slate-900">
                Past Hosted Sessions &amp; Events
              </h2>
              <p class="text-xs text-slate-500">
                Re-enter as host. For a live series, use the in-room Manage tab for invites and settings.
              </p>
            </div>
          </div>

          @if (qaService.hostedSessions().length > 0) {
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                {{ qaService.hostedSessions().length }} Saved Events
              </span>
              <button
                type="button"
                (click)="qaService.clearHostedSessions()"
                class="text-xs text-slate-400 hover:text-rose-600 font-medium px-2 py-1 rounded transition-colors cursor-pointer"
              >
                Clear History
              </button>
            </div>
          }
        </div>

        @if (qaService.hostedSessions().length === 0) {
          <div class="text-center py-12 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
            <div class="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <mat-icon class="text-2xl">event_busy</mat-icon>
            </div>
            <h3 class="font-display font-bold text-sm text-slate-800">No past hosted sessions yet</h3>
            <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              When you launch a workshop series or single session, it will be securely remembered here for quick resumption.
            </p>
            <button
              type="button"
              (click)="openCreateModal('single')"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs cursor-pointer shadow-2xs"
            >
              <mat-icon class="text-sm">add_circle</mat-icon>
              <span>Launch Your First Event</span>
            </button>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (session of qaService.hostedSessions(); track session.joinCode) {
              <div
                class="p-5 rounded-2xl border border-slate-200 bg-slate-50/40 hover:bg-white hover:border-indigo-400 hover:shadow-md transition-all space-y-3.5 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                (click)="reenterAsHost(session)"
                role="button"
                tabindex="0"
                (keydown.enter)="reenterAsHost(session)"
                (keydown.space)="$event.preventDefault(); reenterAsHost(session)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-bold px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-800">
                      #{{ session.joinCode }}
                    </span>
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      [class.bg-purple-100]="session.type === 'series'"
                      [class.text-purple-800]="session.type === 'series'"
                      [class.bg-blue-100]="session.type !== 'series'"
                      [class.text-blue-800]="session.type !== 'series'"
                    >
                      {{ session.type === 'series' ? 'Series' : 'Single' }}
                    </span>
                  </div>

                  <button
                    type="button"
                    (click)="$event.stopPropagation(); qaService.removeHostedSession(session.joinCode)"
                    class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove from history"
                  >
                    <mat-icon class="text-base">delete_outline</mat-icon>
                  </button>
                </div>

                <div>
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="font-display font-bold text-base text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug line-clamp-1">
                      {{ session.title }}
                    </h3>
                    <span class="text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center shrink-0">
                      <mat-icon class="text-sm">arrow_forward</mat-icon>
                    </span>
                  </div>
                  @if (session.description) {
                    <p class="text-xs text-slate-500 line-clamp-1 mt-0.5">{{ session.description }}</p>
                  }
                </div>

                <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                  <span class="flex items-center gap-1">
                    <mat-icon class="text-xs">schedule</mat-icon>
                    <span>{{ formatDate(session.lastAccessedAt) }}</span>
                  </span>
                  <span class="font-medium text-slate-600">
                    {{ session.type === 'series' ? (session.segmentCount || 1) + ' segments' : (session.questionCount || 0) + ' questions' }}
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    (click)="$event.stopPropagation(); reenterAsHost(session)"
                    [disabled]="qaService.isLoading()"
                    class="py-2.5 px-3 rounded-xl bg-indigo-600 group-hover:bg-indigo-700 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <mat-icon class="text-sm">dashboard</mat-icon>
                    <span>Open Dashboard</span>
                  </button>

                  <button
                    type="button"
                    (click)="$event.stopPropagation(); openShare(session)"
                    class="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <mat-icon class="text-sm text-indigo-600">qr_code_2</mat-icon>
                    <span>Share QR</span>
                  </button>
                </div>
              </div>
            }
          </div>
        }

      </div>
      }

      <!-- ================= CREATE SESSION / WORKSHOP MODAL ================= -->
      @if (showCreateModal()) {
        <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div class="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 border border-slate-200 shadow-2xl my-8 relative max-h-[92vh] overflow-y-auto">
            
            <button
              id="btn-studio-close-modal"
              type="button"
              (click)="showCreateModal.set(false)"
              class="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
            >
              <mat-icon class="text-xl">close</mat-icon>
            </button>

            <div class="flex items-center gap-3 mb-5">
              <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <mat-icon class="text-2xl">{{ modalMode() === 'series' ? 'view_timeline' : 'podium' }}</mat-icon>
              </div>
              <div>
                <h2 class="text-xl font-display font-bold text-slate-900">
                  {{ modalMode() === 'series' ? 'Launch Multi-Speaker Workshop Series' : 'Create Single Presentation Session' }}
                </h2>
                <p class="text-xs text-slate-500">
                  {{ modalMode() === 'series' ? 'Optional host Gemini API key · leave blank to use platform key' : 'Free — no API key required' }}
                </p>
              </div>
            </div>

            <!-- Single Session Form -->
            @if (modalMode() === 'single') {
              <form [formGroup]="singleForm" (ngSubmit)="submitCreateSingle()" class="space-y-4">
                <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 leading-relaxed">
                  <strong>Free session.</strong> AI answers and grounding use the platform Gemini key — you do not need to provide one.
                </div>
                <div>
                  <label for="single-title-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Session Title *
                  </label>
                  <input
                    id="single-title-input"
                    type="text"
                    formControlName="title"
                    placeholder="e.g. Next-Gen Web Architectures Keynote"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label for="single-desc-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Description &amp; Audience Topic
                  </label>
                  <textarea
                    id="single-desc-input"
                    formControlName="description"
                    rows="2"
                    placeholder="Brief description for attendees..."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none resize-none"
                  ></textarea>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label for="single-speaker-name" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Primary Speaker Name
                    </label>
                    <input
                      id="single-speaker-name"
                      type="text"
                      formControlName="speakerName"
                      placeholder="e.g. Dr. Alex Morgan"
                      class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label for="single-speaker-role" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Speaker Role / Organization
                    </label>
                    <input
                      id="single-speaker-role"
                      type="text"
                      formControlName="speakerRole"
                      placeholder="e.g. VP of Cloud Engineering"
                      class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label for="single-grounding-context" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      AI Grounding Slide Deck Context (Optional)
                    </label>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <svg class="w-3 h-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Gemini Embedding 2 RAG
                    </span>
                  </div>

                  <!-- Drag & Drop / File Input Zone -->
                  <div
                    (dragover)="onSingleDragOver($event)"
                    (dragleave)="onSingleDragLeave($event)"
                    (drop)="onSingleFileDrop($event)"
                    [class.border-indigo-500]="isSingleDragging()"
                    [class.bg-indigo-50]="isSingleDragging()"
                    [class.border-slate-300]="!isSingleDragging()"
                    class="relative border-2 border-dashed rounded-xl p-3 text-center transition-all bg-slate-50/70 hover:bg-slate-50 flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                    (click)="singleFileInput.click()"
                  >
                    <input
                      #singleFileInput
                      type="file"
                      class="hidden"
                      [attr.accept]="groundingFileAccept"
                      (change)="onSingleFileSelected($event)"
                    />

                    @if (isSingleReadingFile()) {
                      <div class="flex items-center gap-2 text-xs text-indigo-600 py-1">
                        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span class="font-medium">Running Gemini OCR on your document...</span>
                      </div>
                    } @else if (singleUploadedFileName()) {
                      <div class="flex items-center justify-between w-full px-2 py-1 bg-white border border-indigo-200 rounded-lg shadow-2xs" (click)="$event.stopPropagation()">
                        <div class="flex items-center gap-2 overflow-hidden">
                          <svg class="w-5 h-5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div class="text-left truncate">
                            <p class="text-xs font-semibold text-slate-800 truncate">{{ singleUploadedFileName() }}</p>
                            <p class="text-[10px] text-slate-500">{{ singleUploadedFileSize() }} • Parsed for Gemini Embedding 2 RAG</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          (click)="removeSingleUploadedFile()"
                          class="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Remove file"
                        >
                          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    } @else {
                      <div class="flex items-center gap-2 text-slate-600">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span class="text-xs font-medium text-slate-700">
                          Upload presentation deck or scan (.pdf, .pptx, .docx, images, .txt) — Gemini OCR extracts text
                        </span>
                      </div>
                      <p class="text-[11px] text-slate-400">
                        Gemini OCRs the file, then embeddings (<code class="font-mono text-indigo-600">text-embedding-004</code>) ground live answers
                      </p>
                    }
                  </div>

                  <!-- Textarea for direct editing / pasting -->
                  <div class="relative">
                    <textarea
                      id="single-grounding-context"
                      formControlName="groundingContext"
                      rows="3"
                      placeholder="Or paste slide deck text, bullet points, speaker abstract, or key facts directly..."
                      class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none resize-y"
                    ></textarea>
                    @if (singleForm.get('groundingContext')?.value) {
                      <div class="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span class="flex items-center gap-1 text-emerald-600 font-medium">
                          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          Deck content ready ({{ singleForm.get('groundingContext')?.value?.length }} characters)
                        </span>
                        <span class="text-indigo-600 font-mono font-medium">text-embedding-004 RAG</span>
                      </div>
                    }
                  </div>
                </div>

                <!-- Event Joining Code Options -->
                <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/90 space-y-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Session Joining Code *
                      </span>
                      <p class="text-[11px] text-slate-500">
                        Attendees use this code to enter the room without signing in.
                      </p>
                    </div>
                    <!-- Mode Switcher -->
                    <div class="flex items-center p-0.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                      <button
                        type="button"
                        (click)="setSingleCodeMode('auto')"
                        [class.bg-indigo-600]="singleCodeMode() === 'auto'"
                        [class.text-white]="singleCodeMode() === 'auto'"
                        [class.text-slate-600]="singleCodeMode() !== 'auto'"
                        class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">autorenew</mat-icon>
                        <span>Auto-Generate</span>
                      </button>
                      <button
                        type="button"
                        (click)="setSingleCodeMode('custom')"
                        [class.bg-indigo-600]="singleCodeMode() === 'custom'"
                        [class.text-white]="singleCodeMode() === 'custom'"
                        [class.text-slate-600]="singleCodeMode() !== 'custom'"
                        class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">edit</mat-icon>
                        <span>Custom Code</span>
                      </button>
                    </div>
                  </div>

                  @if (singleCodeMode() === 'auto') {
                    <div class="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-xl">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono font-bold text-sm">
                          #
                        </div>
                        <div>
                          <div class="font-mono text-sm font-bold text-slate-900 tracking-wider">
                            {{ singleAutoCode() }}
                          </div>
                          <div class="text-[10px] text-slate-500">
                            Automatic clean room code
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        (click)="regenerateSingleAutoCode()"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Spin new random code"
                      >
                        <mat-icon class="text-sm">casino</mat-icon>
                        <span>Spin New</span>
                      </button>
                    </div>
                  } @else {
                    <div class="space-y-1.5">
                      <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-indigo-600 font-mono font-bold text-sm">
                          #
                        </div>
                        <input
                          id="single-custom-code-input"
                          type="text"
                          formControlName="customJoinCode"
                          (input)="onSingleCustomCodeInput($event)"
                          placeholder="e.g. KEYNOTE, SUMMIT, AI2026"
                          class="w-full pl-7 pr-24 py-2 bg-white border border-slate-300 focus:border-indigo-600 rounded-xl text-xs font-mono uppercase font-bold text-slate-900 tracking-wider outline-none"
                          maxlength="14"
                        />
                        <div class="absolute inset-y-0 right-1.5 flex items-center">
                          <button
                            type="button"
                            (click)="generateRandomIntoSingle()"
                            class="px-2 py-1 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer flex items-center gap-0.5"
                            title="Generate random code into input"
                          >
                            <mat-icon class="text-xs">casino</mat-icon>
                            <span>Random</span>
                          </button>
                        </div>
                      </div>

                      <div class="flex items-center justify-between text-[10px]">
                        @if (singleCodeStatus().checking) {
                          <span class="text-slate-500 flex items-center gap-1">
                            <span class="w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                            Checking availability...
                          </span>
                        } @else if (singleCodeStatus().error) {
                          <span class="text-rose-600 font-semibold flex items-center gap-1">
                            <mat-icon class="text-xs">error</mat-icon>
                            {{ singleCodeStatus().error }}
                          </span>
                        } @else if (singleCodeStatus().available === true) {
                          <span class="text-emerald-700 font-semibold flex items-center gap-1">
                            <mat-icon class="text-xs text-emerald-600">check_circle</mat-icon>
                            Code is available!
                          </span>
                        } @else if (singleCodeStatus().available === false) {
                          <span class="text-rose-600 font-semibold flex items-center gap-1">
                            <mat-icon class="text-xs">cancel</mat-icon>
                            Code already in use by active event
                          </span>
                        } @else {
                          <span class="text-slate-500">
                            3-14 characters (letters, numbers, hyphens)
                          </span>
                        }

                        <span class="text-slate-400 font-mono">
                          Room #{{ singleCodePreview() }}
                        </span>
                      </div>
                    </div>
                  }
                </div>

                <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    (click)="showCreateModal.set(false)"
                    class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    [disabled]="singleForm.invalid || qaService.isLoading()"
                    class="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <mat-icon class="text-sm">rocket_launch</mat-icon>
                    <span>Launch Keynote Session</span>
                  </button>
                </div>
              </form>
            }

            <!-- Series Form -->
            @if (modalMode() === 'series') {
              <form [formGroup]="seriesForm" (ngSubmit)="submitCreateSeries()" class="space-y-4">
                <div class="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 space-y-2">
                  <label for="series-gemini-key-input" class="block text-xs font-bold text-amber-950 uppercase tracking-wider">
                    Gemini API Key (optional)
                  </label>
                  <p class="text-[11px] text-amber-900/80 leading-relaxed">
                    Paste your own Gemini API key for this workshop’s AI answers and reports.
                    Leave blank to use the platform Gemini key.
                  </p>
                  <div class="relative">
                    <input
                      id="series-gemini-key-input"
                      [type]="showSeriesGeminiKey() ? 'text' : 'password'"
                      formControlName="geminiApiKey"
                      placeholder="AIzaSy… (optional)"
                      autocomplete="off"
                      class="w-full pl-3.5 pr-10 py-2.5 bg-white border border-amber-200 focus:border-indigo-600 rounded-xl text-xs text-slate-900 outline-none font-mono"
                    />
                    <button
                      type="button"
                      (click)="showSeriesGeminiKey.set(!showSeriesGeminiKey())"
                      class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Show or hide API key"
                    >
                      <mat-icon class="text-base">{{ showSeriesGeminiKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
                    </button>
                  </div>
                </div>

                <div>
                  <label for="series-title-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Workshop Series Title *
                  </label>
                  <input
                    id="series-title-input"
                    type="text"
                    formControlName="title"
                    placeholder="e.g. Cloud Tech Summit 2026: Workshop Day"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label for="series-desc-input" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Series Overview
                  </label>
                  <textarea
                    id="series-desc-input"
                    formControlName="description"
                    rows="2"
                    placeholder="Full day workshop series schedule..."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none resize-none"
                  ></textarea>
                </div>

                <!-- Workshop Series Joining Code Options -->
                <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/90 space-y-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Workshop Series Joining Code *
                      </span>
                      <p class="text-[11px] text-slate-500">
                        Unified code for attendees across all talks in this workshop.
                      </p>
                    </div>
                    <!-- Mode Switcher -->
                    <div class="flex items-center p-0.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                      <button
                        type="button"
                        (click)="setSeriesCodeMode('auto')"
                        [class.bg-indigo-600]="seriesCodeMode() === 'auto'"
                        [class.text-white]="seriesCodeMode() === 'auto'"
                        [class.text-slate-600]="seriesCodeMode() !== 'auto'"
                        class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">autorenew</mat-icon>
                        <span>Auto-Generate</span>
                      </button>
                      <button
                        type="button"
                        (click)="setSeriesCodeMode('custom')"
                        [class.bg-indigo-600]="seriesCodeMode() === 'custom'"
                        [class.text-white]="seriesCodeMode() === 'custom'"
                        [class.text-slate-600]="seriesCodeMode() !== 'custom'"
                        class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">edit</mat-icon>
                        <span>Custom Code</span>
                      </button>
                    </div>
                  </div>

                  @if (seriesCodeMode() === 'auto') {
                    <div class="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-xl">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono font-bold text-sm">
                          #
                        </div>
                        <div>
                          <div class="font-mono text-sm font-bold text-slate-900 tracking-wider">
                            {{ seriesAutoCode() }}
                          </div>
                          <div class="text-[10px] text-slate-500">
                            Automatic clean series code
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        (click)="regenerateSeriesAutoCode()"
                        class="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Spin new random code"
                      >
                        <mat-icon class="text-sm">casino</mat-icon>
                        <span>Spin New</span>
                      </button>
                    </div>
                  } @else {
                    <div class="space-y-1.5">
                      <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-indigo-600 font-mono font-bold text-sm">
                          #
                        </div>
                        <input
                          id="series-custom-code-input"
                          type="text"
                          formControlName="customJoinCode"
                          (input)="onSeriesCustomCodeInput($event)"
                          placeholder="e.g. SUMMIT26, DEVCON, ARCH2026"
                          class="w-full pl-7 pr-24 py-2 bg-white border border-slate-300 focus:border-indigo-600 rounded-xl text-xs font-mono uppercase font-bold text-slate-900 tracking-wider outline-none"
                          maxlength="14"
                        />
                        <div class="absolute inset-y-0 right-1.5 flex items-center">
                          <button
                            type="button"
                            (click)="generateRandomIntoSeries()"
                            class="px-2 py-1 text-[10px] font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer flex items-center gap-0.5"
                            title="Generate random code into input"
                          >
                            <mat-icon class="text-xs">casino</mat-icon>
                            <span>Random</span>
                          </button>
                        </div>
                      </div>

                      <div class="flex items-center justify-between text-[10px]">
                        @if (seriesCodeStatus().checking) {
                          <span class="text-slate-500 flex items-center gap-1">
                            <span class="w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                            Checking availability...
                          </span>
                        } @else if (seriesCodeStatus().error) {
                          <span class="text-rose-600 font-semibold flex items-center gap-1">
                            <mat-icon class="text-xs">error</mat-icon>
                            {{ seriesCodeStatus().error }}
                          </span>
                        } @else if (seriesCodeStatus().available === true) {
                          <span class="text-emerald-700 font-semibold flex items-center gap-1">
                            <mat-icon class="text-xs text-emerald-600">check_circle</mat-icon>
                            Code is available!
                          </span>
                        } @else if (seriesCodeStatus().available === false) {
                          <span class="text-rose-600 font-semibold flex items-center gap-1">
                            <mat-icon class="text-xs">cancel</mat-icon>
                            Code already in use by active event
                          </span>
                        } @else {
                          <span class="text-slate-500">
                            3-14 characters (letters, numbers, hyphens)
                          </span>
                        }

                        <span class="text-slate-400 font-mono">
                          Series #{{ seriesCodePreview() }}
                        </span>
                      </div>
                    </div>
                  }
                </div>

                <!-- Segments Builder -->
                <div class="space-y-3 pt-2">
                  <div class="flex items-center justify-between">
                    <span class="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Speaker Talks &amp; Agenda ({{ segments().length }})
                    </span>
                    <button
                      type="button"
                      (click)="addSegment()"
                      class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                    >
                      <mat-icon class="text-base">add</mat-icon>
                      <span>Add Talk</span>
                    </button>
                  </div>

                  <div class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    @for (seg of segments(); track seg.id; let idx = $index) {
                      <div class="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 relative">
                        <div class="flex items-center justify-between">
                          <span class="text-xs font-bold text-slate-700">Talk #{{ idx + 1 }}</span>
                          @if (segments().length > 1) {
                            <button
                              type="button"
                              (click)="removeSegment(seg.id)"
                              class="text-slate-400 hover:text-rose-600 text-xs cursor-pointer"
                            >
                              Remove
                            </button>
                          }
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            [value]="seg.title"
                            (input)="updateSegment(seg.id, 'title', $any($event.target).value)"
                            placeholder="Talk Title *"
                            class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-indigo-600"
                          />
                          <input
                            type="text"
                            [value]="seg.speakerName"
                            (input)="updateSegment(seg.id, 'speakerName', $any($event.target).value)"
                            placeholder="Speaker Name"
                            class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-indigo-600"
                          />
                        </div>
                        <input
                          type="email"
                          [value]="seg.speakerEmail || ''"
                          (input)="updateSegment(seg.id, 'speakerEmail', $any($event.target).value)"
                          placeholder="Invite Speaker Gmail (optional)"
                          class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-indigo-600"
                        />
                      </div>
                    }
                  </div>
                </div>

                <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    (click)="showCreateModal.set(false)"
                    class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    [disabled]="seriesForm.invalid || qaService.isLoading()"
                    class="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <mat-icon class="text-sm">rocket_launch</mat-icon>
                    <span>Launch Series Workshop</span>
                  </button>
                </div>
              </form>
            }

          </div>
        </div>
      }

    </div>
  `,
})
export class HostStudio {
  public qaService = inject(QaService);
  public firebaseService = inject(FirebaseService);
  private fb = inject(FormBuilder);

  public showCreateModal = signal<boolean>(false);
  public modalMode = signal<'series' | 'single'>('series');
  public isSubmitting = signal<boolean>(false);

  constructor() {
    // When landing as speaker, load Gmail-matched invites into Speaker Studio.
    if (this.qaService.userRole() === 'speaker') {
      const email =
        this.qaService.userEmail() || this.firebaseService.currentUser()?.email || '';
      if (email) {
        void this.qaService.fetchSpeakerInvites(email);
      }
    }
  }

  public segments = signal<SegmentDraft[]>([
    {
      id: 'seg-1',
      title: 'Opening Session',
      speakerName: '',
      speakerRole: '',
      speakerOrg: '',
      type: 'TALK',
      durationMinutes: 45,
      startTime: '',
      groundingContext: '',
      categories: 'General',
    },
  ]);

  public singleForm = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    speakerName: [''],
    speakerRole: [''],
    groundingContext: [''],
    codeMode: ['auto'],
    customJoinCode: [''],
  });

  public seriesForm = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    geminiApiKey: [''],
    codeMode: ['auto'],
    customJoinCode: [''],
  });

  public showSeriesGeminiKey = signal<boolean>(false);

  public singleCodeMode = signal<'auto' | 'custom'>('auto');
  public seriesCodeMode = signal<'auto' | 'custom'>('auto');

  public isSingleDragging = signal<boolean>(false);
  public isSingleReadingFile = signal<boolean>(false);
  public groundingFileAccept = GROUNDING_FILE_ACCEPT;
  public singleUploadedFileName = signal<string | null>(null);
  public singleUploadedFileSize = signal<string | null>(null);

  public singleAutoCode = signal<string>('ROOM' + Math.random().toString(36).substring(2, 6).toUpperCase());
  public seriesAutoCode = signal<string>('SUMMIT' + Math.random().toString(36).substring(2, 6).toUpperCase());

  public singleCodeStatus = signal<{ checking: boolean; available?: boolean; error?: string }>({ checking: false });
  public seriesCodeStatus = signal<{ checking: boolean; available?: boolean; error?: string }>({ checking: false });

  private singleCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private seriesCheckTimer: ReturnType<typeof setTimeout> | null = null;

  public setSingleCodeMode(mode: 'auto' | 'custom'): void {
    this.singleCodeMode.set(mode);
    this.singleForm.patchValue({ codeMode: mode });
  }

  public setSeriesCodeMode(mode: 'auto' | 'custom'): void {
    this.seriesCodeMode.set(mode);
    this.seriesForm.patchValue({ codeMode: mode });
  }

  public async regenerateSingleAutoCode(): Promise<void> {
    const code = await this.qaService.generateSuggestedCode('ROOM');
    this.singleAutoCode.set(code);
  }

  public async regenerateSeriesAutoCode(): Promise<void> {
    const code = await this.qaService.generateSuggestedCode('SUMMIT');
    this.seriesAutoCode.set(code);
  }

  public async generateRandomIntoSingle(): Promise<void> {
    const code = await this.qaService.generateSuggestedCode('ROOM');
    this.singleForm.patchValue({ customJoinCode: code });
    this.validateCustomCode(code, 'single');
  }

  public async generateRandomIntoSeries(): Promise<void> {
    const code = await this.qaService.generateSuggestedCode('SUMMIT');
    this.seriesForm.patchValue({ customJoinCode: code });
    this.validateCustomCode(code, 'series');
  }

  public onSingleCustomCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    this.singleForm.patchValue({ customJoinCode: clean }, { emitEvent: false });
    input.value = clean;

    if (this.singleCheckTimer) clearTimeout(this.singleCheckTimer);
    this.singleCheckTimer = setTimeout(() => {
      this.validateCustomCode(clean, 'single');
    }, 350);
  }

  public onSeriesCustomCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    this.seriesForm.patchValue({ customJoinCode: clean }, { emitEvent: false });
    input.value = clean;

    if (this.seriesCheckTimer) clearTimeout(this.seriesCheckTimer);
    this.seriesCheckTimer = setTimeout(() => {
      this.validateCustomCode(clean, 'series');
    }, 350);
  }

  private async validateCustomCode(code: string, target: 'single' | 'series'): Promise<void> {
    const statusSignal = target === 'single' ? this.singleCodeStatus : this.seriesCodeStatus;

    if (!code || code.trim().length === 0) {
      statusSignal.set({ checking: false });
      return;
    }

    if (code.length < 3) {
      statusSignal.set({ checking: false, error: 'Code must be at least 3 characters' });
      return;
    }

    statusSignal.set({ checking: true });
    const res = await this.qaService.checkCodeAvailability(code);
    statusSignal.set({ checking: false, available: res.available, error: res.error });
  }

  public singleCodePreview(): string {
    if (this.singleCodeMode() === 'auto') {
      return this.singleAutoCode();
    }
    const val = (this.singleForm.value.customJoinCode || '').trim();
    return val ? val.toUpperCase() : 'YOURCODE';
  }

  public seriesCodePreview(): string {
    if (this.seriesCodeMode() === 'auto') {
      return this.seriesAutoCode();
    }
    const val = (this.seriesForm.value.customJoinCode || '').trim();
    return val ? val.toUpperCase() : 'YOURCODE';
  }

  public getInitials(): string {
    const name = this.qaService.userName() || this.firebaseService.currentUser()?.displayName || 'Host';
    return name.slice(0, 2).toUpperCase();
  }

  public getRoleBadge(): string {
    const role = this.qaService.userRole();
    if (role === 'organizer') return 'Event Organizer';
    if (role === 'speaker') return 'Keynote Speaker';
    if (role === 'moderator') return 'Session Moderator';
    return 'Staff Member';
  }

  public async refreshSpeakerInvites(): Promise<void> {
    const email = this.qaService.userEmail() || this.firebaseService.currentUser()?.email || '';
    const invites = await this.qaService.fetchSpeakerInvites(email);
    if (invites.length === 0) {
      this.qaService.showToast('No invited talks found for this Gmail yet.');
    } else {
      this.qaService.showToast(`Loaded ${invites.length} invited talk${invites.length === 1 ? '' : 's'}.`);
    }
  }

  public async openSpeakerInvite(invite: SpeakerInviteRecord): Promise<void> {
    await this.qaService.joinAsInvitedSpeaker(invite);
  }

  public signOut(): void {
    this.firebaseService.logOut();
    this.qaService.userRole.set('attendee');
    this.qaService.userAuthToken.set(null);
    this.qaService.speakerInvites.set([]);
    this.qaService.showToast('Signed out of Host Studio');
    this.qaService.navigateToJoin();
  }

  public openCreateModal(mode: 'series' | 'single'): void {
    this.modalMode.set(mode);
    if (mode === 'single') {
      this.singleUploadedFileName.set(null);
      this.singleUploadedFileSize.set(null);
    }
    this.showCreateModal.set(true);
  }

  public onSingleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isSingleDragging.set(true);
  }

  public onSingleDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isSingleDragging.set(false);
  }

  public onSingleFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isSingleDragging.set(false);
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      this.processSingleFile(event.dataTransfer.files[0]);
    }
  }

  public onSingleFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processSingleFile(input.files[0]);
      input.value = '';
    }
  }

  public removeSingleUploadedFile(): void {
    this.singleUploadedFileName.set(null);
    this.singleUploadedFileSize.set(null);
    this.singleForm.patchValue({ groundingContext: '' });
  }

  public async processSingleFile(file: File): Promise<void> {
    if (!file) return;
    this.isSingleReadingFile.set(true);
    this.singleUploadedFileName.set(file.name);
    this.singleUploadedFileSize.set(this.formatFileSize(file.size));

    try {
      const extracted = await extractGroundingTextFromFile(file);
      this.singleForm.patchValue({ groundingContext: extracted.text });
      const via = extracted.method === 'gemini-ocr' ? 'Gemini OCR' : 'text import';
      this.qaService.showToast(
        `Extracted ${extracted.charCount.toLocaleString()} characters from ${file.name} via ${via}`
      );
    } catch (err) {
      console.error('Failed to parse uploaded slide deck file:', err);
      this.singleUploadedFileName.set(null);
      this.singleUploadedFileSize.set(null);
      this.qaService.showToast(
        err instanceof Error ? err.message : 'Could not read document. Please paste notes directly.'
      );
    } finally {
      this.isSingleReadingFile.set(false);
    }
  }

  public formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  public addSegment(): void {
    const idx = this.segments().length + 1;
    this.segments.update(s => [
      ...s,
      {
        id: 'seg-' + Math.random().toString(36).substring(2, 7),
        title: `Talk ${idx}`,
        speakerName: '',
        speakerRole: '',
        speakerOrg: '',
        speakerEmail: '',
        type: 'TALK',
        durationMinutes: 40,
        startTime: '',
        groundingContext: '',
        categories: 'General',
      },
    ]);
  }

  public removeSegment(id: string): void {
    if (this.segments().length <= 1) return;
    this.segments.update(s => s.filter(x => x.id !== id));
  }

  public updateSegment(id: string, field: keyof SegmentDraft, val: string | number | SegmentType): void {
    this.segments.update(list =>
      list.map(x => (x.id === id ? { ...x, [field]: val } : x))
    );
  }

  public async submitCreateSingle(): Promise<void> {
    if (this.singleForm.invalid) return;
    const v = this.singleForm.value;

    let joinCodeToUse: string | undefined = undefined;
    if (this.singleCodeMode() === 'custom') {
      const custom = (v.customJoinCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (!custom || custom.length < 3) {
        this.qaService.showToast('Please enter a valid custom code (at least 3 alphanumeric characters)');
        return;
      }
      if (this.singleCodeStatus().available === false) {
        this.qaService.showToast(`Custom code #${custom} is already in use. Please select another code.`);
        return;
      }
      joinCodeToUse = custom;
    } else {
      joinCodeToUse = this.singleAutoCode();
    }

    this.isSubmitting.set(true);
    const session = await this.qaService.createSession({
      title: v.title || 'Live Keynote Session',
      contextData: v.groundingContext || '',
      customJoinCode: joinCodeToUse,
    });
    this.isSubmitting.set(false);
    if (session) {
      this.singleUploadedFileName.set(null);
      this.singleUploadedFileSize.set(null);
      this.showCreateModal.set(false);
      this.qaService.showToast(`Keynote Session created with code #${session.joinCode}!`);
    }
  }

  public async submitCreateSeries(): Promise<void> {
    if (this.seriesForm.invalid) return;
    const v = this.seriesForm.value;

    let seriesCodeToUse: string | undefined = undefined;
    if (this.seriesCodeMode() === 'custom') {
      const custom = (v.customJoinCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (!custom || custom.length < 3) {
        this.qaService.showToast('Please enter a valid custom series code (at least 3 characters)');
        return;
      }
      if (this.seriesCodeStatus().available === false) {
        this.qaService.showToast(`Custom series code #${custom} is already in use. Please select another code.`);
        return;
      }
      seriesCodeToUse = custom;
    } else {
      seriesCodeToUse = this.seriesAutoCode();
    }

    this.isSubmitting.set(true);
    const series = await this.qaService.createSeries({
      title: v.title || 'Multi-Speaker Workshop Series',
      description: v.description || '',
      customJoinCode: seriesCodeToUse,
      geminiApiKey: (v.geminiApiKey || '').trim() || undefined,
      segments: this.segments().map(s => ({
        id: s.id,
        title: s.title,
        speakerName: s.speakerName,
        speakerRole: s.speakerRole,
        speakerEmail: (s.speakerEmail || '').trim().toLowerCase() || undefined,
        topicSummary: s.topicSummary,
        durationMinutes: s.durationMinutes,
        type: s.type,
      })),
    });
    this.isSubmitting.set(false);
    if (series) {
      this.showCreateModal.set(false);
      this.qaService.showToast(`Workshop Series created with code #${series.joinCode}!`);
    }
  }

  public async reenterAsHost(session: HostedSessionRecord): Promise<void> {
    await this.qaService.reenterAsHost(session);
  }

  public openShare(session: HostedSessionRecord): void {
    this.qaService.openShareModal(session.joinCode, session.title, session.type, session.description);
  }

  public formatDate(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}
