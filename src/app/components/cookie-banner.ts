import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CookieConsentService } from '../services/cookie-consent.service';

@Component({
  selector: 'app-cookie-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    @if (consent.showBanner()) {
      <div
        class="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4 pointer-events-none"
        role="dialog"
        aria-modal="false"
        aria-labelledby="cookie-banner-title"
      >
        <div
          class="pointer-events-auto max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-2xl p-4 sm:p-5"
        >
          <div class="flex items-start gap-3">
            <div
              class="hidden sm:flex w-9 h-9 rounded-xl bg-amber-100 text-amber-800 items-center justify-center shrink-0"
            >
              <mat-icon class="text-lg">cookie</mat-icon>
            </div>
            <div class="flex-1 min-w-0 space-y-2">
              <h2 id="cookie-banner-title" class="text-sm font-bold text-slate-900">
                Cookies &amp; privacy
              </h2>
              <p class="text-xs text-slate-600 leading-relaxed">
                We use necessary storage to run live Q&amp;A (join, votes, security). Optional analytics
                (Google Analytics, Microsoft Clarity) load only if you accept. See our
                <a routerLink="/privacy" class="text-indigo-600 font-semibold underline-offset-2 hover:underline"
                  >Privacy Policy</a
                >
                and
                <a routerLink="/cookies" class="text-indigo-600 font-semibold underline-offset-2 hover:underline"
                  >Cookie Policy</a
                >.
              </p>
              <div class="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  (click)="consent.acceptAll()"
                  class="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                >
                  Accept all
                </button>
                <button
                  type="button"
                  (click)="consent.rejectNonEssential()"
                  class="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Reject non-essential
                </button>
                <a
                  routerLink="/cookies"
                  fragment="preferences"
                  class="px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-semibold hover:bg-indigo-100 inline-flex items-center"
                >
                  Customize
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class CookieBanner {
  readonly consent = inject(CookieConsentService);
}
