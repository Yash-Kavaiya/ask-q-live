import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { ModerationSensitivity, Question } from '../models/qa.models';

@Component({
  selector: 'app-moderation-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, SlicePipe],
  template: `
    <div class="space-y-6">
      
      <!-- Moderation Controls Header -->
      <div class="bg-white rounded-2xl p-5 border border-[#E0E2EC] shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[#D93025] text-white flex items-center justify-center">
            <mat-icon class="text-xl">gavel</mat-icon>
          </div>
          <div>
            <h2 class="font-display font-bold text-lg text-[#1F1F1F]">Automated Content Moderation</h2>
            <p class="text-xs text-[#747775]">
              Real-time classification for spam, offensive content, and promotional links
            </p>
          </div>
        </div>

        <!-- Sensitivity Selector -->
        <div class="flex items-center gap-2 text-xs">
          <span class="text-[#747775] font-semibold">AI Sensitivity:</span>
          <select
            id="select-mod-sensitivity"
            [value]="currentSensitivity()"
            (change)="onSensitivityChange($event)"
            class="bg-[#F8F9FA] border border-[#E0E2EC] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#1F1F1F] outline-none cursor-pointer"
          >
            <option value="STRICT">Strict (Zero tolerance for promo/spam)</option>
            <option value="BALANCED">Balanced (Standard Enterprise)</option>
            <option value="RELAXED">Relaxed (Permissive Q&amp;A)</option>
          </select>
        </div>
      </div>

      <!-- Pending Moderation Items List -->
      <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-[#E0E2EC]">
          <div class="flex items-center gap-2">
            <mat-icon class="text-[#D93025] text-base">hourglass_top</mat-icon>
            <h3 class="font-display font-bold text-base text-[#1F1F1F]">Flagged Inquiries (Pending Review)</h3>
          </div>
          <span class="text-xs font-mono font-bold text-[#D93025]">
            {{ flaggedQuestions().length }} Flagged
          </span>
        </div>

        <div class="space-y-3">
          @for (q of flaggedQuestions(); track q.id) {
            <div
              [id]="'mod-item-' + q.id"
              class="p-4 rounded-xl border border-[#F5C2C7] bg-[#FDF7F7] flex items-start justify-between gap-4 flex-wrap"
            >
              <div class="flex-1 min-w-[240px]">
                <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span class="font-semibold text-xs text-[#1F1F1F]">{{ q.authorName }}</span>
                  <span class="text-xs text-[#747775] font-mono">({{ q.clientFingerprint }})</span>
                  @if (q.isSpam) {
                    <span class="px-2 py-0.5 rounded bg-[#FCE8E6] text-[#D93025] text-[10px] font-bold border border-[#F5C2C7]">
                      SPAM DETECTED
                    </span>
                  }
                  @if (q.moderationReason) {
                    <span class="text-xs text-[#D93025] italic">
                      "{{ q.moderationReason }}"
                    </span>
                  }
                </div>

                <p class="font-display font-medium text-sm text-[#1F1F1F] leading-snug mb-2">
                  {{ q.content }}
                </p>

                <div class="text-[11px] text-[#747775]">
                  Submitted {{ q.createdAt | slice:11:16 }} • Category: {{ q.category || 'General' }}
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  (click)="approve(q.id)"
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#E6F4EA] text-[#137333] hover:bg-[#CEEAD6] transition-colors cursor-pointer flex items-center gap-1 border border-[#CEEAD6]"
                >
                  <mat-icon class="text-sm">done</mat-icon>
                  <span>Approve</span>
                </button>

                <button
                  type="button"
                  (click)="reject(q.id)"
                  class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#FCE8E6] text-[#D93025] hover:bg-[#F5C2C7] transition-colors cursor-pointer flex items-center gap-1 border border-[#F5C2C7]"
                >
                  <mat-icon class="text-sm">close</mat-icon>
                  <span>Reject</span>
                </button>

                <button
                  type="button"
                  (click)="banUser(q.clientFingerprint)"
                  class="p-1.5 rounded-lg text-[#747775] hover:text-[#D93025] hover:bg-[#FCE8E6] transition-colors cursor-pointer"
                  title="Ban participant fingerprint from submitting questions"
                >
                  <mat-icon class="text-base">person_off</mat-icon>
                </button>
              </div>
            </div>
          } @empty {
            <div class="text-center py-10">
              <div class="w-12 h-12 rounded-2xl bg-[#E6F4EA] text-[#1E8E3E] flex items-center justify-center mx-auto mb-3">
                <mat-icon class="text-2xl">verified_user</mat-icon>
              </div>
              <h4 class="font-display font-bold text-sm text-[#1F1F1F] mb-1">
                Moderation Queue is Clean!
              </h4>
              <p class="text-xs text-[#747775]">
                All incoming attendee questions passed safety and spam guidelines.
              </p>
            </div>
          }
        </div>
      </div>

    </div>
  `,
})
export class ModerationQueue {
  public qaService = inject(QaService);

  public flaggedQuestions = computed<Question[]>(() => {
    return this.qaService.questions().filter(
      q => q.status === 'PENDING_REVIEW' || q.status === 'REJECTED' || q.isSpam
    );
  });

  public currentSensitivity = computed(() => {
    return this.qaService.currentSession()?.settings.moderationSensitivity || 'BALANCED';
  });

  public approve(questionId: string): void {
    this.qaService.updateQuestionStatus(questionId, 'APPROVED');
    this.qaService.showToast('Question approved and published to live audience feed!');
  }

  public reject(questionId: string): void {
    this.qaService.updateQuestionStatus(questionId, 'REJECTED');
    this.qaService.showToast('Question rejected and hidden from live feed.');
  }

  public async banUser(fingerprint: string): Promise<void> {
    if (confirm(`Ban participant (${fingerprint}) from asking questions?`)) {
      await this.qaService.banParticipant(fingerprint, true);
      this.qaService.showToast('Participant banned from live room.');
    }
  }

  public onSensitivityChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as ModerationSensitivity;
    this.qaService.updateSettings({ moderationSensitivity: val });
  }
}
