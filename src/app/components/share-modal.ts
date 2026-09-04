import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import * as QRCode from 'qrcode';
import { QaService } from '../services/qa.service';

export const CLOUD_RUN_DEV_URL = 'https://ais-dev-er5cbhqzhrr7gn4nf5ibs2-583451844279.asia-east1.run.app';
export const STUDIO_CUSTOM_URL = 'https://askqa-live.ai.studio';

@Component({
  selector: 'app-share-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (qaService.shareModalData(); as modalData) {
      <div
        id="share-modal-backdrop"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      >
        <!-- Accessible Backdrop Dismiss Button -->
        <button
          id="btn-backdrop-dismiss"
          type="button"
          (click)="qaService.closeShareModal()"
          aria-label="Dismiss share dialog"
          class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs w-full h-full border-0 cursor-default"
        ></button>

        <div
          id="share-modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
          class="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 border border-slate-200/80 shadow-2xl relative my-6 text-left animate-in fade-in zoom-in-95 duration-200 z-10"
          [class.max-w-2xl]="isPresenterEnlarged()"
        >
          <!-- Close Button -->
          <button
            id="btn-close-share-modal"
            type="button"
            (click)="qaService.closeShareModal()"
            class="absolute top-5 right-5 p-2 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
            title="Close Share Dialog"
          >
            <mat-icon class="text-xl">close</mat-icon>
          </button>

          <!-- Header -->
          <div class="flex items-center gap-3.5 mb-5">
            <div class="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
              <mat-icon class="text-2xl">qr_code_2</mat-icon>
            </div>
            <div class="min-w-0 pr-8">
              <h3 id="share-modal-title" class="text-xl font-display font-bold text-slate-900 tracking-tight">
                Share Live Q&amp;A Session
              </h3>
              <p class="text-xs text-slate-500 mt-0.5 truncate">
                Audience attendees scan the QR code or click the direct join link.
              </p>
            </div>
          </div>

          <!-- Session Metadata Header -->
          <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl mb-5 flex flex-wrap items-center justify-between gap-2.5">
            <div class="min-w-0">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Target Session
              </span>
              <h4 class="text-sm font-semibold text-slate-900 truncate max-w-[280px] sm:max-w-md">
                {{ modalData.title }}
              </h4>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-mono font-bold text-sm text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-xl">
                #{{ modalData.joinCode }}
              </span>
              <span class="text-xs px-2.5 py-1 rounded-xl font-medium bg-slate-200/70 text-slate-700">
                {{ modalData.type === 'series' ? 'Workshop Series' : 'Keynote' }}
              </span>
            </div>
          </div>

          <!-- Domain Destination Selector Tabs -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Choose Link &amp; QR Destination:
              </span>
              <span class="text-[11px] text-indigo-600 font-medium">
                QR regenerates automatically
              </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/70">
              <!-- Tab 1: Cloud Run URL -->
              <button
                id="btn-tab-cloudrun"
                type="button"
                (click)="selectDomain('cloudrun')"
                class="p-2.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-center"
                [class.bg-white]="selectedDomain() === 'cloudrun'"
                [class.shadow-xs]="selectedDomain() === 'cloudrun'"
                [class.border]="selectedDomain() === 'cloudrun'"
                [class.border-slate-200]="selectedDomain() === 'cloudrun'"
                [class.text-indigo-900]="selectedDomain() === 'cloudrun'"
                [class.text-slate-600]="selectedDomain() !== 'cloudrun'"
                [class.hover:bg-slate-200/60]="selectedDomain() !== 'cloudrun'"
              >
                <div class="flex items-center gap-1.5 text-xs font-bold font-mono">
                  <mat-icon class="text-sm text-indigo-600">cloud</mat-icon>
                  <span>Cloud Run Instance</span>
                  @if (selectedDomain() === 'cloudrun') {
                    <span class="ml-auto w-2 h-2 rounded-full bg-emerald-500"></span>
                  }
                </div>
                <div class="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                  ais-dev-...run.app/?code={{ modalData.joinCode }}
                </div>
              </button>

              <!-- Tab 2: AI Studio Custom Domain -->
              <button
                id="btn-tab-studio"
                type="button"
                (click)="selectDomain('studio')"
                class="p-2.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-center"
                [class.bg-white]="selectedDomain() === 'studio'"
                [class.shadow-xs]="selectedDomain() === 'studio'"
                [class.border]="selectedDomain() === 'studio'"
                [class.border-slate-200]="selectedDomain() === 'studio'"
                [class.text-indigo-900]="selectedDomain() === 'studio'"
                [class.text-slate-600]="selectedDomain() !== 'studio'"
                [class.hover:bg-slate-200/60]="selectedDomain() !== 'studio'"
              >
                <div class="flex items-center gap-1.5 text-xs font-bold font-mono">
                  <mat-icon class="text-sm text-indigo-600">domain</mat-icon>
                  <span>Studio Custom URL</span>
                  @if (selectedDomain() === 'studio') {
                    <span class="ml-auto w-2 h-2 rounded-full bg-emerald-500"></span>
                  }
                </div>
                <div class="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                  askqa-live.ai.studio/?code={{ modalData.joinCode }}
                </div>
              </button>
            </div>
          </div>

          <!-- QR Code Display Box -->
          <div class="text-center mb-5">
            <div
              class="relative inline-block p-4 sm:p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm transition-all duration-200"
              [class.scale-105]="isPresenterEnlarged()"
            >
              @if (qrCodeDataUrl()) {
                <img
                  id="img-share-qr-code"
                  [src]="qrCodeDataUrl()"
                  alt="Live Session QR Code"
                  [class.w-72]="isPresenterEnlarged()"
                  [class.h-72]="isPresenterEnlarged()"
                  [class.w-56]="!isPresenterEnlarged()"
                  [class.h-56]="!isPresenterEnlarged()"
                  class="mx-auto rounded-2xl transition-all duration-200 select-none object-contain"
                />
              } @else {
                <div class="w-56 h-56 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <mat-icon class="animate-spin text-2xl text-indigo-500">sync</mat-icon>
                  <span class="text-xs font-medium">Generating High-Res QR Code...</span>
                </div>
              }

              <!-- Encoded Link Badge under QR -->
              <div class="mt-2 text-[10px] font-mono text-slate-500 bg-slate-100 rounded-lg py-1 px-2.5 max-w-xs truncate mx-auto">
                Encodes: {{ shareableUrl() }}
              </div>

              <!-- Enlarged Projector Badge -->
              @if (isPresenterEnlarged()) {
                <div class="mt-2 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg py-1 px-3 inline-block">
                  Projector Auditorium Mode
                </div>
              }
            </div>

            <!-- QR Controls Row -->
            <div class="flex items-center justify-center gap-2 mt-3">
              <button
                id="btn-download-qr-png"
                type="button"
                (click)="downloadQrPng(modalData.joinCode)"
                [disabled]="!qrCodeDataUrl()"
                class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                title="Download high-res PNG for slide decks"
              >
                <mat-icon class="text-sm">download</mat-icon>
                <span>Download QR (.png)</span>
              </button>

              <button
                id="btn-toggle-enlarge-qr"
                type="button"
                (click)="togglePresenterEnlarge()"
                class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                title="Enlarge QR code for auditorium screen projection"
              >
                <mat-icon class="text-sm">{{ isPresenterEnlarged() ? 'zoom_in_map' : 'fullscreen' }}</mat-icon>
                <span>{{ isPresenterEnlarged() ? 'Normal Size' : 'Projector View' }}</span>
              </button>
            </div>
          </div>

          <!-- Active Selected Link Box -->
          <div class="mb-4">
            <span class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Active Sharable Attendee Link
            </span>
            <div class="flex items-center gap-2">
              <div class="flex-1 min-w-0 bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-2.5 text-xs font-mono text-slate-800 truncate select-all">
                {{ shareableUrl() }}
              </div>

              <button
                id="btn-copy-share-link"
                type="button"
                (click)="copyLink(shareableUrl())"
                class="px-4 py-2.5 rounded-2xl font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                [class.bg-emerald-600]="copiedLink()"
                [class.text-white]="copiedLink()"
                [class.bg-indigo-600]="!copiedLink()"
                [class.hover:bg-indigo-700]="!copiedLink()"
                [class.text-white]="!copiedLink()"
              >
                <mat-icon class="text-sm">{{ copiedLink() ? 'check' : 'content_copy' }}</mat-icon>
                <span>{{ copiedLink() ? 'Copied!' : 'Copy Link' }}</span>
              </button>

              <button
                id="btn-open-link-tab"
                type="button"
                (click)="openInNewTab(shareableUrl())"
                class="p-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 cursor-pointer transition-colors shadow-2xs"
                title="Open link in a new browser tab"
              >
                <mat-icon class="text-base">open_in_new</mat-icon>
              </button>
            </div>
          </div>

          <!-- Both Accessible URLs List -->
          <div class="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
            <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Both Valid Attendee Access URLs:
            </span>

            <!-- Cloud Run URL row -->
            <div class="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200/80">
              <div class="min-w-0 flex items-center gap-2">
                <span class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-50 text-indigo-700 shrink-0">
                  Cloud Run
                </span>
                <span class="font-mono text-xs text-slate-800 truncate">
                  {{ cloudRunUrl() }}
                </span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  id="btn-copy-cloudrun-url"
                  type="button"
                  (click)="copyIndividualUrl(cloudRunUrl(), 'cloudrun')"
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors flex items-center gap-1"
                >
                  <mat-icon class="text-xs">{{ copiedCloudRun() ? 'check' : 'content_copy' }}</mat-icon>
                  <span>{{ copiedCloudRun() ? 'Copied' : 'Copy' }}</span>
                </button>
                <button
                  type="button"
                  (click)="openInNewTab(cloudRunUrl())"
                  class="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Open Cloud Run link"
                >
                  <mat-icon class="text-sm">open_in_new</mat-icon>
                </button>
              </div>
            </div>

            <!-- Custom Studio URL row -->
            <div class="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200/80">
              <div class="min-w-0 flex items-center gap-2">
                <span class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-50 text-purple-700 shrink-0">
                  Studio
                </span>
                <span class="font-mono text-xs text-slate-800 truncate">
                  {{ studioUrl() }}
                </span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  id="btn-copy-studio-url"
                  type="button"
                  (click)="copyIndividualUrl(studioUrl(), 'studio')"
                  class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors flex items-center gap-1"
                >
                  <mat-icon class="text-xs">{{ copiedStudio() ? 'check' : 'content_copy' }}</mat-icon>
                  <span>{{ copiedStudio() ? 'Copied' : 'Copy' }}</span>
                </button>
                <button
                  type="button"
                  (click)="openInNewTab(studioUrl())"
                  class="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Open Studio link"
                >
                  <mat-icon class="text-sm">open_in_new</mat-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons: Copy Code & Native Device Share -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
            <button
              id="btn-copy-room-code-modal"
              type="button"
              (click)="copyRoomCode(modalData.joinCode)"
              class="w-full py-2.5 px-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <mat-icon class="text-sm text-slate-500">{{ copiedCode() ? 'check' : 'tag' }}</mat-icon>
              <span>{{ copiedCode() ? 'Code Copied!' : 'Copy Room Code #' + modalData.joinCode }}</span>
            </button>

            @if (canNativeShare()) {
              <button
                id="btn-native-share-modal"
                type="button"
                (click)="nativeShare(modalData.title, modalData.joinCode, shareableUrl())"
                class="w-full py-2.5 px-3.5 rounded-2xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <mat-icon class="text-sm">share</mat-icon>
                <span>Share via Apps...</span>
              </button>
            } @else {
              <button
                id="btn-open-preview-tab"
                type="button"
                (click)="openInNewTab(shareableUrl())"
                class="w-full py-2.5 px-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <mat-icon class="text-sm text-slate-500">open_in_new</mat-icon>
                <span>Open Attendee Tab</span>
              </button>
            }
          </div>

          <!-- Presenter Slide Tip Box -->
          <div class="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-xs text-indigo-900/90 flex items-start gap-2.5">
            <mat-icon class="text-sm text-indigo-600 shrink-0 mt-0.5">lightbulb</mat-icon>
            <p class="leading-relaxed text-[11px] text-indigo-900/80">
              <strong class="font-semibold text-indigo-950">Presenter Slide Tip:</strong>
              Download this QR code PNG and place it on your opening slide. Attendees scanning the QR code or visiting with
              <span class="font-mono bg-indigo-100/70 px-1 py-0.5 rounded text-indigo-800">?code={{ modalData.joinCode }}</span>
              will automatically bypass the code entry screen and land straight into the live interactive feed.
            </p>
          </div>
        </div>
      </div>
    }
  `,
})
export class ShareModal {
  public qaService = inject(QaService);

  public qrCodeDataUrl = signal<string>('');
  public selectedDomain = signal<'cloudrun' | 'studio'>('cloudrun');
  public copiedLink = signal<boolean>(false);
  public copiedCode = signal<boolean>(false);
  public copiedCloudRun = signal<boolean>(false);
  public copiedStudio = signal<boolean>(false);
  public isPresenterEnlarged = signal<boolean>(false);

  public currentJoinCode = signal<string>('NVIDIA');

  public cloudRunUrl = computed(() => {
    const code = this.currentJoinCode() || 'NVIDIA';
    return `${CLOUD_RUN_DEV_URL}/?code=${code.toUpperCase()}`;
  });

  public studioUrl = computed(() => {
    const code = this.currentJoinCode() || 'NVIDIA';
    return `${STUDIO_CUSTOM_URL}/?code=${code.toUpperCase()}`;
  });

  public shareableUrl = computed(() => {
    return this.selectedDomain() === 'cloudrun' ? this.cloudRunUrl() : this.studioUrl();
  });

  public canNativeShare = signal<boolean>(
    typeof navigator !== 'undefined' && !!navigator.share
  );

  constructor() {
    // Listen for modal open/close & joinCode changes
    effect(() => {
      const data = this.qaService.shareModalData();
      if (data && data.joinCode) {
        const cleanCode = data.joinCode.toUpperCase().trim();
        this.currentJoinCode.set(cleanCode);
        this.generateQrCodeForUrl(this.shareableUrl());
      } else {
        this.qrCodeDataUrl.set('');
        this.copiedLink.set(false);
        this.copiedCode.set(false);
        this.copiedCloudRun.set(false);
        this.copiedStudio.set(false);
        this.isPresenterEnlarged.set(false);
      }
    });
  }

  public selectDomain(domain: 'cloudrun' | 'studio'): void {
    this.selectedDomain.set(domain);
    this.generateQrCodeForUrl(this.shareableUrl());
  }

  private async generateQrCodeForUrl(url: string): Promise<void> {
    if (!url) return;

    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 512,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });
      this.qrCodeDataUrl.set(dataUrl);
    } catch (err) {
      console.warn('Failed to generate QR Code:', err);
    }
  }

  public togglePresenterEnlarge(): void {
    this.isPresenterEnlarged.update(v => !v);
  }

  public copyLink(url: string): void {
    if (!url) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      this.copiedLink.set(true);
      setTimeout(() => this.copiedLink.set(false), 2500);
      this.qaService.showToast('Sharable link copied to clipboard!');
    }
  }

  public copyIndividualUrl(url: string, type: 'cloudrun' | 'studio'): void {
    if (!url) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      if (type === 'cloudrun') {
        this.copiedCloudRun.set(true);
        setTimeout(() => this.copiedCloudRun.set(false), 2500);
      } else {
        this.copiedStudio.set(true);
        setTimeout(() => this.copiedStudio.set(false), 2500);
      }
      this.qaService.showToast('Link copied to clipboard!');
    }
  }

  public copyRoomCode(code: string): void {
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      this.copiedCode.set(true);
      setTimeout(() => this.copiedCode.set(false), 2500);
      this.qaService.showToast(`Room code #${code} copied!`);
    }
  }

  public downloadQrPng(code: string): void {
    const dataUrl = this.qrCodeDataUrl();
    if (!dataUrl || typeof document === 'undefined') return;

    const domainName = this.selectedDomain() === 'cloudrun' ? 'CloudRun' : 'AskQlive';
    const link = document.createElement('a');
    link.download = `AskQlive-QR-${code}-${domainName}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.qaService.showToast(`Downloaded QR Code image for #${code}!`);
  }

  public async nativeShare(title: string, code: string, url: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${title} on AskQlive`,
          text: `Join the live interactive Q&A session "${title}" using room code #${code}`,
          url: url,
        });
        this.qaService.showToast('Shared successfully!');
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          this.copyLink(url);
        }
      }
    } else {
      this.copyLink(url);
    }
  }

  public openInNewTab(url: string): void {
    if (typeof window !== 'undefined' && url) {
      window.open(url, '_blank');
    }
  }
}

