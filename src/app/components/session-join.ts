import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { FirebaseService } from '../services/firebase.service';
import { HostedSessionRecord, ModerationSensitivity, Segment, SegmentType } from '../models/qa.models';

interface SegmentDraft {
  id: string;
  title: string;
  speakerName: string;
  speakerRole: string;
  speakerOrg: string;
  type: SegmentType;
  durationMinutes: number;
  startTime: string;
  groundingContext: string;
  categories: string;
}

@Component({
  selector: 'app-session-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      
      <!-- Top Introduction Banner -->
      <div class="text-center mb-8 sm:mb-12">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold uppercase tracking-wider mb-4">
          <mat-icon class="text-sm">auto_awesome</mat-icon>
          AI-Powered Live Session &amp; Workshop Q&amp;A
        </div>
        <h1 class="font-display text-3xl sm:text-5xl font-extrabold text-[#1F1F1F] tracking-tight mb-3">
          AskQlive
        </h1>
        <p class="max-w-2xl mx-auto text-[#444746] text-base sm:text-lg leading-relaxed">
          Real-time audience interaction powered by structured AI answers, multi-speaker workshop series with single-link routing, and live speaker confidence teleprompting.
        </p>
      </div>

      <!-- Main Operational Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        <!-- Left: Join via Event Code Card (7 cols) -->
        <div id="join-card" class="md:col-span-7 bg-white rounded-2xl p-6 sm:p-8 border border-[#E0E2EC] shadow-sm">
          <div class="flex items-center justify-between pb-4 border-b border-[#E0E2EC] mb-5">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center">
                <mat-icon class="text-xl">meeting_room</mat-icon>
              </div>
              <div>
                <h2 class="font-display font-bold text-xl text-[#1F1F1F]">Join via Event Code</h2>
                <p class="text-[11px] text-[#747775]">Audience Q&amp;A Feed • Zero Auth Required</p>
              </div>
            </div>
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>No Login Required for Attendees</span>
            </span>
          </div>

          <!-- Auto-joining URL Banner -->
          @if (qaService.autoJoinCode() && !qaService.currentSession() && !qaService.currentSeries()) {
            <div id="banner-auto-join" class="mb-4 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center justify-between gap-2 shadow-2xs">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping"></span>
                <span>Invite code detected: <strong class="font-mono text-sm uppercase">#{{ qaService.autoJoinCode() }}</strong>. Automatically entering event room...</span>
              </div>
              <span class="text-[11px] text-indigo-600 font-semibold font-mono">Auto-Connecting</span>
            </div>
          }

          <form [formGroup]="joinForm" (ngSubmit)="onJoinSubmit()" class="space-y-4">
            
            <!-- Room Code Input (Prominent & Clear) -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="input-room-code" class="block text-xs font-bold text-[#444746] uppercase tracking-wider">
                  Event Room Code *
                </label>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[10px] text-slate-400">Quick Test:</span>
                  <button
                    type="button"
                    (click)="fillSampleCode('GDGLIVE')"
                    class="text-[11px] font-bold font-mono text-purple-700 bg-purple-50 hover:bg-purple-100 px-1.5 py-0.5 rounded cursor-pointer border border-purple-200"
                  >
                    #GDGLIVE
                  </button>
                  <button
                    type="button"
                    (click)="fillSampleCode('NVIDIA')"
                    class="text-[11px] font-bold font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded cursor-pointer border border-emerald-200"
                  >
                    #NVIDIA
                  </button>
                  <button
                    type="button"
                    (click)="fillSampleCode('NEXT26')"
                    class="text-[11px] font-bold font-mono text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded cursor-pointer border border-indigo-200"
                  >
                    #NEXT26
                  </button>
                </div>
              </div>

              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-indigo-600">
                  <mat-icon class="text-xl">tag</mat-icon>
                </div>
                <input
                  id="input-room-code"
                  type="text"
                  formControlName="joinCode"
                  placeholder="e.g. GDGLIVE, NVIDIA or NEXT26"
                  class="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border-2 border-[#E0E2EC] focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-100 rounded-xl text-base font-mono uppercase font-bold tracking-wider text-[#1F1F1F] placeholder:text-[#8E918F] transition-all outline-none"
                  maxlength="16"
                  autocapitalize="characters"
                />
              </div>
            </div>

            <!-- Optional Name & Email for Attendees -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="input-user-name" class="block text-xs font-semibold text-[#444746] uppercase tracking-wider mb-1.5">
                  Display Name (Optional)
                </label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#747775]">
                    <mat-icon class="text-xl">badge</mat-icon>
                  </div>
                  <input
                    id="input-user-name"
                    type="text"
                    formControlName="userName"
                    placeholder="e.g. Alex Rivera (or leave blank for Anon)"
                    class="w-full pl-10 pr-4 py-2.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-100 rounded-xl text-sm text-[#1F1F1F] placeholder:text-[#8E918F] transition-all outline-none"
                    maxlength="40"
                  />
                </div>
              </div>

              <div>
                <label for="input-user-email" class="block text-xs font-semibold text-[#444746] uppercase tracking-wider mb-1.5">
                  Email (Optional)
                </label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#747775]">
                    <mat-icon class="text-xl">mail</mat-icon>
                  </div>
                  <input
                    id="input-user-email"
                    type="email"
                    formControlName="userEmail"
                    placeholder="alex@example.com"
                    class="w-full pl-10 pr-4 py-2.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-100 rounded-xl text-sm text-[#1F1F1F] placeholder:text-[#8E918F] transition-all outline-none"
                    maxlength="60"
                  />
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <input
                id="check-anonymous-default"
                type="checkbox"
                formControlName="postAsAnonymous"
                class="w-4 h-4 rounded border-[#747775] text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label for="check-anonymous-default" class="text-xs text-[#444746] cursor-pointer select-none">
                Post anonymously by default (keeps identity hidden)
              </label>
            </div>

            @if (qaService.errorMessage()) {
              <div class="p-3 rounded-xl bg-[#FCE8E6] text-[#D93025] border border-[#F5C2C7] text-xs flex items-center gap-2">
                <mat-icon class="text-sm shrink-0">warning</mat-icon>
                <span>{{ qaService.errorMessage() }}</span>
              </div>
            }

            <!-- Primary Join Actions -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                id="btn-submit-join"
                type="submit"
                [disabled]="qaService.isLoading()"
                class="w-full py-3.5 px-5 rounded-xl font-display font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                @if (qaService.isLoading()) {
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Joining Session...</span>
                } @else {
                  <mat-icon class="text-lg">login</mat-icon>
                  <span>Join via Code</span>
                }
              </button>

              <button
                id="btn-join-anonymous"
                type="button"
                (click)="joinAsPureAnonymous()"
                [disabled]="qaService.isLoading()"
                class="w-full py-3.5 px-4 rounded-xl font-display font-semibold text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
              >
                <mat-icon class="text-base text-slate-500">visibility_off</mat-icon>
                <span>Join 100% Anonymous</span>
              </button>
            </div>
          </form>

          <!-- Attendee Information Card -->
          <div class="mt-5 pt-4 border-t border-[#E0E2EC]">
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
              <div class="font-bold text-slate-900 flex items-center gap-1.5">
                <mat-icon class="text-sm text-indigo-600">verified_user</mat-icon>
                <span>Zero Authentication for Attendees</span>
              </div>
              <p class="leading-relaxed text-[11px]">
                Attendees join immediately with zero sign-in or credentials required. Enter the room code to submit questions, upvote topics, and see AI grounded answers synthesized from presenter notes in real time.
              </p>
            </div>
          </div>
        </div>

        <!-- Right: Host Your Own Event Card (5 cols) - Kept Clean & Simple -->
        <div id="host-card" class="md:col-span-5 space-y-4">
          <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-md border border-indigo-900/50 relative overflow-hidden">
            <div class="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none"></div>

            <div class="relative z-10 space-y-4">
              <div class="flex items-center justify-between">
                <div class="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                  <mat-icon class="text-indigo-300 text-2xl">theater_comedy</mat-icon>
                </div>
                <span class="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                  Organizer Suite
                </span>
              </div>

              <div>
                <h2 class="font-display font-bold text-xl text-white">Host Your Own Event</h2>
                <p class="text-indigo-200/80 text-xs leading-relaxed mt-1.5">
                  Launch interactive multi-speaker workshop series or single presentation sessions with real-time AI synthesis, teleprompting, and automated deduplication.
                </p>
              </div>

              <!-- Auth Status & Entry to Host Portal / Studio -->
              <div class="p-3.5 rounded-xl bg-white/10 border border-white/10 text-xs">
                @if (firebaseService.isOrganizerLoggedIn()) {
                  <div class="space-y-3">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2 truncate">
                        <mat-icon class="text-emerald-400 text-base shrink-0">verified</mat-icon>
                        <div class="truncate">
                          <div class="font-bold text-white text-xs truncate">
                            {{ firebaseService.currentUser()?.displayName || firebaseService.currentUser()?.email || 'Organizer' }}
                          </div>
                          <div class="text-[10px] text-emerald-300">Staff Verified ({{ qaService.userRole() }})</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        (click)="firebaseService.logOut()"
                        class="text-[10px] text-slate-300 hover:text-white px-2 py-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>

                    <button
                      id="btn-enter-host-studio"
                      type="button"
                      (click)="qaService.navigateToHostStudio()"
                      class="w-full py-2.5 px-4 rounded-xl font-display font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-all flex items-center justify-between cursor-pointer shadow-sm"
                    >
                      <span class="flex items-center gap-2">
                        <mat-icon class="text-base">dashboard</mat-icon>
                        <span>Open Host &amp; Organizer Studio</span>
                      </span>
                      <mat-icon class="text-sm">arrow_forward</mat-icon>
                    </button>
                  </div>
                } @else {
                  <div class="space-y-3">
                    <div class="flex items-center gap-2 text-indigo-200">
                      <mat-icon class="text-amber-400 text-base shrink-0">lock</mat-icon>
                      <span class="text-[11px] leading-snug">
                        Authentication required for Organizers, Speakers, and Moderators.
                      </span>
                    </div>

                    <button
                      id="btn-sign-in-host"
                      type="button"
                      (click)="qaService.navigateToAuth()"
                      class="w-full py-3 px-4 rounded-xl font-display font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <mat-icon class="text-base">login</mat-icon>
                      <span>Sign In or Sign Up to Host</span>
                    </button>
                  </div>
                }
              </div>

              <!-- Feature Highlights for Hosts -->
              <div class="grid grid-cols-2 gap-2 text-[11px] text-indigo-200/90 pt-1">
                <div class="flex items-center gap-1.5">
                  <mat-icon class="text-xs text-indigo-300">view_timeline</mat-icon>
                  <span>Multi-Speaker Series</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <mat-icon class="text-xs text-indigo-300">psychology</mat-icon>
                  <span>RAG AI Answers</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <mat-icon class="text-xs text-indigo-300">speed</mat-icon>
                  <span>Stage Teleprompter</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <mat-icon class="text-xs text-indigo-300">analytics</mat-icon>
                  <span>Executive Reports</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <!-- ================= FIREBASE AUTH LOGIN MODAL ================= -->
      @if (showAuthModal()) {
        <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 border border-slate-200 shadow-2xl relative animate-in fade-in zoom-in-95">
            <button
              id="btn-close-auth-modal"
              type="button"
              (click)="showAuthModal.set(false)"
              class="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
            >
              <mat-icon class="text-xl">close</mat-icon>
            </button>

            <div class="text-center mb-6">
              <div class="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                <mat-icon class="text-2xl">verified_user</mat-icon>
              </div>
              <h3 class="text-xl font-display font-bold text-slate-900">
                Organizer Authentication
              </h3>
              <p class="text-xs text-slate-500 mt-1">
                Sign in with Firebase to create, host, and manage live sessions and workshop series.
              </p>
            </div>

            @if (authError()) {
              <div class="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <mat-icon class="text-sm shrink-0">error</mat-icon>
                <span>{{ authError() }}</span>
              </div>
            }

            <!-- 1-Click Google Sign In -->
            <button
              id="btn-google-signin"
              type="button"
              (click)="signInGoogle()"
              [disabled]="isAuthLoading()"
              class="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs mb-4"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            <div class="relative flex items-center justify-center mb-4">
              <div class="border-t border-slate-200 w-full"></div>
              <span class="bg-white px-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Or Email</span>
            </div>

            <!-- Email / Password Form -->
            <form [formGroup]="authForm" (ngSubmit)="submitEmailAuth()" class="space-y-3">
              @if (isSignUpMode()) {
                <div>
                  <label for="auth-name" class="block text-xs font-semibold text-slate-700 mb-1">Your Name</label>
                  <input
                    id="auth-name"
                    type="text"
                    formControlName="name"
                    placeholder="e.g. Dr. Jane Smith"
                    class="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              }

              <div>
                <label for="auth-email" class="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  id="auth-email"
                  type="email"
                  formControlName="email"
                  placeholder="organizer@example.com"
                  class="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label for="auth-password" class="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  formControlName="password"
                  placeholder="At least 6 characters"
                  class="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <button
                id="btn-submit-email-auth"
                type="submit"
                [disabled]="authForm.invalid || isAuthLoading()"
                class="w-full py-2.5 px-4 rounded-xl font-display font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs mt-2"
              >
                @if (isAuthLoading()) {
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Authenticating...</span>
                } @else {
                  <span>{{ isSignUpMode() ? 'Create Organizer Account' : 'Sign In as Organizer' }}</span>
                }
              </button>
            </form>

            <div class="text-center mt-4 pt-3 border-t border-slate-100">
              <button
                type="button"
                (click)="isSignUpMode.set(!isSignUpMode())"
                class="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
              >
                {{ isSignUpMode() ? 'Already have an account? Sign In' : "Don't have an account? Create one" }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ================= QR CODE SHARING / SCANNER MODAL ================= -->
      @if (showQrModal()) {
        <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 shadow-2xl relative text-center animate-in fade-in zoom-in-95">
            <button
              (click)="showQrModal.set(false)"
              class="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <mat-icon class="text-xl">close</mat-icon>
            </button>

            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <mat-icon class="text-2xl">qr_code_scanner</mat-icon>
            </div>

            <h3 class="font-display font-bold text-lg text-slate-900 mb-1">
              Attendee Scan &amp; Join
            </h3>
            <p class="text-xs text-slate-500 mb-4">
              Point your smartphone camera at this QR code to join directly.
            </p>

            @if (qrCodeDataUrl()) {
              <div class="p-3 bg-white border border-slate-200 rounded-2xl inline-block shadow-sm mb-4">
                <img [src]="qrCodeDataUrl()" alt="Room Join QR Code" class="w-56 h-56 mx-auto rounded-lg" />
              </div>
            }

            <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 break-all mb-4 select-all">
              {{ directJoinLink() }}
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="copyJoinLink()"
                class="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <mat-icon class="text-sm">content_copy</mat-icon>
                <span>Copy Link</span>
              </button>
              <button
                type="button"
                (click)="showQrModal.set(false)"
                class="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ================= CREATE SESSION / WORKSHOP MODAL ================= -->
      @if (showCreateModal()) {
        <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div class="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 border border-slate-200 shadow-2xl my-8 relative max-h-[92vh] overflow-y-auto">
            
            <!-- Close Button -->
            <button
              id="btn-close-modal"
              type="button"
              (click)="showCreateModal.set(false)"
              class="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
            >
              <mat-icon class="text-xl">close</mat-icon>
            </button>

            <!-- Modal Header with Mode Selector Tabs -->
            <div class="mb-6">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[11px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  New Event Setup
                </span>
              </div>
              <h2 class="font-display font-bold text-2xl text-slate-900">
                {{ modalMode() === 'series' ? 'Create Multi-Speaker Workshop Series' : 'Create Single Keynote Session' }}
              </h2>
              <p class="text-xs text-slate-500 mt-1">
                {{ modalMode() === 'series' ? 'Setup a unified workshop with multiple sequential speakers, run-of-show schedule, and speaker presenter links.' : 'Setup a single presentation room with custom presentation slides grounding and live teleprompter.' }}
              </p>

              <!-- Tab Switcher -->
              <div class="flex items-center gap-2 mt-4 p-1 rounded-xl bg-slate-100 border border-slate-200/80">
                <button
                  id="tab-mode-series"
                  type="button"
                  (click)="setModalMode('series')"
                  class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  [class.bg-white]="modalMode() === 'series'"
                  [class.text-indigo-600]="modalMode() === 'series'"
                  [class.shadow-xs]="modalMode() === 'series'"
                  [class.text-slate-600]="modalMode() !== 'series'"
                >
                  <mat-icon class="text-sm">view_timeline</mat-icon>
                  <span>Workshop Series (Multi-Speaker)</span>
                </button>

                <button
                  id="tab-mode-single"
                  type="button"
                  (click)="setModalMode('single')"
                  class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  [class.bg-white]="modalMode() === 'single'"
                  [class.text-indigo-600]="modalMode() === 'single'"
                  [class.shadow-xs]="modalMode() === 'single'"
                  [class.text-slate-600]="modalMode() !== 'single'"
                >
                  <mat-icon class="text-sm">podium</mat-icon>
                  <span>Single Keynote</span>
                </button>
              </div>
            </div>

            <!-- ================= WORKSHOP SERIES CREATION FORM ================= -->
            @if (modalMode() === 'series') {
              <form [formGroup]="seriesForm" (ngSubmit)="onCreateSeriesSubmit()" class="space-y-5">
                
                <!-- Workshop Title -->
                <div>
                  <label for="series-title" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Workshop Series Title *
                  </label>
                  <input
                    id="series-title"
                    type="text"
                    formControlName="title"
                    placeholder="e.g. Distributed Systems &amp; AI Summit 2026"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-sm outline-none"
                    maxlength="140"
                  />
                </div>

                <!-- Description -->
                <div>
                  <label for="series-desc" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Workshop Description / Abstract
                  </label>
                  <textarea
                    id="series-desc"
                    formControlName="description"
                    rows="2"
                    placeholder="Overview of the workshop, agenda summary, and presentation guidelines."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs outline-none leading-relaxed"
                  ></textarea>
                </div>

                <!-- Custom Join Code & Date / Timezone -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label for="series-code" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Custom Code
                      </label>
                      <button
                        type="button"
                        (click)="suggestSeriesJoinCode()"
                        class="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                        title="Suggest unique code"
                      >
                        <mat-icon class="text-xs">casino</mat-icon>
                        <span>Generate</span>
                      </button>
                    </div>
                    <input
                      id="series-code"
                      type="text"
                      formControlName="customJoinCode"
                      (input)="onSeriesCustomCodeInput($event)"
                      placeholder="e.g. SUMMIT26"
                      class="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-sm font-mono uppercase font-bold outline-none"
                      maxlength="14"
                    />
                    @if (seriesCodeCheck().checking) {
                      <span class="text-[10px] text-slate-500 mt-0.5 block">Checking availability...</span>
                    } @else if (seriesCodeCheck().available === true) {
                      <span class="text-[10px] text-emerald-600 font-semibold mt-0.5 block">✓ Code available</span>
                    } @else if (seriesCodeCheck().available === false) {
                      <span class="text-[10px] text-rose-600 font-semibold mt-0.5 block">✗ Already taken</span>
                    }
                  </div>

                  <div>
                    <label for="series-date" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Date
                    </label>
                    <input
                      id="series-date"
                      type="date"
                      formControlName="date"
                      class="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label for="series-tz" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Timezone
                    </label>
                    <select
                      id="series-tz"
                      formControlName="timezone"
                      class="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs outline-none cursor-pointer"
                    >
                      <option value="America/Los_Angeles (PST)">America/Los_Angeles (PST)</option>
                      <option value="America/New_York (EST)">America/New_York (EST)</option>
                      <option value="Europe/London (GMT)">Europe/London (GMT)</option>
                      <option value="Europe/Berlin (CET)">Europe/Berlin (CET)</option>
                      <option value="Asia/Tokyo (JST)">Asia/Tokyo (JST)</option>
                      <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
                      <option value="Asia/Singapore (SGT)">Asia/Singapore (SGT)</option>
                      <option value="UTC">UTC Universal</option>
                    </select>
                  </div>
                </div>

                <!-- Master Series Grounding Context / Agenda File Upload -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label for="series-context" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Master Workshop Agenda &amp; Context
                    </label>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        (click)="seriesFileInput.click()"
                        class="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        <mat-icon class="text-sm">upload_file</mat-icon>
                        <span>Attach Document</span>
                      </button>
                    </div>
                  </div>

                  <input
                    #seriesFileInput
                    type="file"
                    (change)="onSeriesFileSelected($event)"
                    accept=".txt,.md,.pdf,.docx,.doc,.pptx,.ppt,.json,.csv"
                    class="hidden"
                  />

                  <textarea
                    id="series-context"
                    formControlName="seriesContextData"
                    rows="3"
                    placeholder="Paste master event schedule, keynote notes, or guidelines. Gemini AI uses this context to ground answers across all workshop talks."
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs outline-none leading-relaxed"
                  ></textarea>
                </div>

                <!-- Speaker Segments / Run of Show Builder -->
                <div class="pt-2 border-t border-slate-200">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <mat-icon class="text-indigo-600 text-base">format_list_numbered</mat-icon>
                        Speaker Schedule &amp; Segments ({{ seriesSegments().length }} Talks)
                      </h3>
                      <p class="text-[11px] text-slate-500">Each speaker receives their own presenter link, teleprompter, and grounding buffer.</p>
                    </div>

                    <div class="flex items-center gap-2">
                      <button
                        id="btn-add-segment-row"
                        type="button"
                        (click)="addSegmentDraft()"
                        class="px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <mat-icon class="text-sm">add</mat-icon> Add Speaker
                      </button>
                    </div>
                  </div>

                  <!-- Segments List -->
                  <div class="space-y-3 max-h-72 overflow-y-auto pr-1">
                    @for (seg of seriesSegments(); track seg.id; let i = $index) {
                      <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-all space-y-2.5">
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                              {{ i + 1 }}
                            </span>
                            <span class="text-xs font-bold text-slate-800">Talk {{ i + 1 }}</span>
                            <select
                              [value]="seg.type"
                              (change)="updateSegmentDraft(seg.id, 'type', $any($event.target).value)"
                              class="text-[11px] font-semibold uppercase bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 cursor-pointer"
                            >
                              <option value="TALK">TALK</option>
                              <option value="PANEL">PANEL</option>
                              <option value="BREAK">BREAK</option>
                            </select>
                          </div>

                          @if (seriesSegments().length > 1) {
                            <button
                              type="button"
                              (click)="removeSegmentDraft(seg.id)"
                              class="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 cursor-pointer transition-colors"
                              title="Remove talk"
                            >
                              <mat-icon class="text-base">delete</mat-icon>
                            </button>
                          }
                        </div>

                        <!-- Title & Speaker Name -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            [value]="seg.title"
                            (input)="updateSegmentDraft(seg.id, 'title', $any($event.target).value)"
                            placeholder="Talk Title *"
                            class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:border-indigo-600 outline-none"
                          />
                          <input
                            type="text"
                            [value]="seg.speakerName"
                            (input)="updateSegmentDraft(seg.id, 'speakerName', $any($event.target).value)"
                            placeholder="Speaker Name *"
                            class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:border-indigo-600 outline-none"
                          />
                        </div>

                        <!-- Speaker Role, Org, and Duration -->
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            [value]="seg.speakerRole"
                            (input)="updateSegmentDraft(seg.id, 'speakerRole', $any($event.target).value)"
                            placeholder="Speaker Title / Role"
                            class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:border-indigo-600 outline-none"
                          />
                          <input
                            type="text"
                            [value]="seg.speakerOrg"
                            (input)="updateSegmentDraft(seg.id, 'speakerOrg', $any($event.target).value)"
                            placeholder="Organization"
                            class="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:border-indigo-600 outline-none"
                          />
                          <div class="flex items-center gap-1">
                            <input
                              type="number"
                              [value]="seg.durationMinutes"
                              (input)="updateSegmentDraft(seg.id, 'durationMinutes', +$any($event.target).value)"
                              placeholder="45"
                              class="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:border-indigo-600 outline-none"
                            />
                            <span class="text-[10px] text-slate-500 shrink-0 font-medium">mins</span>
                          </div>
                        </div>

                        <!-- Per-speaker Grounding context -->
                        <div>
                          <input
                            type="text"
                            [value]="seg.groundingContext"
                            (input)="updateSegmentDraft(seg.id, 'groundingContext', $any($event.target).value)"
                            placeholder="Speaker Slide Notes / Technical Keywords for Gemini grounding..."
                            class="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 focus:border-indigo-600 outline-none font-mono"
                          />
                        </div>
                      </div>
                    }
                  </div>
                </div>

                <!-- Form Bottom Actions -->
                <div class="flex items-center justify-between pt-4 border-t border-slate-200">
                  <div class="flex items-center gap-2">
                    <input
                      id="series-auto-advance"
                      type="checkbox"
                      formControlName="autoAdvance"
                      class="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                    <label for="series-auto-advance" class="text-xs text-slate-600 cursor-pointer select-none">
                      Auto-advance live stage on schedule
                    </label>
                  </div>

                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      (click)="showCreateModal.set(false)"
                      class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-submit-create-series"
                      type="submit"
                      [disabled]="seriesForm.invalid || qaService.isLoading()"
                      class="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      @if (qaService.isLoading()) {
                        <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>Creating Series...</span>
                      } @else {
                        <mat-icon class="text-base">rocket_launch</mat-icon>
                        <span>Launch Workshop Series</span>
                      }
                    </button>
                  </div>
                </div>
              </form>
            }

            <!-- ================= SINGLE SESSION CREATION FORM ================= -->
            @if (modalMode() === 'single') {
              <form [formGroup]="createForm" (ngSubmit)="onCreateSubmit()" class="space-y-4">
                <div>
                  <label for="create-title" class="block text-xs font-semibold text-[#444746] uppercase tracking-wider mb-1">
                    Session Title *
                  </label>
                  <input
                    id="create-title"
                    type="text"
                    formControlName="title"
                    placeholder="e.g. Scalable AI Systems Keynote 2026"
                    class="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white rounded-xl text-sm outline-none"
                    maxlength="120"
                  />
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label for="create-code" class="block text-xs font-semibold text-[#444746] uppercase tracking-wider">
                        Custom Room Code
                      </label>
                      <button
                        type="button"
                        (click)="suggestSingleJoinCode()"
                        class="text-[10px] font-semibold text-[#1A73E8] hover:underline flex items-center gap-0.5 cursor-pointer"
                        title="Suggest unique code"
                      >
                        <mat-icon class="text-xs">casino</mat-icon>
                        <span>Generate</span>
                      </button>
                    </div>
                    <input
                      id="create-code"
                      type="text"
                      formControlName="customJoinCode"
                      (input)="onSingleCustomCodeInput($event)"
                      placeholder="e.g. KEYNOTE26"
                      class="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white rounded-xl text-sm font-mono uppercase font-bold outline-none"
                      maxlength="14"
                    />
                    @if (singleCodeCheck().checking) {
                      <span class="text-[10px] text-slate-500 mt-0.5 block">Checking availability...</span>
                    } @else if (singleCodeCheck().available === true) {
                      <span class="text-[10px] text-emerald-600 font-semibold mt-0.5 block">✓ Code available</span>
                    } @else if (singleCodeCheck().available === false) {
                      <span class="text-[10px] text-rose-600 font-semibold mt-0.5 block">✗ Already taken</span>
                    }
                  </div>

                  <div>
                    <label for="create-sensitivity" class="block text-xs font-semibold text-[#444746] uppercase tracking-wider mb-1">
                      Moderation Sensitivity
                    </label>
                    <select
                      id="create-sensitivity"
                      formControlName="moderationSensitivity"
                      class="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white rounded-xl text-sm outline-none cursor-pointer"
                    >
                      <option value="BALANCED">Balanced (Standard Enterprise)</option>
                      <option value="STRICT">Strict (Zero Spam/Promotion)</option>
                      <option value="RELAXED">Relaxed (Open Discussion)</option>
                    </select>
                  </div>
                </div>

                <!-- Presentation Grounding & File Upload Section -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label for="create-grounding" class="block text-xs font-semibold text-[#444746] uppercase tracking-wider">
                      Presentation Grounding Context / Slide Deck Notes
                    </label>
                    <button
                      type="button"
                      (click)="fileInput.click()"
                      class="inline-flex items-center gap-1 text-xs font-medium text-[#1A73E8] hover:text-[#185ABC] cursor-pointer"
                    >
                      <mat-icon class="text-sm">upload_file</mat-icon>
                      <span>Upload Doc / Deck</span>
                    </button>
                  </div>

                  <!-- Hidden Native File Input -->
                  <input
                    #fileInput
                    id="grounding-file-input"
                    type="file"
                    (change)="onFileSelected($event)"
                    accept=".txt,.md,.pdf,.docx,.doc,.pptx,.ppt,.json,.csv"
                    class="hidden"
                  />

                  <!-- Drag & Drop Zone / Status -->
                  <button
                    type="button"
                    id="drop-zone"
                    (dragover)="onDragOver($event)"
                    (dragleave)="onDragLeave($event)"
                    (drop)="onFileDrop($event)"
                    (click)="fileInput.click()"
                    [class.border-[#1A73E8]]="isDragging()"
                    [class.bg-[#E8F0FE]/40]="isDragging()"
                    class="w-full text-left relative p-3.5 mb-2.5 rounded-xl border-2 border-dashed border-[#D2E3FC] bg-[#F8F9FA] hover:bg-[#F1F3F4] transition-all cursor-pointer group block"
                  >
                    @if (isReadingFile()) {
                      <div class="flex items-center justify-center gap-2 py-2 text-xs text-[#1A73E8] font-medium">
                        <span class="w-4 h-4 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin"></span>
                        <span>Processing and extracting document content...</span>
                      </div>
                    } @else if (uploadedFileName()) {
                      <div class="flex items-center justify-between px-2 py-1 text-xs">
                        <div class="flex items-center gap-2 text-[#1E8E3E] font-medium truncate">
                          <mat-icon class="text-base text-[#1E8E3E]">task</mat-icon>
                          <span class="truncate">Attached: {{ uploadedFileName() }}</span>
                          <span class="text-[11px] text-[#747775]">({{ uploadedFileSize() }})</span>
                        </div>
                        <span
                          (click)="removeUploadedFile($event)"
                          (keydown.enter)="removeUploadedFile($event)"
                          tabindex="0"
                          role="button"
                          class="p-1 text-[#747775] hover:text-[#D93025] rounded-full hover:bg-white inline-flex items-center justify-center"
                          title="Remove file"
                        >
                          <mat-icon class="text-sm">close</mat-icon>
                        </span>
                      </div>
                    } @else {
                      <div class="flex items-center justify-center gap-2 text-xs text-[#444746]">
                        <mat-icon class="text-base text-[#1A73E8] group-hover:scale-110 transition-transform">cloud_upload</mat-icon>
                        <span class="font-medium text-[#1F1F1F]">Click to upload</span> or drag &amp; drop slide deck notes, keynote doc, or outline
                      </div>
                    }
                  </button>

                  <textarea
                    id="create-grounding"
                    formControlName="contextData"
                    rows="3"
                    placeholder="Paste presentation slides transcript, keynote outline, or product FAQs. Gemini will strictly ground all 2-line answers in this material."
                    class="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white rounded-xl text-xs outline-none leading-relaxed"
                  ></textarea>
                </div>

                <div class="flex items-center gap-4 text-xs">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      formControlName="autoAiAnswers"
                      class="w-4 h-4 rounded border-[#747775] text-[#1A73E8]"
                    />
                    <span>Auto-generate 2-line AI answers</span>
                  </label>

                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      formControlName="allowAnonymous"
                      class="w-4 h-4 rounded border-[#747775] text-[#1A73E8]"
                    />
                    <span>Allow anonymous posts</span>
                  </label>
                </div>

                <div class="flex items-center justify-end gap-3 pt-3 border-t border-[#E0E2EC]">
                  <button
                    type="button"
                    (click)="showCreateModal.set(false)"
                    class="px-4 py-2 rounded-xl text-xs font-semibold text-[#444746] hover:bg-[#F1F3F4] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-submit-create"
                    type="submit"
                    [disabled]="createForm.invalid || qaService.isLoading() || isReadingFile()"
                    class="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#1A73E8] hover:bg-[#185ABC] disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <mat-icon class="text-base">rocket_launch</mat-icon>
                    <span>Launch Session</span>
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
export class SessionJoin implements OnInit {
  public qaService = inject(QaService);
  public firebaseService = inject(FirebaseService);
  
  public showCreateModal = signal<boolean>(false);
  public showAuthModal = signal<boolean>(false);
  public showQrModal = signal<boolean>(false);
  public isSignUpMode = signal<boolean>(false);
  public isAuthLoading = signal<boolean>(false);
  public authError = signal<string | null>(null);
  public modalMode = signal<'series' | 'single'>('series');

  // QR Code data
  public qrCodeDataUrl = signal<string | null>(null);
  public directJoinLink = signal<string>('');

  // File upload state for single session
  public isDragging = signal<boolean>(false);
  public isReadingFile = signal<boolean>(false);
  public uploadedFileName = signal<string | null>(null);
  public uploadedFileSize = signal<string | null>(null);

  // Speaker segments for Series Builder (starts clean with 2 empty talks)
  public seriesSegments = signal<SegmentDraft[]>([
    {
      id: 'draft-1',
      title: 'Opening Technical Session',
      speakerName: '',
      speakerRole: '',
      speakerOrg: '',
      type: 'TALK',
      durationMinutes: 45,
      startTime: '',
      groundingContext: '',
      categories: 'General',
    },
    {
      id: 'draft-2',
      title: 'Architecture Deep Dive',
      speakerName: '',
      speakerRole: '',
      speakerOrg: '',
      type: 'TALK',
      durationMinutes: 40,
      startTime: '',
      groundingContext: '',
      categories: 'Architecture',
    },
  ]);

  public showManualCode = signal<boolean>(false);

  public singleCodeCheck = signal<{ checking: boolean; available?: boolean; error?: string }>({ checking: false });
  public seriesCodeCheck = signal<{ checking: boolean; available?: boolean; error?: string }>({ checking: false });

  private singleCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private seriesCheckTimer: ReturnType<typeof setTimeout> | null = null;

  public async suggestSingleJoinCode(): Promise<void> {
    const code = await this.qaService.generateSuggestedCode('ROOM');
    this.createForm.patchValue({ customJoinCode: code });
    this.validateJoinCode(code, 'single');
  }

  public async suggestSeriesJoinCode(): Promise<void> {
    const code = await this.qaService.generateSuggestedCode('SUMMIT');
    this.seriesForm.patchValue({ customJoinCode: code });
    this.validateJoinCode(code, 'series');
  }

  public onSingleCustomCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    this.createForm.patchValue({ customJoinCode: clean }, { emitEvent: false });
    input.value = clean;

    if (this.singleCheckTimer) clearTimeout(this.singleCheckTimer);
    this.singleCheckTimer = setTimeout(() => {
      this.validateJoinCode(clean, 'single');
    }, 350);
  }

  public onSeriesCustomCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    this.seriesForm.patchValue({ customJoinCode: clean }, { emitEvent: false });
    input.value = clean;

    if (this.seriesCheckTimer) clearTimeout(this.seriesCheckTimer);
    this.seriesCheckTimer = setTimeout(() => {
      this.validateJoinCode(clean, 'series');
    }, 350);
  }

  private async validateJoinCode(code: string, target: 'single' | 'series'): Promise<void> {
    const statusSignal = target === 'single' ? this.singleCodeCheck : this.seriesCodeCheck;
    if (!code || code.trim().length === 0) {
      statusSignal.set({ checking: false });
      return;
    }
    if (code.length < 3) {
      statusSignal.set({ checking: false, error: 'At least 3 characters' });
      return;
    }
    statusSignal.set({ checking: true });
    const res = await this.qaService.checkCodeAvailability(code);
    statusSignal.set({ checking: false, available: res.available, error: res.error });
  }

  public joinForm = new FormGroup({
    joinCode: new FormControl(this.qaService.autoJoinCode() || ''),
    userName: new FormControl(''),
    userEmail: new FormControl(''),
    postAsAnonymous: new FormControl(false),
  });

  public authForm = new FormGroup({
    name: new FormControl(''),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)]),
  });

  public createForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.minLength(3)]),
    customJoinCode: new FormControl(''),
    contextData: new FormControl(''),
    moderationSensitivity: new FormControl<ModerationSensitivity>('BALANCED'),
    autoAiAnswers: new FormControl(true),
    allowAnonymous: new FormControl(true),
  });

  public seriesForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.minLength(3)]),
    description: new FormControl(''),
    customJoinCode: new FormControl(''),
    date: new FormControl(new Date().toISOString().split('T')[0]),
    timezone: new FormControl('America/Los_Angeles (PST)'),
    seriesContextData: new FormControl(''),
    autoAdvance: new FormControl(false),
  });

  public ngOnInit(): void {
    this.checkForUrlJoinCode();
  }

  private checkForUrlJoinCode(): void {
    const code = this.qaService.autoJoinCode() || this.qaService.extractUrlCode();
    if (code) {
      this.joinForm.patchValue({ joinCode: code });
      this.qaService.autoJoinCode.set(code);
      // Automatically join attendee into the session if not already in session or loading
      if (!this.qaService.currentSession() && !this.qaService.currentSeries() && !this.qaService.isLoading()) {
        setTimeout(() => {
          this.onJoinSubmit();
        }, 100);
      }
    }
  }

  public handleCreateClick(mode: 'series' | 'single'): void {
    this.modalMode.set(mode);
    if (this.firebaseService.isOrganizerLoggedIn()) {
      this.showCreateModal.set(true);
    } else {
      this.authError.set(null);
      this.showAuthModal.set(true);
    }
  }

  public async signInGoogle(): Promise<void> {
    this.isAuthLoading.set(true);
    this.authError.set(null);
    try {
      const user = await this.firebaseService.signInWithGoogle();
      if (user) {
        this.showAuthModal.set(false);
        this.showCreateModal.set(true);
        this.qaService.showToast(`Signed in as ${user.displayName || user.email}!`);
      }
    } catch (err: unknown) {
      this.authError.set(err instanceof Error ? err.message : 'Google sign in failed');
    } finally {
      this.isAuthLoading.set(false);
    }
  }

  public async submitEmailAuth(): Promise<void> {
    if (this.authForm.invalid) return;
    this.isAuthLoading.set(true);
    this.authError.set(null);

    const email = this.authForm.get('email')?.value || '';
    const pass = this.authForm.get('password')?.value || '';
    const name = this.authForm.get('name')?.value || '';

    try {
      let user;
      if (this.isSignUpMode()) {
        user = await this.firebaseService.signUpWithEmail(email, pass, name);
      } else {
        user = await this.firebaseService.signInWithEmail(email, pass);
      }

      if (user) {
        this.showAuthModal.set(false);
        this.showCreateModal.set(true);
        this.qaService.showToast(`Signed in as ${user.displayName || user.email}!`);
      }
    } catch (err: unknown) {
      this.authError.set(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      this.isAuthLoading.set(false);
    }
  }

  public openQrScannerModal(): void {
    const code = this.joinForm.get('joinCode')?.value?.trim().toUpperCase() || 'NVIDIA';
    this.qaService.openShareModal(code, `Live Session #${code}`, 'series');
  }

  public formatHistoryDate(isoString: string): string {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  public async reenterSession(record: HostedSessionRecord): Promise<void> {
    await this.qaService.reenterAsHost(record);
  }

  public openShare(record: HostedSessionRecord): void {
    this.qaService.openShareModal(record.joinCode, record.title, record.type);
  }

  public removePastSession(joinCode: string, event: Event): void {
    event.stopPropagation();
    this.qaService.removeHostedSession(joinCode);
  }

  public clearAllPastSessions(): void {
    if (typeof window !== 'undefined' && window.confirm('Are you sure you want to clear your past session history?')) {
      this.qaService.clearHostedSessions();
    }
  }

  public copyJoinLink(): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.directJoinLink());
      this.qaService.showToast('Direct join link copied to clipboard!');
    }
  }

  public setModalMode(mode: 'series' | 'single'): void {
    this.modalMode.set(mode);
  }

  public addSegmentDraft(): void {
    const current = this.seriesSegments();
    const nextIdx = current.length + 1;
    const newDraft: SegmentDraft = {
      id: 'draft-' + Math.random().toString(36).substring(2, 7),
      title: `Talk ${nextIdx}`,
      speakerName: '',
      speakerRole: '',
      speakerOrg: '',
      type: 'TALK',
      durationMinutes: 45,
      startTime: '',
      groundingContext: '',
      categories: 'General',
    };
    this.seriesSegments.set([...current, newDraft]);
  }

  public removeSegmentDraft(id: string): void {
    const current = this.seriesSegments();
    if (current.length <= 1) return;
    this.seriesSegments.set(current.filter(s => s.id !== id));
  }

  public updateSegmentDraft(id: string, field: keyof SegmentDraft, value: string | number | SegmentType): void {
    this.seriesSegments.update(list =>
      list.map(s => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  public fillSampleCode(code: string): void {
    const clean = code.trim().toUpperCase();
    this.joinForm.patchValue({ joinCode: clean });
    this.qaService.autoJoinCode.set(clean);
    this.qaService.errorMessage.set(null);
  }

  public async onJoinSubmit(): Promise<void> {
    const code = this.joinForm.get('joinCode')?.value?.trim().toUpperCase();
    if (!code) {
      this.qaService.errorMessage.set('Please enter an event room code (e.g. GDGLIVE or NEXT26) to join.');
      return;
    }
    this.qaService.autoJoinCode.set(code);
    const name = this.joinForm.get('userName')?.value?.trim() || '';
    const anon = this.joinForm.get('postAsAnonymous')?.value === true;

    // Zero Auth for Attendees
    this.qaService.userRole.set('attendee');
    this.qaService.userAuthToken.set(null);
    await this.qaService.joinSession(code, anon ? 'Anonymous' : name || 'Attendee');
  }

  public async joinAsPureAnonymous(): Promise<void> {
    let code = this.joinForm.get('joinCode')?.value?.trim().toUpperCase();
    if (!code) {
      code = 'NVIDIA';
      this.joinForm.patchValue({ joinCode: 'NVIDIA' });
    }
    // Zero Auth for Attendees
    this.qaService.userRole.set('attendee');
    this.qaService.userAuthToken.set(null);
    await this.qaService.joinSession(code, 'Anonymous');
  }

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  public onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  public onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.processFile(file, 'single');
    }
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.processFile(file, 'single');
    }
  }

  public onSeriesFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.processFile(file, 'series');
    }
  }

  public removeUploadedFile(event: Event): void {
    event.stopPropagation();
    this.uploadedFileName.set(null);
    this.uploadedFileSize.set(null);
  }

  private processFile(file: File, target: 'single' | 'series'): void {
    const maxSizeBytes = 25 * 1024 * 1024; // 25MB safety threshold for client text reader
    if (file.size > maxSizeBytes) {
      this.qaService.showToast(`File is too large (${this.formatFileSize(file.size)}). Max allowed size is 25MB.`);
      return;
    }

    this.isReadingFile.set(true);
    this.uploadedFileName.set(file.name);
    this.uploadedFileSize.set(this.formatFileSize(file.size));

    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      let content = (e.target?.result as string) || '';

      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          content = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        } catch {
          // keep as raw text
        }
      }

      if (target === 'series') {
        const existing = this.seriesForm.get('seriesContextData')?.value || '';
        const prefix = existing.trim() ? `${existing.trim()}\n\n--- Document: ${file.name} ---\n` : `--- Document: ${file.name} ---\n`;
        this.seriesForm.patchValue({ seriesContextData: prefix + content });
      } else {
        const existing = this.createForm.get('contextData')?.value || '';
        const prefix = existing.trim() ? `${existing.trim()}\n\n--- Document: ${file.name} ---\n` : `--- Document: ${file.name} ---\n`;
        this.createForm.patchValue({ contextData: prefix + content });
      }

      this.isReadingFile.set(false);
      this.qaService.showToast(`Extracted ${content.length} characters from ${file.name}`);
    };

    reader.onerror = () => {
      this.isReadingFile.set(false);
      this.qaService.showToast(`Error reading file ${file.name}`);
    };

    reader.readAsText(file);
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  public async onCreateSeriesSubmit(): Promise<void> {
    if (this.seriesForm.invalid) return;
    const val = this.seriesForm.value;

    const segmentsPayload: Partial<Segment>[] = this.seriesSegments().map((seg, idx) => ({
      title: seg.title.trim() || `Talk ${idx + 1}`,
      speakerName: seg.speakerName.trim() || `Speaker ${idx + 1}`,
      speakerRole: seg.speakerRole.trim() || undefined,
      speakerOrg: seg.speakerOrg.trim() || undefined,
      type: seg.type,
      durationMinutes: seg.durationMinutes || 45,
      groundingContext: seg.groundingContext.trim() || undefined,
      categories: seg.categories ? seg.categories.split(',').map(c => c.trim()).filter(Boolean) : ['General'],
    }));

    const series = await this.qaService.createSeries({
      title: val.title || 'Multi-Speaker Workshop Series',
      description: val.description || undefined,
      seriesContextData: val.seriesContextData || undefined,
      date: val.date || undefined,
      timezone: val.timezone || undefined,
      autoAdvance: val.autoAdvance ?? false,
      customJoinCode: val.customJoinCode?.trim().toUpperCase() || undefined,
      segments: segmentsPayload,
    });

    if (series) {
      this.showCreateModal.set(false);
      this.qaService.activeTab.set('series-control');
    }
  }

  public async onCreateSubmit(): Promise<void> {
    if (this.createForm.invalid) return;
    const val = this.createForm.value;
    const session = await this.qaService.createSession({
      title: val.title || 'Live Keynote Q&A',
      customJoinCode: val.customJoinCode?.trim().toUpperCase() || undefined,
      contextData: val.contextData || undefined,
      settings: {
        moderationSensitivity: val.moderationSensitivity || 'BALANCED',
        autoAiAnswers: val.autoAiAnswers ?? true,
        allowAnonymous: val.allowAnonymous ?? true,
        maxQuestionsPerMinute: 5,
      },
    });

    if (session) {
      this.showCreateModal.set(false);
      this.qaService.activeTab.set('feed');
    }
  }
}
