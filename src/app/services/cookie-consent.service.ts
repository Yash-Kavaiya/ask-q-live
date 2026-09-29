import { Injectable, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ConsentCategory = 'necessary' | 'functional' | 'analytics';

export interface CookiePreferences {
  necessary: true;
  functional: boolean;
  analytics: boolean;
  updatedAt: string | null;
  /** True once the visitor has made an explicit choice (accept / reject / customize). */
  decided: boolean;
}

const STORAGE_KEY = 'askqlive_cookie_consent_v1';
const GA_MEASUREMENT_ID = 'G-V2Q44SS4M9';
const CLARITY_PROJECT_ID = 'ymqwv9le4d';

const DEFAULT_PREFS: CookiePreferences = {
  necessary: true,
  functional: false,
  analytics: false,
  updatedAt: null,
  decided: false,
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly prefs = signal<CookiePreferences>({ ...DEFAULT_PREFS });
  private analyticsLoaded = false;

  readonly preferences = this.prefs.asReadonly();
  readonly hasDecided = computed(() => this.prefs().decided);
  readonly showBanner = computed(() => this.isBrowser() && !this.prefs().decided);

  constructor() {
    if (!this.isBrowser()) return;
    this.applyGoogleConsentDefaults();
    this.loadFromStorage();
    if (this.prefs().decided) {
      this.applyPreferences(this.prefs());
    }
  }

  acceptAll(): void {
    this.save({
      necessary: true,
      functional: true,
      analytics: true,
      updatedAt: new Date().toISOString(),
      decided: true,
    });
  }

  rejectNonEssential(): void {
    this.save({
      necessary: true,
      functional: false,
      analytics: false,
      updatedAt: new Date().toISOString(),
      decided: true,
    });
  }

  saveCustom(partial: { functional: boolean; analytics: boolean }): void {
    this.save({
      necessary: true,
      functional: partial.functional,
      analytics: partial.analytics,
      updatedAt: new Date().toISOString(),
      decided: true,
    });
  }

  /** Open preference UI again (from footer / cookie policy). */
  reopenBanner(): void {
    if (!this.isBrowser()) return;
    this.prefs.update((p) => ({ ...p, decided: false }));
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
      if (parsed && parsed.decided === true) {
        this.prefs.set({
          necessary: true,
          functional: !!parsed.functional,
          analytics: !!parsed.analytics,
          updatedAt: parsed.updatedAt || null,
          decided: true,
        });
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private save(next: CookiePreferences): void {
    this.prefs.set(next);
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode / quota */
    }
    this.applyPreferences(next);
  }

  private applyGoogleConsentDefaults(): void {
    const w = window;
    w.dataLayer = w.dataLayer || [];
    w.gtag =
      w.gtag ||
      function gtag(...args: unknown[]) {
        w.dataLayer!.push(args);
      };
    w.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      wait_for_update: 500,
    });
  }

  private applyPreferences(prefs: CookiePreferences): void {
    if (!this.isBrowser()) return;

    window.gtag?.('consent', 'update', {
      analytics_storage: prefs.analytics ? 'granted' : 'denied',
      functionality_storage: prefs.functional ? 'granted' : 'denied',
      personalization_storage: prefs.functional ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      security_storage: 'granted',
    });

    if (prefs.analytics) {
      this.loadAnalyticsScripts();
    }
  }

  private loadAnalyticsScripts(): void {
    if (this.analyticsLoaded) return;
    this.analyticsLoaded = true;

    // Google Analytics 4
    if (!document.getElementById('askqlive-ga-script')) {
      const ga = document.createElement('script');
      ga.id = 'askqlive-ga-script';
      ga.async = true;
      ga.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(ga);

      window.dataLayer = window.dataLayer || [];
      window.gtag =
        window.gtag ||
        function gtag(...args: unknown[]) {
          window.dataLayer!.push(args);
        };
      window.gtag('js', new Date());
      window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
    }

    // Microsoft Clarity
    if (!document.getElementById('askqlive-clarity-script')) {
      const w = window as unknown as {
        clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
      };
      const queue: unknown[] = [];
      const stub = ((...args: unknown[]) => {
        queue.push(args);
      }) as ((...args: unknown[]) => void) & { q?: unknown[] };
      stub.q = queue;
      w.clarity = w.clarity || stub;
      const t = document.createElement('script');
      t.async = true;
      t.id = 'askqlive-clarity-script';
      t.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
      const first = document.getElementsByTagName('script')[0];
      first?.parentNode?.insertBefore(t, first);
    }
  }
}
