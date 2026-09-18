import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { FirebaseService } from '../services/firebase.service';
import { UserRole } from '../models/qa.models';

@Component({
  selector: 'app-auth-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-8 sm:py-12 animate-fade-in">
      
      <!-- Back to Join Room Navigation -->
      <div class="mb-6 flex items-center justify-between">
        <button
          type="button"
          (click)="qaService.navigateToJoin()"
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer py-1.5 px-3 rounded-lg hover:bg-slate-100"
        >
          <mat-icon class="text-base">arrow_back</mat-icon>
          <span>Back to Join Room</span>
        </button>

        <span class="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
          <mat-icon class="text-xs">shield</mat-icon>
          Enterprise Staff Portal
        </span>
      </div>

      <!-- Attendee Zero-Auth Reassurance Callout -->
      <div class="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 shadow-2xs flex items-start gap-3">
        <div class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
          <mat-icon class="text-lg">group</mat-icon>
        </div>
        <div class="flex-1 text-xs text-emerald-950">
          <div class="font-bold text-sm text-emerald-900 mb-0.5">
            Are you attending an event as an audience member?
          </div>
          <p class="text-emerald-800 leading-relaxed mb-2 text-[11px]">
            Attendees do <strong>NOT</strong> need an account or login. You can ask questions, vote on topics, and see AI grounded answers anonymously or with a display name.
          </p>
          <button
            type="button"
            (click)="qaService.navigateToJoin()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors cursor-pointer shadow-2xs"
          >
            <mat-icon class="text-sm">meeting_room</mat-icon>
            <span>Enter Event Code to Join</span>
          </button>
        </div>
      </div>

      <!-- Main Auth Card -->
      <div class="bg-white rounded-2xl p-6 sm:p-8 border border-[#E0E2EC] shadow-sm">
        
        <!-- Header -->
        <div class="text-center mb-6">
          <div class="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
            <mat-icon class="text-2xl">admin_panel_settings</mat-icon>
          </div>
          <h1 class="font-display font-bold text-2xl text-slate-900 tracking-tight">
            {{ isSignUp() ? 'Create Host & Staff Account' : 'Sign In to Host Portal' }}
          </h1>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Secure access for Event Organizers, Keynote Speakers, and Session Moderators.
          </p>
        </div>

        <!-- Mode Toggle Tabs -->
        <div class="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 mb-6">
          <button
            type="button"
            (click)="setMode(false)"
            class="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer"
            [class.bg-white]="!isSignUp()"
            [class.text-indigo-600]="!isSignUp()"
            [class.shadow-2xs]="!isSignUp()"
            [class.text-slate-500]="isSignUp()"
          >
            Sign In
          </button>
          <button
            type="button"
            (click)="setMode(true)"
            class="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer"
            [class.bg-white]="isSignUp()"
            [class.text-indigo-600]="isSignUp()"
            [class.shadow-2xs]="isSignUp()"
            [class.text-slate-500]="!isSignUp()"
          >
            Create Host Account
          </button>
        </div>

        <!-- Role Selector Pill Selector -->
        <div class="mb-6">
          <span class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Select Your Staff Role
          </span>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <!-- Organizer -->
            <button
              type="button"
              (click)="selectedRole.set('organizer')"
              class="p-3 rounded-xl border text-left transition-all cursor-pointer relative"
              [class.border-indigo-600]="selectedRole() === 'organizer'"
              [class.bg-indigo-50/50]="selectedRole() === 'organizer'"
              [class.border-slate-200]="selectedRole() !== 'organizer'"
              [class.hover:border-slate-300]="selectedRole() !== 'organizer'"
            >
              <div class="flex items-center gap-1.5 mb-1 text-indigo-700">
                <mat-icon class="text-base">campaign</mat-icon>
                <span class="font-bold text-xs">Organizer</span>
              </div>
              <p class="text-[10px] text-slate-500 leading-tight">
                Create &amp; host workshop tracks, decks &amp; reports.
              </p>
            </button>

            <!-- Speaker -->
            <button
              type="button"
              (click)="selectedRole.set('speaker')"
              class="p-3 rounded-xl border text-left transition-all cursor-pointer relative"
              [class.border-amber-600]="selectedRole() === 'speaker'"
              [class.bg-amber-50/50]="selectedRole() === 'speaker'"
              [class.border-slate-200]="selectedRole() !== 'speaker'"
              [class.hover:border-slate-300]="selectedRole() !== 'speaker'"
            >
              <div class="flex items-center gap-1.5 mb-1 text-amber-700">
                <mat-icon class="text-base">record_voice_over</mat-icon>
                <span class="font-bold text-xs">Speaker</span>
              </div>
              <p class="text-[10px] text-slate-500 leading-tight">
                Live teleprompter, stage confidence &amp; Q&amp;A.
              </p>
            </button>

            <!-- Moderator -->
            <button
              type="button"
              (click)="selectedRole.set('moderator')"
              class="p-3 rounded-xl border text-left transition-all cursor-pointer relative"
              [class.border-purple-600]="selectedRole() === 'moderator'"
              [class.bg-purple-50/50]="selectedRole() === 'moderator'"
              [class.border-slate-200]="selectedRole() !== 'moderator'"
              [class.hover:border-slate-300]="selectedRole() !== 'moderator'"
            >
              <div class="flex items-center gap-1.5 mb-1 text-purple-700">
                <mat-icon class="text-base">gavel</mat-icon>
                <span class="font-bold text-xs">Moderator</span>
              </div>
              <p class="text-[10px] text-slate-500 leading-tight">
                Spam queue, review &amp; crowd prioritization.
              </p>
            </button>
          </div>
        </div>

        <!-- Google OAuth 1-Click Button -->
        <button
          id="btn-auth-google"
          type="button"
          (click)="signInGoogle()"
          [disabled]="isLoading() || firebaseService.localAuthFallback()"
          class="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 font-semibold text-xs text-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs mb-5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>{{ firebaseService.localAuthFallback() ? 'Google (needs Firebase Auth)' : 'Continue with Google' }}</span>
        </button>

        @if (firebaseService.localAuthFallback()) {
          <div class="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
            Firebase Auth is offline (missing API key). Email/password still creates a <strong>local</strong> host account on this device.
            For Google sign-in and production accounts, set <code class="font-mono">FIREBASE_API_KEY</code> and restart.
          </div>
        }

        <div class="relative flex items-center justify-center mb-5">
          <div class="border-t border-slate-200 w-full"></div>
          <span class="bg-white px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider absolute">
            Or with email
          </span>
        </div>

        <!-- Email & Password Form -->
        <form [formGroup]="authForm" (ngSubmit)="onSubmit()" class="space-y-4">
          
          @if (isSignUp()) {
            <div>
              <label for="input-auth-name" class="block text-xs font-semibold text-slate-700 mb-1">
                Full Name / Organization
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <mat-icon class="text-base">badge</mat-icon>
                </div>
                <input
                  id="input-auth-name"
                  type="text"
                  formControlName="name"
                  placeholder="e.g. Your Name or Organization"
                  class="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none transition-colors"
                />
              </div>
            </div>
          }

          <div>
            <label for="input-auth-email" class="block text-xs font-semibold text-slate-700 mb-1">
              Email Address
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <mat-icon class="text-base">mail</mat-icon>
              </div>
              <input
                id="input-auth-email"
                type="email"
                formControlName="email"
                placeholder="name@company.com"
                class="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label for="input-auth-pass" class="block text-xs font-semibold text-slate-700 mb-1">
              Password
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <mat-icon class="text-base">lock</mat-icon>
              </div>
              <input
                id="input-auth-pass"
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                placeholder="••••••••"
                class="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none transition-colors"
              />
              <button
                type="button"
                (click)="showPassword.set(!showPassword())"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <mat-icon class="text-base">{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </div>
          </div>

          @if (errorMessage()) {
            <div class="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <mat-icon class="text-base text-red-600 shrink-0">error</mat-icon>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <button
            id="btn-auth-submit"
            type="submit"
            [disabled]="isLoading()"
            class="w-full py-3 px-4 rounded-xl font-display font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            @if (isLoading()) {
              <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Authenticating...</span>
            } @else {
              <mat-icon class="text-sm">{{ isSignUp() ? 'person_add' : 'login' }}</mat-icon>
              <span>{{ isSignUp() ? 'Create Account & Access Studio' : 'Sign In as ' + getRoleDisplayName() }}</span>
            }
          </button>
        </form>

      </div>

    </div>
  `,
})
export class AuthPage {
  public qaService = inject(QaService);
  public firebaseService = inject(FirebaseService);
  private fb = inject(FormBuilder);

  public isSignUp = signal<boolean>(false);
  public showPassword = signal<boolean>(false);
  public isLoading = signal<boolean>(false);
  public errorMessage = signal<string | null>(null);
  public selectedRole = signal<UserRole>('organizer');

  public authForm = this.fb.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  public setMode(signUp: boolean): void {
    this.isSignUp.set(signUp);
    this.errorMessage.set(null);
  }

  public getRoleDisplayName(): string {
    const r = this.selectedRole();
    if (r === 'organizer') return 'Organizer';
    if (r === 'speaker') return 'Speaker';
    if (r === 'moderator') return 'Moderator';
    return 'Staff';
  }

  public async signInGoogle(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const user = await this.firebaseService.signInWithGoogle();
      if (user) {
        this.qaService.userRole.set(this.selectedRole());
        this.qaService.userName.set(user.displayName || user.email?.split('@')[0] || 'Organizer');
        this.qaService.userAuthToken.set('token-' + user.uid);
        if (user.email) {
          this.qaService.setAttendeeIdentity(
            user.displayName || user.email.split('@')[0],
            user.email
          );
        }
        await this.finishStaffSignIn(user.email || undefined);
      } else {
        this.errorMessage.set('Google sign-in did not complete. Please try again.');
      }
    } catch (err: unknown) {
      this.errorMessage.set(this.formatAuthError(err, 'Google sign-in failed'));
    } finally {
      this.isLoading.set(false);
    }
  }

  public async onSubmit(): Promise<void> {
    if (this.authForm.invalid) {
      this.errorMessage.set('Please provide a valid email and a password of at least 6 characters.');
      return;
    }

    const { email, password, name } = this.authForm.value;
    if (!email || !password) {
      this.errorMessage.set('Please provide a valid email and a password of at least 6 characters.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      if (this.isSignUp()) {
        const user = await this.firebaseService.signUpWithEmail(email, password, name || undefined);
        if (user) {
          this.qaService.userRole.set(this.selectedRole());
          this.qaService.setAttendeeIdentity(name || email.split('@')[0], email);
          this.qaService.userAuthToken.set('token-' + user.uid);
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('live_qa_auth_token', 'token-' + user.uid);
          }
          await this.finishStaffSignIn(email);
        } else {
          this.errorMessage.set('Account creation failed. Please try again.');
        }
      } else {
        const user = await this.firebaseService.signInWithEmail(email, password);
        if (user) {
          this.qaService.userRole.set(this.selectedRole());
          this.qaService.setAttendeeIdentity(
            user.displayName || email.split('@')[0],
            user.email || email
          );
          this.qaService.userAuthToken.set('token-' + user.uid);
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('live_qa_auth_token', 'token-' + user.uid);
          }
          await this.finishStaffSignIn(user.email || email);
        } else {
          this.errorMessage.set('Sign-in failed. Please check your email and password.');
        }
      }
    } catch (err: unknown) {
      this.errorMessage.set(this.formatAuthError(err, 'Authentication failed. Please check credentials.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  private async finishStaffSignIn(email?: string): Promise<void> {
    if (this.selectedRole() === 'speaker' && email) {
      const invites = await this.qaService.fetchSpeakerInvites(email);
      if (invites.length === 1) {
        this.qaService.showToast(`Welcome! Opening your talk: ${invites[0].segmentTitle}`);
        await this.qaService.joinAsInvitedSpeaker(invites[0]);
        return;
      }
      if (invites.length > 1) {
        this.qaService.showToast(`Found ${invites.length} invited talks. Pick one in Speaker Studio.`);
      } else {
        this.qaService.showToast('Signed in as Speaker. No invites yet — ask the host to register your Gmail.');
      }
    } else {
      this.qaService.showToast(`Signed in as ${this.getRoleDisplayName()}`);
    }
    this.qaService.navigateToHostStudio();
  }

  private formatAuthError(err: unknown, fallback: string): string {
    if (!(err instanceof Error)) return fallback;
    const msg = err.message || fallback;
    if (msg.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
      return 'Incorrect email or password. Please try again.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Password is too weak. Use at least 6 characters.';
    }
    if (msg.includes('auth/invalid-email')) {
      return 'Please enter a valid email address.';
    }
    if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
      return 'Google sign-in was cancelled. Click Continue with Google again when ready.';
    }
    if (msg.includes('auth/popup-blocked')) {
      return 'Pop-up blocked. Allow pop-ups for this site and try Google sign-in again.';
    }
    if (msg.includes('auth/unauthorized-domain')) {
      return 'This domain is not authorized for Firebase Auth. Add it under Authentication → Settings → Authorized domains.';
    }
    if (msg.includes('auth/operation-not-allowed')) {
      return 'Google sign-in is disabled in Firebase Console. Enable Authentication → Sign-in method → Google.';
    }
    if (msg.includes('auth/account-exists-with-different-credential')) {
      return 'An account already exists with this email using a different sign-in method. Try email/password instead.';
    }
    return msg;
  }
}
