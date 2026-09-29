import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CookieConsentService } from '../services/cookie-consent.service';

@Component({
  selector: 'app-cookie-policy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, MatIconModule],
  template: `
    <article class="max-w-3xl mx-auto animate-fade-in pb-16">
      <header class="mb-8 space-y-3">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">Legal</p>
        <h1 class="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
          Cookie Policy
        </h1>
        <p class="text-sm text-slate-500">
          Last updated: 29 September 2026 · askqlive.com
        </p>
        <p class="text-sm text-slate-600 leading-relaxed">
          This Cookie Policy explains how AskQlive uses cookies and similar technologies (localStorage,
          pixels, scripts). It complements our
          <a routerLink="/privacy" class="text-indigo-600 underline">Privacy Policy</a>
          and supports GDPR Art. 7 consent, ePrivacy Directive requirements, and Google Consent Mode.
        </p>
      </header>

      <!-- Preference center -->
      <section
        id="preferences"
        class="mb-10 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4"
      >
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <mat-icon class="text-lg">tune</mat-icon>
          </div>
          <div>
            <h2 class="font-display text-lg font-bold text-slate-900">Cookie preferences</h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Necessary storage is always on. Analytics and optional functional storage require your choice.
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
            <input type="checkbox" checked disabled class="mt-1 accent-indigo-600" />
            <span class="flex-1">
              <span class="block text-sm font-semibold text-slate-900">Necessary</span>
              <span class="block text-xs text-slate-500 mt-0.5"
                >Required for join fingerprint, auth session, security, and remembering this consent choice.
                Cannot be turned off.</span
              >
            </span>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-indigo-200 cursor-pointer">
            <input
              type="checkbox"
              class="mt-1 accent-indigo-600"
              [ngModel]="functional()"
              (ngModelChange)="functional.set($event)"
            />
            <span class="flex-1">
              <span class="block text-sm font-semibold text-slate-900">Functional</span>
              <span class="block text-xs text-slate-500 mt-0.5"
                >Remembers helpful UI state (e.g. hosted session shortcuts, segment bookmarks) in your browser.</span
              >
            </span>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-indigo-200 cursor-pointer">
            <input
              type="checkbox"
              class="mt-1 accent-indigo-600"
              [ngModel]="analytics()"
              (ngModelChange)="analytics.set($event)"
            />
            <span class="flex-1">
              <span class="block text-sm font-semibold text-slate-900">Analytics</span>
              <span class="block text-xs text-slate-500 mt-0.5"
                >Google Analytics 4 and Microsoft Clarity — help us understand usage and fix UX issues. Off by default until you opt in.</span
              >
            </span>
          </label>
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            (click)="saveCustom()"
            class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
          >
            Save preferences
          </button>
          <button
            type="button"
            (click)="acceptAll()"
            class="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-semibold hover:bg-indigo-100 cursor-pointer"
          >
            Accept all
          </button>
          <button
            type="button"
            (click)="rejectAll()"
            class="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
          >
            Reject non-essential
          </button>
        </div>

        @if (savedMsg()) {
          <p class="text-xs font-medium text-emerald-700 flex items-center gap-1">
            <mat-icon class="text-sm">check_circle</mat-icon>
            {{ savedMsg() }}
          </p>
        }

        @if (consent.preferences().updatedAt) {
          <p class="text-[11px] text-slate-400">
            Last saved: {{ consent.preferences().updatedAt }}
          </p>
        }
      </section>

      <div class="space-y-8 text-sm text-slate-700 leading-relaxed">
        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">1. What are cookies?</h2>
          <p>
            Cookies are small text files stored on your device. We also use similar technologies such as
            <code class="text-xs bg-slate-100 px-1 rounded">localStorage</code>, scripts, and pixels.
            Together we call them “cookies” in this policy.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">2. How we use them</h2>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Necessary</strong> — run live Q&amp;A securely (participant fingerprint, auth, consent record)</li>
            <li><strong>Functional</strong> — optional convenience features in your browser</li>
            <li><strong>Analytics</strong> — measure traffic and product usage only with consent</li>
          </ul>
          <p>We do not use advertising / remarketing cookies.</p>
        </section>

        <section class="space-y-3">
          <h2 class="font-display text-lg font-bold text-slate-900">3. Cookie &amp; storage inventory</h2>
          <div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="min-w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-3 py-2 font-semibold">Name / key</th>
                  <th class="px-3 py-2 font-semibold">Provider</th>
                  <th class="px-3 py-2 font-semibold">Purpose</th>
                  <th class="px-3 py-2 font-semibold">Type</th>
                  <th class="px-3 py-2 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr>
                  <td class="px-3 py-2 font-mono">askqlive_cookie_consent_v1</td>
                  <td class="px-3 py-2">AskQlive</td>
                  <td class="px-3 py-2">Stores your cookie choices</td>
                  <td class="px-3 py-2">Necessary · localStorage</td>
                  <td class="px-3 py-2">Until cleared</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 font-mono">live_qa_fingerprint</td>
                  <td class="px-3 py-2">AskQlive</td>
                  <td class="px-3 py-2">Participant identity for upvotes, rate limits, moderation</td>
                  <td class="px-3 py-2">Necessary · localStorage</td>
                  <td class="px-3 py-2">Until cleared</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 font-mono">Firebase auth / session keys</td>
                  <td class="px-3 py-2">Google Firebase</td>
                  <td class="px-3 py-2">Keep hosts/speakers signed in</td>
                  <td class="px-3 py-2">Necessary · cookie / storage</td>
                  <td class="px-3 py-2">Session / account lifetime</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 font-mono">Hosted session history, bookmarks</td>
                  <td class="px-3 py-2">AskQlive</td>
                  <td class="px-3 py-2">Convenience UI for returning hosts</td>
                  <td class="px-3 py-2">Functional · localStorage</td>
                  <td class="px-3 py-2">Until cleared</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 font-mono">_ga, _ga_*, gtag</td>
                  <td class="px-3 py-2">Google Analytics</td>
                  <td class="px-3 py-2">Usage analytics (ID G-V2Q44SS4M9)</td>
                  <td class="px-3 py-2">Analytics · cookie</td>
                  <td class="px-3 py-2">Up to ~2 years</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 font-mono">_clck, _clsk, CLID, ANONCHK…</td>
                  <td class="px-3 py-2">Microsoft Clarity</td>
                  <td class="px-3 py-2">Session replay / heatmaps (project ymqwv9le4d)</td>
                  <td class="px-3 py-2">Analytics · cookie</td>
                  <td class="px-3 py-2">Varies (session–months)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">4. Consent (GDPR / ePrivacy)</h2>
          <ul class="list-disc pl-5 space-y-1">
            <li>Non-essential cookies (analytics) are <strong>off by default</strong>.</li>
            <li>We use <strong>Google Consent Mode</strong> defaults (denied) until you opt in.</li>
            <li>You can change or withdraw consent anytime on this page or via the footer link.</li>
            <li>Withdrawing consent does not affect the lawfulness of processing before withdrawal.</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">5. Browser controls</h2>
          <p>
            You can also block or delete cookies in your browser settings. Blocking necessary storage
            may break join, voting, or host login.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">6. Contact</h2>
          <p>
            Questions:
            <a class="text-indigo-600 underline" href="mailto:privacy@askqlive.com">privacy&#64;askqlive.com</a>
            ·
            <a routerLink="/privacy" class="text-indigo-600 underline">Privacy Policy</a>
          </p>
        </section>
      </div>

      <div class="mt-10">
        <a
          routerLink="/"
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
        >
          <mat-icon class="text-sm">home</mat-icon>
          Back to AskQlive
        </a>
      </div>
    </article>
  `,
})
export class CookiePolicy {
  readonly consent = inject(CookieConsentService);

  readonly functional = signal(false);
  readonly analytics = signal(false);
  readonly savedMsg = signal<string | null>(null);

  constructor() {
    effect(() => {
      const p = this.consent.preferences();
      this.functional.set(p.functional);
      this.analytics.set(p.analytics);
    });
  }

  saveCustom(): void {
    this.consent.saveCustom({
      functional: this.functional(),
      analytics: this.analytics(),
    });
    this.flash('Preferences saved.');
  }

  acceptAll(): void {
    this.consent.acceptAll();
    this.functional.set(true);
    this.analytics.set(true);
    this.flash('All optional cookies accepted.');
  }

  rejectAll(): void {
    this.consent.rejectNonEssential();
    this.functional.set(false);
    this.analytics.set(false);
    this.flash('Non-essential cookies rejected.');
  }

  private flash(msg: string): void {
    this.savedMsg.set(msg);
    setTimeout(() => this.savedMsg.set(null), 3500);
  }
}
