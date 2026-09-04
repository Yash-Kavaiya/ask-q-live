import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { VoiceService } from '../services/voice.service';
import { FirebaseService } from '../services/firebase.service';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E0E2EC] transition-all">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16 gap-4">
          
          <!-- Logo & Session Info -->
          <div class="flex items-center gap-3 min-w-0">
            <button
              type="button"
              (click)="!qaService.currentSession() && !qaService.currentSeries() && qaService.navigateToJoin()"
              [disabled]="!!qaService.currentSession() || !!qaService.currentSeries()"
              class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0 disabled:opacity-100 cursor-pointer disabled:cursor-default"
              title="AskQlive Home"
            >
              <mat-icon class="text-white text-2xl">forum</mat-icon>
            </button>
            
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="!qaService.currentSession() && !qaService.currentSeries() && qaService.navigateToJoin()"
                  [disabled]="!!qaService.currentSession() || !!qaService.currentSeries()"
                  class="font-display font-extrabold text-lg text-slate-900 tracking-tight truncate text-left cursor-pointer disabled:cursor-default"
                >
                  AskQlive
                </button>
                
                @if (qaService.currentSession() || qaService.currentSeries()) {
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#1E8E3E] animate-live-dot"></span>
                    LIVE
                  </span>
                }
              </div>

              @if (qaService.currentSeries() || qaService.currentSession(); as session) {
                <div class="flex items-center gap-2 text-xs text-[#747775] truncate">
                  <span class="truncate max-w-[140px] sm:max-w-xs font-medium text-[#444746]" [title]="session.title">{{ session.title }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Center Navigation Tabs (when in session) -->
          @if (qaService.currentSession() || qaService.currentSeries()) {
            <nav class="hidden lg:flex items-center gap-1 bg-[#F1F3F4] p-1 rounded-xl text-sm font-medium border border-[#E0E2EC]">
              <button
                id="nav-tab-feed"
                type="button"
                (click)="qaService.activeTab.set('feed')"
                class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                [class.bg-white]="qaService.activeTab() === 'feed'"
                [class.text-indigo-600]="qaService.activeTab() === 'feed'"
                [class.shadow-xs]="qaService.activeTab() === 'feed'"
                [class.text-[#444746]]="qaService.activeTab() !== 'feed'"
              >
                <mat-icon class="text-base">question_answer</mat-icon>
                <span>Live Feed</span>
                @if (qaService.questions().length > 0) {
                  <span class="text-xs px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-600 font-semibold">
                    {{ qaService.questions().length }}
                  </span>
                }
              </button>

              <!-- Series Run of Show / Control Room -->
              <button
                id="nav-tab-series-control"
                type="button"
                (click)="qaService.activeTab.set('series-control')"
                class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                [class.bg-white]="qaService.activeTab() === 'series-control'"
                [class.text-indigo-600]="qaService.activeTab() === 'series-control'"
                [class.shadow-xs]="qaService.activeTab() === 'series-control'"
                [class.text-[#444746]]="qaService.activeTab() !== 'series-control'"
              >
                <mat-icon class="text-base">view_timeline</mat-icon>
                <span>Run of Show</span>
                @if (qaService.segments().length > 0) {
                  <span class="text-xs px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                    {{ qaService.segments().length }}
                  </span>
                }
              </button>

              <button
                id="nav-tab-teleprompter"
                type="button"
                (click)="qaService.activeTab.set('teleprompter')"
                class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                [class.bg-white]="qaService.activeTab() === 'teleprompter'"
                [class.text-indigo-600]="qaService.activeTab() === 'teleprompter'"
                [class.shadow-xs]="qaService.activeTab() === 'teleprompter'"
                [class.text-[#444746]]="qaService.activeTab() !== 'teleprompter'"
              >
                <mat-icon class="text-base">live_tv</mat-icon>
                <span>Teleprompter</span>
              </button>

              <button
                id="nav-tab-analytics"
                type="button"
                (click)="qaService.activeTab.set('analytics')"
                class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                [class.bg-white]="qaService.activeTab() === 'analytics'"
                [class.text-indigo-600]="qaService.activeTab() === 'analytics'"
                [class.shadow-xs]="qaService.activeTab() === 'analytics'"
                [class.text-[#444746]]="qaService.activeTab() !== 'analytics'"
              >
                <mat-icon class="text-base">insights</mat-icon>
                <span>Analytics</span>
              </button>

              @if (qaService.isAdmin()) {
                <button
                  id="nav-tab-moderation"
                  type="button"
                  (click)="qaService.activeTab.set('moderation')"
                  class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer relative"
                  [class.bg-white]="qaService.activeTab() === 'moderation'"
                  [class.text-indigo-600]="qaService.activeTab() === 'moderation'"
                  [class.shadow-xs]="qaService.activeTab() === 'moderation'"
                  [class.text-[#444746]]="qaService.activeTab() !== 'moderation'"
                >
                  <mat-icon class="text-base">gavel</mat-icon>
                  <span>Moderation</span>
                  @if (qaService.pendingModerationQuestions().length > 0) {
                    <span class="w-2 h-2 rounded-full bg-[#D93025] animate-pulse"></span>
                  }
                </button>

                <button
                  id="nav-tab-grounding"
                  type="button"
                  (click)="qaService.activeTab.set('grounding')"
                  class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                  [class.bg-white]="qaService.activeTab() === 'grounding'"
                  [class.text-indigo-600]="qaService.activeTab() === 'grounding'"
                  [class.shadow-xs]="qaService.activeTab() === 'grounding'"
                  [class.text-[#444746]]="qaService.activeTab() !== 'grounding'"
                >
                  <mat-icon class="text-base">auto_stories</mat-icon>
                  <span>Grounding</span>
                </button>
              }

              <button
                id="nav-tab-report"
                type="button"
                (click)="qaService.activeTab.set('report')"
                class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                [class.bg-white]="qaService.activeTab() === 'report'"
                [class.text-indigo-600]="qaService.activeTab() === 'report'"
                [class.shadow-xs]="qaService.activeTab() === 'report'"
                [class.text-[#444746]]="qaService.activeTab() !== 'report'"
              >
                <mat-icon class="text-base">summarize</mat-icon>
                <span>Report</span>
              </button>
            </nav>
          }

          <!-- Right Action Controls -->
          <div class="flex items-center gap-2 shrink-0">
            @if (qaService.currentSeries() || qaService.currentSession(); as session) {
              <!-- Room Join Code with Quick Copy -->
              <button
                id="btn-header-room-code"
                type="button"
                (click)="copyJoinCode(session.joinCode)"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold font-mono bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs transition-all cursor-pointer select-none active:scale-95"
                [title]="isCodeCopied() ? 'Copied to clipboard!' : 'Room Code #' + session.joinCode + ' (Click to copy)'"
                aria-label="Room code"
              >
                <span class="text-[10px] font-sans font-semibold uppercase tracking-wider text-indigo-500 hidden md:inline">Code:</span>
                <span>#{{ session.joinCode }}</span>
                <mat-icon class="text-sm scale-85 text-indigo-500">content_copy</mat-icon>
                @if (isCodeCopied()) {
                  <span class="text-emerald-700 font-bold font-sans text-[10px] bg-emerald-50 px-1 rounded animate-fade-in">Copied!</span>
                }
              </button>

              <!-- Prominent QR Code Button -->
              <button
                id="btn-header-qr-code"
                type="button"
                (click)="qaService.openShareModal(session.joinCode, session.title, qaService.currentSeries() ? 'series' : 'single')"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 hover:border-indigo-300 shadow-2xs transition-all cursor-pointer select-none active:scale-95"
                title="View & Share QR Code for attendees to scan and join"
                aria-label="Open session QR code"
              >
                <mat-icon class="text-base text-indigo-600">qr_code_2</mat-icon>
                <span class="hidden sm:inline">QR Code</span>
                <span class="sm:hidden">QR</span>
              </button>
            }

            @if (qaService.currentSession() || qaService.currentSeries()) {
              <!-- Simulate Audience Activity (Demo booster) -->
              <button
                id="btn-simulate-traffic"
                type="button"
                (click)="simulateLiveTraffic()"
                class="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer border border-indigo-200"
                title="Simulate live audience question &amp; upvote stream for presentation demo"
              >
                <mat-icon class="text-sm">bolt</mat-icon>
                <span>Simulate</span>
              </button>

              <!-- Server-Verified Role Indicator -->
              <div
                id="badge-auth-role"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border select-none"
                [class.bg-emerald-700]="qaService.isOrganizer()"
                [class.text-white]="qaService.isOrganizer()"
                [class.border-emerald-700]="qaService.isOrganizer()"
                [class.bg-amber-600]="qaService.isSpeaker()"
                [class.text-white]="qaService.isSpeaker()"
                [class.border-amber-600]="qaService.isSpeaker()"
                [class.bg-slate-100]="!qaService.isStaff()"
                [class.text-slate-700]="!qaService.isStaff()"
                [class.border-slate-300]="!qaService.isStaff()"
                [title]="'Current Verified Role: ' + qaService.userRole()"
              >
                <mat-icon class="text-sm">
                  {{ qaService.isOrganizer() ? 'admin_panel_settings' : qaService.isSpeaker() ? 'record_voice_over' : 'person' }}
                </mat-icon>
                <span class="capitalize">{{ qaService.userRole() }}</span>
              </div>

              <!-- Leave Session -->
              <button
                id="btn-leave-session"
                type="button"
                (click)="qaService.leaveSession()"
                class="p-2 rounded-lg text-[#747775] hover:text-[#D93025] hover:bg-[#FCE8E6] transition-colors cursor-pointer"
                title="Exit Session"
              >
                <mat-icon class="text-xl">logout</mat-icon>
              </button>
            } @else {
              @if (qaService.currentView() === 'join') {
                @if (firebaseService.isOrganizerLoggedIn()) {
                  <button
                    id="btn-nav-host-studio"
                    type="button"
                    (click)="qaService.navigateToHostStudio()"
                    class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-all cursor-pointer"
                  >
                    <mat-icon class="text-sm">dashboard</mat-icon>
                    <span>Host Studio</span>
                  </button>
                } @else {
                  <button
                    id="btn-nav-auth"
                    type="button"
                    (click)="qaService.navigateToAuth()"
                    class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-all cursor-pointer"
                  >
                    <mat-icon class="text-sm">login</mat-icon>
                    <span>Host / Staff Sign In</span>
                  </button>
                }
              } @else {
                <button
                  id="btn-nav-back-join"
                  type="button"
                  (click)="qaService.navigateToJoin()"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all cursor-pointer"
                >
                  <mat-icon class="text-sm">meeting_room</mat-icon>
                  <span>Join Event by Code</span>
                </button>
              }
            }
          </div>
        </div>

        <!-- Mobile Secondary Tab Bar -->
        @if (qaService.currentSession() || qaService.currentSeries()) {
          <div class="flex lg:hidden overflow-x-auto py-2 gap-1.5 border-t border-[#E0E2EC] scrollbar-none text-xs">
            <button
              id="mob-tab-feed"
              type="button"
              (click)="qaService.activeTab.set('feed')"
              class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1"
              [class.bg-indigo-600]="qaService.activeTab() === 'feed'"
              [class.text-white]="qaService.activeTab() === 'feed'"
              [class.bg-[#F1F3F4]]="qaService.activeTab() !== 'feed'"
              [class.text-[#444746]]="qaService.activeTab() !== 'feed'"
            >
              <mat-icon class="text-sm">question_answer</mat-icon>
              Feed ({{ qaService.questions().length }})
            </button>

            <button
              id="mob-tab-series-control"
              type="button"
              (click)="qaService.activeTab.set('series-control')"
              class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1"
              [class.bg-indigo-600]="qaService.activeTab() === 'series-control'"
              [class.text-white]="qaService.activeTab() === 'series-control'"
              [class.bg-[#F1F3F4]]="qaService.activeTab() !== 'series-control'"
              [class.text-[#444746]]="qaService.activeTab() !== 'series-control'"
            >
              <mat-icon class="text-sm">view_timeline</mat-icon>
              Run of Show
            </button>

            <button
              id="mob-tab-teleprompter"
              type="button"
              (click)="qaService.activeTab.set('teleprompter')"
              class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1"
              [class.bg-indigo-600]="qaService.activeTab() === 'teleprompter'"
              [class.text-white]="qaService.activeTab() === 'teleprompter'"
              [class.bg-[#F1F3F4]]="qaService.activeTab() !== 'teleprompter'"
              [class.text-[#444746]]="qaService.activeTab() !== 'teleprompter'"
            >
              <mat-icon class="text-sm">live_tv</mat-icon>
              Teleprompter
            </button>

            <button
              id="mob-tab-analytics"
              type="button"
              (click)="qaService.activeTab.set('analytics')"
              class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1"
              [class.bg-indigo-600]="qaService.activeTab() === 'analytics'"
              [class.text-white]="qaService.activeTab() === 'analytics'"
              [class.bg-[#F1F3F4]]="qaService.activeTab() !== 'analytics'"
              [class.text-[#444746]]="qaService.activeTab() !== 'analytics'"
            >
              <mat-icon class="text-sm">insights</mat-icon>
              Analytics
            </button>

            @if (qaService.isAdmin()) {
              <button
                id="mob-tab-moderation"
                type="button"
                (click)="qaService.activeTab.set('moderation')"
                class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1"
                [class.bg-indigo-600]="qaService.activeTab() === 'moderation'"
                [class.text-white]="qaService.activeTab() === 'moderation'"
                [class.bg-[#F1F3F4]]="qaService.activeTab() !== 'moderation'"
                [class.text-[#444746]]="qaService.activeTab() !== 'moderation'"
              >
                <mat-icon class="text-sm">gavel</mat-icon>
                Mod
              </button>
            }

            <button
              id="mob-tab-report"
              type="button"
              (click)="qaService.activeTab.set('report')"
              class="px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex items-center gap-1"
              [class.bg-indigo-600]="qaService.activeTab() === 'report'"
              [class.text-white]="qaService.activeTab() === 'report'"
              [class.bg-[#F1F3F4]]="qaService.activeTab() !== 'report'"
              [class.text-[#444746]]="qaService.activeTab() !== 'report'"
            >
              <mat-icon class="text-sm">summarize</mat-icon>
              Report
            </button>
          </div>
        }
      </div>
    </header>
  `,
})
export class Header {
  public qaService = inject(QaService);
  public voiceService = inject(VoiceService);
  public firebaseService = inject(FirebaseService);
  public isCodeCopied = signal<boolean>(false);

  public copyJoinCode(code: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      this.isCodeCopied.set(true);
      this.qaService.showToast(`Room code #${code} copied to clipboard!`);
      setTimeout(() => {
        this.isCodeCopied.set(false);
      }, 2500);
    }
  }

  public simulateLiveTraffic(): void {
    this.qaService.simulateTraffic();
  }
}

