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
          class="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 border border-slate-200/80 shadow-2xl relative my-6 text-left animate-in fade-in zoom-in-95 duration-200 z-10"
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
                Encodes: {{ liveProductionUrl() }}
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

          <!-- SINGLE LIVE PRODUCTION RUNNING LINK BOX -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-1.5">
              <span class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Live Production Running Link</span>
              </span>
              <span class="text-[11px] font-medium text-indigo-600">
                One unified attendee URL
              </span>
            </div>

            <div class="flex items-center gap-2">
              <div class="flex-1 min-w-0 bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-2.5 text-xs font-mono text-slate-800 truncate select-all">
                {{ liveProductionUrl() }}
              </div>

              <button
                id="btn-copy-share-link"
                type="button"
                (click)="copyLink(liveProductionUrl())"
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
                (click)="openInNewTab(liveProductionUrl())"
                class="p-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 cursor-pointer transition-colors shadow-2xs"
                title="Open link in a new browser tab"
              >
                <mat-icon class="text-base">open_in_new</mat-icon>
              </button>
            </div>
          </div>

          <!-- DIRECT LINK VS. DIRECT OPEN (CODE JOIN) GUIDANCE -->
          <div class="mb-4 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                How Attendees Join:
              </span>
              <span class="text-[10px] font-mono text-slate-400">Zero Authentication Required</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <!-- Mode 1: Direct Link -->
              <div class="p-2.5 bg-white rounded-xl border border-slate-200/80 space-y-1">
                <div class="flex items-center gap-1.5 font-bold text-indigo-700 text-[11px]">
                  <mat-icon class="text-xs">link</mat-icon>
                  <span>Via Direct Link / QR</span>
                </div>
                <p class="text-[11px] text-slate-600 leading-relaxed">
                  Opening the live link directly writes the code and auto-enters the live session.
                </p>
              </div>

              <!-- Mode 2: Direct Site Open (CODE JOIN) -->
              <div class="p-2.5 bg-white rounded-xl border border-indigo-200/80 bg-indigo-50/20 space-y-1">
                <div class="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                  <mat-icon class="text-xs text-indigo-600">keyboard</mat-icon>
                  <span>If Opening Site Directly</span>
                </div>
                <p class="text-[11px] text-slate-700 leading-relaxed">
                  Enter Event Code <strong class="font-mono text-indigo-700 font-bold bg-indigo-100/70 px-1 py-0.2 rounded">#{{ modalData.joinCode }}</strong> and click <strong class="text-slate-900">Join via Code</strong> (CODE JOIN).
                </p>
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons: Copy Code, Copy Invite, & Native Share -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
            <button
              id="btn-copy-room-code-modal"
              type="button"
              (click)="copyRoomCode(modalData.joinCode)"
              class="w-full py-2.5 px-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <mat-icon class="text-sm text-slate-500">{{ copiedCode() ? 'check' : 'tag' }}</mat-icon>
              <span>{{ copiedCode() ? 'Code Copied!' : 'Copy Code #' + modalData.joinCode }}</span>
            </button>

            <button
              id="btn-copy-invite-modal"
              type="button"
              (click)="copyFullInvite(modalData.title, modalData.joinCode, liveProductionUrl())"
              class="w-full py-2.5 px-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <mat-icon class="text-sm text-indigo-600">{{ copiedInvite() ? 'check' : 'mark_email_read' }}</mat-icon>
              <span>{{ copiedInvite() ? 'Invite Copied!' : 'Copy Full Invite Message' }}</span>
            </button>
          </div>

          @if (canNativeShare()) {
            <div class="mb-4">
              <button
                id="btn-native-share-modal"
                type="button"
                (click)="nativeShare(modalData.title, modalData.joinCode, liveProductionUrl())"
                class="w-full py-2.5 px-3.5 rounded-2xl border border-indigo-300 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <mat-icon class="text-sm">share</mat-icon>
                <span>Share via Device Apps...</span>
              </button>
            </div>
          }

          <!-- Presenter Slide Tip Box -->
          <div class="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-xs text-indigo-900/90 flex items-start gap-2.5">
            <mat-icon class="text-sm text-indigo-600 shrink-0 mt-0.5">lightbulb</mat-icon>
            <p class="leading-relaxed text-[11px] text-indigo-900/80">
              <strong class="font-semibold text-indigo-950">Presenter Slide Tip:</strong>
              Download this QR code PNG for your presentation slides. Attendees scanning the QR code or clicking the direct link will automatically have their room code written and join immediately without manual entry.
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
  public copiedLink = signal<boolean>(false);
  public copiedCode = signal<boolean>(false);
  public copiedInvite = signal<boolean>(false);
  public isPresenterEnlarged = signal<boolean>(false);

  public currentJoinCode = signal<string>('');

  private getBaseOrigin(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return '';
  }

  public baseSiteUrl = computed(() => {
    return this.getBaseOrigin() || CLOUD_RUN_DEV_URL;
  });

  /**
   * Single unified Live Production running URL for attendees.
   */
  public liveProductionUrl = computed(() => {
    const code =
      this.currentJoinCode() ||
      this.qaService.currentSession()?.joinCode ||
      this.qaService.currentSeries()?.seriesCode ||
      '';
    const base = this.baseSiteUrl();
    return code ? `${base}/?code=${code.toUpperCase()}` : base;
  });

  // Backward compatibility alias
  public shareableUrl = computed(() => {
    return this.liveProductionUrl();
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
        this.generateQrCodeForUrl(this.liveProductionUrl());
      } else {
        this.qrCodeDataUrl.set('');
        this.copiedLink.set(false);
        this.copiedCode.set(false);
        this.copiedInvite.set(false);
        this.isPresenterEnlarged.set(false);
      }
    });
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
      this.qaService.showToast('Live production attendee link copied!');
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

  public copyFullInvite(title: string, code: string, url: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      const origin = this.baseSiteUrl();
      const message = `Join live Q&A: "${title}"\n• Direct Link: ${url}\n• Or visit ${origin} and enter CODE: #${code} to JOIN`;
      navigator.clipboard.writeText(message);
      this.copiedInvite.set(true);
      setTimeout(() => this.copiedInvite.set(false), 2500);
      this.qaService.showToast('Full join invite message copied!');
    }
  }

  public downloadQrPng(code: string): void {
    const dataUrl = this.qrCodeDataUrl();
    if (!dataUrl || typeof document === 'undefined') return;

    const link = document.createElement('a');
    link.download = `AskQlive-QR-${code}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.qaService.showToast(`Downloaded QR Code image for #${code}!`);
  }

  public async nativeShare(title: string, code: string, url: string): Promise<void> {
    const origin = this.baseSiteUrl();
    const shareText = `Join the live interactive Q&A session "${title}"!\nDirect Link: ${url}\nOr visit ${origin} & enter CODE: #${code} to JOIN`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${title} on AskQlive`,
          text: shareText,
          url: url,
        });
        this.qaService.showToast('Shared successfully!');
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          this.copyLink(url);
        }
      }
    } else {
      this.copyFullInvite(title, code, url);
    }
  }

  public openInNewTab(url: string): void {
    if (typeof window !== 'undefined' && url) {
      window.open(url, '_blank');
    }
  }
}
