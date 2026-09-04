import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { FirebaseService } from '../services/firebase.service';
import { HostedSessionRecord, SegmentType } from '../models/qa.models';

export interface SegmentDraft {
  id: string;
  title: string;
  speakerName: string;
  speakerRole?: string;
  speakerOrg?: string;
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
              Host &amp; Organizer Studio
            </h1>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Enterprise
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Create events, manage multi-speaker workshop series, and resume stage controls.
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

      <!-- Quick Action Cards: Launch New Events -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- Action 1: Create Workshop Series -->
        <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-md border border-indigo-900/50 relative overflow-hidden group">
          <div class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none"></div>
          
          <div class="relative z-10 space-y-4">
            <div class="flex items-center justify-between">
              <div class="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                <mat-icon class="text-indigo-300 text-2xl">view_timeline</mat-icon>
              </div>
              <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                Flagship Feature
              </span>
            </div>

            <div>
              <h2 class="font-display font-bold text-xl text-white">Create Multi-Speaker Series</h2>
              <p class="text-indigo-200/80 text-xs leading-relaxed mt-1">
                Single master URL for attendees. Organize talks, speaker assignments, live stage teleprompters, and automatic segment routing.
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
            <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Quick Setup
            </span>
          </div>

          <div>
            <h2 class="font-display font-bold text-xl text-slate-900">Create Single Keynote Session</h2>
            <p class="text-slate-500 text-xs leading-relaxed mt-1">
              Ideal for stand-alone webinars, AMAs, executive addresses, or guest speaker lectures with AI grounded answers.
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

      <!-- ================= PAST HOSTED SESSIONS SECTION ================= -->
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
                Your previously created events. Re-enter as host with organizer credentials or share QR codes with attendees.
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

        <!-- Sessions List -->
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
              (click)="openCreateModal('series')"
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
                class="p-4 rounded-2xl border border-slate-200 bg-slate-50/40 hover:bg-white hover:border-indigo-200 hover:shadow-sm transition-all space-y-3"
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
                    (click)="qaService.removeHostedSession(session.joinCode)"
                    class="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove from history"
                  >
                    <mat-icon class="text-base">delete_outline</mat-icon>
                  </button>
                </div>

                <div>
                  <h3 class="font-display font-bold text-sm text-slate-900 leading-snug line-clamp-1">
                    {{ session.title }}
                  </h3>
                  @if (session.description) {
                    <p class="text-xs text-slate-500 line-clamp-1 mt-0.5">{{ session.description }}</p>
                  }
                </div>

                <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                  <span>{{ formatDate(session.lastAccessedAt) }}</span>
                  <span>{{ session.type === 'series' ? (session.segmentCount || 1) + ' segments' : (session.questionCount || 0) + ' questions' }}</span>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    (click)="reenterAsHost(session)"
                    [disabled]="qaService.isLoading()"
                    class="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <mat-icon class="text-sm">login</mat-icon>
                    <span>Resume as Host</span>
                  </button>

                  <button
                    type="button"
                    (click)="openShare(session)"
                    class="py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                  {{ modalMode() === 'series' ? 'Multi-talk event with master attendee URL & teleprompters' : 'Instant Q&A feed with grounded AI synthesis' }}
                </p>
              </div>
            </div>

            <!-- Single Session Form -->
            @if (modalMode() === 'single') {
              <form [formGroup]="singleForm" (ngSubmit)="submitCreateSingle()" class="space-y-4">
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

                <div>
                  <label for="single-grounding-context" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    AI Grounding Slide Deck Context (Optional)
                  </label>
                  <textarea
                    id="single-grounding-context"
                    formControlName="groundingContext"
                    rows="2"
                    placeholder="Paste slide deck bullet points, key facts, or speaker abstract for instant AI grounded answers..."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none"
                  ></textarea>
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
                          placeholder="e.g. NEXT26, AI2026, KEYNOTE1"
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

  public segments = signal<SegmentDraft[]>([
    {
      id: 'seg-1',
      title: 'Opening Keynote & Multimodal Agent Architecture',
      speakerName: 'Dr. Sundar Varma',
      speakerRole: 'VP, Cloud AI',
      speakerOrg: 'Google DeepMind',
      type: 'TALK',
      durationMinutes: 45,
      startTime: '09:00',
      groundingContext: 'Overview of Gemini Multimodal Live API, Antigravity autonomous coding, and real-time audio agents.',
      categories: 'AI,Architecture',
    },
    {
      id: 'seg-2',
      title: 'Live Stage Teleprompter & Crowd Consensus',
      speakerName: 'Elena Rostova',
      speakerRole: 'Principal Architect',
      speakerOrg: 'Cloud Scale Labs',
      type: 'TALK',
      durationMinutes: 40,
      startTime: '10:00',
      groundingContext: 'Real-time speaker confidence teleprompting and crowd question clustering.',
      categories: 'Stage,UX',
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
    codeMode: ['auto'],
    customJoinCode: [''],
  });

  public singleCodeMode = signal<'auto' | 'custom'>('auto');
  public seriesCodeMode = signal<'auto' | 'custom'>('auto');

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

  public signOut(): void {
    this.firebaseService.logOut();
    this.qaService.userRole.set('attendee');
    this.qaService.userAuthToken.set(null);
    this.qaService.showToast('Signed out of Host Studio');
    this.qaService.navigateToJoin();
  }

  public openCreateModal(mode: 'series' | 'single'): void {
    this.modalMode.set(mode);
    this.showCreateModal.set(true);
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
      segments: this.segments().map(s => ({
        id: s.id,
        title: s.title,
        speakerName: s.speakerName,
        speakerRole: s.speakerRole,
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
