import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { ReportExporterService } from '../services/report-exporter.service';
import { PostSessionReport } from '../models/qa.models';

@Component({
  selector: 'app-executive-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, SlicePipe],
  template: `
    <div class="space-y-6">
      
      <!-- Report Header -->
      <div class="bg-white rounded-2xl p-5 border border-[#E0E2EC] shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[#1E8E3E] text-white flex items-center justify-center">
            <mat-icon class="text-xl">summarize</mat-icon>
          </div>
          <div>
            <h2 class="font-display font-bold text-lg text-[#1F1F1F]">Post-Session Executive Report</h2>
            <p class="text-xs text-[#747775]">
              AI-generated audience debrief • Thematic clusters • 5 Actionable follow-ups • Downloadable PDF &amp; CSV
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <!-- PDF Export Button -->
          <button
            id="btn-export-pdf"
            type="button"
            (click)="exportToPdf()"
            class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F8F9FA] text-[#B3261E] border border-[#F9DEDC] hover:bg-[#FCE8E6] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Download executive report and question insights as a formatted PDF"
          >
            <mat-icon class="text-sm text-[#B3261E]">picture_as_pdf</mat-icon>
            <span>Export PDF</span>
          </button>

          <!-- CSV Export Button -->
          <button
            id="btn-export-csv"
            type="button"
            (click)="exportToCsv()"
            class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F8F9FA] text-[#137333] border border-[#CEEAD6] hover:bg-[#E6F4EA] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Download structured spreadsheet CSV with questions, upvotes, and summary"
          >
            <mat-icon class="text-sm text-[#137333]">table_view</mat-icon>
            <span>Export CSV</span>
          </button>

          @if (report()) {
            <button
              id="btn-copy-report"
              type="button"
              (click)="copyReportMarkdown()"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F1F3F4] text-[#1F1F1F] hover:bg-[#E0E2EC] transition-colors cursor-pointer flex items-center gap-1.5"
              title="Copy markdown text to clipboard"
            >
              <mat-icon class="text-sm">content_copy</mat-icon>
              <span>Markdown</span>
            </button>
          }

          <button
            id="btn-generate-report"
            type="button"
            (click)="generateReport()"
            [disabled]="isGenerating()"
            class="px-5 py-2 rounded-xl font-display font-semibold text-xs text-white bg-[#1A73E8] hover:bg-[#185ABC] disabled:opacity-50 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            @if (isGenerating()) {
              <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Synthesizing Report...</span>
            } @else {
              <mat-icon class="text-base">auto_awesome</mat-icon>
              <span>{{ report() ? 'Regenerate Report' : 'Generate Executive Report' }}</span>
            }
          </button>
        </div>
      </div>

      <!-- Report Content Display -->
      @if (report(); as rep) {
        <div class="space-y-6">
          
          <!-- Executive Summary Callout -->
          <div class="bg-gradient-to-br from-[#F8F9FA] to-[#E8F0FE] rounded-2xl p-6 border border-[#D2E3FC] shadow-xs">
            <div class="flex items-center justify-between gap-4 mb-2 flex-wrap">
              <div class="flex items-center gap-2 text-[#1A73E8]">
                <mat-icon class="text-xl">insights</mat-icon>
                <h3 class="font-display font-bold text-base">Executive Debrief Summary</h3>
              </div>

              <!-- Quick Export Pill in Callout -->
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="exportToPdf()"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-[#B3261E] border border-[#F9DEDC] hover:bg-[#FCE8E6] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <mat-icon class="text-xs">picture_as_pdf</mat-icon>
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  (click)="exportToCsv()"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-[#137333] border border-[#CEEAD6] hover:bg-[#E6F4EA] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <mat-icon class="text-xs">table_view</mat-icon>
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <p class="text-sm sm:text-base text-[#1F1F1F] leading-relaxed font-normal">
              {{ rep.executiveSummary || 'Real-time session synthesis completed across attendee inquiry streams and upvote momentum.' }}
            </p>
            <div class="mt-4 pt-3 border-t border-[#D2E3FC]/60 flex items-center gap-4 text-xs text-[#747775] flex-wrap">
              <span><strong>Session:</strong> {{ rep.sessionTitle }}</span>
              <span>•</span>
              <span><strong>Total Questions:</strong> {{ rep.totalQuestions }}</span>
              <span>•</span>
              <span><strong>Total Upvotes:</strong> {{ rep.totalUpvotes }}</span>
              <span>•</span>
              <span><strong>Generated:</strong> {{ rep.generatedAt | slice:0:10 }} {{ rep.generatedAt | slice:11:16 }}</span>
            </div>
          </div>

          <!-- Thematic Clusters Grid -->
          <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-4">
            <div class="flex items-center gap-2 pb-3 border-b border-[#E0E2EC]">
              <mat-icon class="text-[#1A73E8] text-base">hub</mat-icon>
              <h3 class="font-display font-bold text-base text-[#1F1F1F]">Top Audience Thematic Clusters</h3>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              @for (theme of rep.topThemes; track theme.title) {
                <div class="p-4 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC] space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="px-2 py-0.5 rounded bg-[#E8F0FE] text-[#1A73E8] font-bold text-[11px]">
                      Theme
                    </span>
                  </div>
                  <h4 class="font-display font-bold text-sm text-[#1F1F1F]">
                    {{ theme.title }}
                  </h4>
                  <p class="text-xs text-[#444746] leading-relaxed">
                    {{ theme.description }}
                  </p>
                  @if (theme.questionExamples && theme.questionExamples.length > 0) {
                    <div class="pt-2 border-t border-[#E0E2EC]/70 space-y-1">
                      <span class="text-[10px] font-semibold text-[#747775] uppercase">Sample Inquiries:</span>
                      @for (sq of theme.questionExamples; track sq) {
                        <p class="text-[11px] text-[#1F1F1F] italic truncate">"{{ sq }}"</p>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Unresolved Friction Topics & 5 Actionable Speaker Follow-ups -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <!-- Unresolved / High-Friction Topics -->
            <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-3">
              <div class="flex items-center gap-2 pb-3 border-b border-[#E0E2EC]">
                <mat-icon class="text-[#F9AB00] text-base">help_center</mat-icon>
                <h3 class="font-display font-bold text-base text-[#1F1F1F]">Unresolved Audience Topics</h3>
              </div>
              <p class="text-xs text-[#747775]">
                Inquiries that lacked clear ground truth in the presentation or generated intense upvote velocity.
              </p>
              <ul class="space-y-2 text-xs">
                @for (item of rep.unresolvedTopics; track item.topic) {
                  <li class="p-3 rounded-xl bg-[#FEF7E0]/50 border border-[#FEEFC3] text-[#1F1F1F] space-y-1">
                    <div class="flex items-center gap-1.5 font-bold text-[#B06000]">
                      <mat-icon class="text-sm shrink-0">priority_high</mat-icon>
                      <span>{{ item.topic }}</span>
                    </div>
                    <p class="text-xs text-[#444746] pl-5 leading-relaxed">{{ item.significance }}</p>
                  </li>
                }
              </ul>
            </div>

            <!-- 5 Actionable Speaker Follow-ups -->
            <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-3">
              <div class="flex items-center gap-2 pb-3 border-b border-[#E0E2EC]">
                <mat-icon class="text-[#1E8E3E] text-base">checklist</mat-icon>
                <h3 class="font-display font-bold text-base text-[#1F1F1F]">Actionable Speaker Follow-ups</h3>
              </div>
              <p class="text-xs text-[#747775]">
                Recommended action items for blog posts, documentation updates, and engineering follow-ups.
              </p>
              <ol class="space-y-2 text-xs">
                @for (item of rep.actionableFollowUps; track item; let idx = $index) {
                  <li class="p-3 rounded-xl bg-[#E6F4EA]/40 border border-[#CEEAD6] text-[#1F1F1F] flex items-start gap-2.5">
                    <span class="w-5 h-5 rounded-full bg-[#1E8E3E] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {{ idx + 1 }}
                    </span>
                    <span class="leading-relaxed font-medium">{{ item }}</span>
                  </li>
                }
              </ol>
            </div>

          </div>

          <!-- Full Markdown Raw View -->
          <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-3">
            <div class="flex items-center justify-between pb-3 border-b border-[#E0E2EC]">
              <div class="flex items-center gap-2">
                <mat-icon class="text-[#747775] text-base">code</mat-icon>
                <h3 class="font-display font-bold text-sm text-[#1F1F1F]">Full Markdown Export</h3>
              </div>
            </div>
            <pre class="p-4 bg-[#F8F9FA] rounded-xl text-xs font-mono text-[#1F1F1F] overflow-x-auto whitespace-pre-wrap leading-relaxed border border-[#E0E2EC]">{{ rep.markdownReport }}</pre>
          </div>

        </div>
      } @else {
        <!-- Report Placeholder State -->
        <div class="bg-white rounded-2xl p-12 text-center border border-[#E0E2EC] shadow-xs">
          <div class="w-14 h-14 rounded-2xl bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center mx-auto mb-4">
            <mat-icon class="text-3xl">auto_awesome</mat-icon>
          </div>
          <h3 class="font-display font-bold text-xl text-[#1F1F1F] mb-2">
            Generate Post-Session Intelligence
          </h3>
          <p class="text-xs sm:text-sm text-[#747775] max-w-lg mx-auto mb-6 leading-relaxed">
            Run deep post-session analysis on all attendee questions, upvotes, and unanswered topics with Gemini 3.7 Flash, or export the raw session questions data.
          </p>
          <div class="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              (click)="generateReport()"
              [disabled]="isGenerating()"
              class="px-6 py-3 rounded-xl font-display font-semibold text-sm text-white bg-[#1A73E8] hover:bg-[#185ABC] disabled:opacity-50 transition-all cursor-pointer shadow-xs inline-flex items-center gap-2"
            >
              <mat-icon class="text-lg">rocket_launch</mat-icon>
              <span>Run Executive Analysis</span>
            </button>

            <button
              type="button"
              (click)="exportToCsv()"
              class="px-5 py-3 rounded-xl font-display font-semibold text-sm text-[#137333] bg-[#E6F4EA] hover:bg-[#CEEAD6] border border-[#CEEAD6] transition-all cursor-pointer shadow-xs inline-flex items-center gap-2"
            >
              <mat-icon class="text-lg">table_view</mat-icon>
              <span>Download Questions CSV</span>
            </button>
          </div>
        </div>
      }

    </div>
  `,
})
export class ExecutiveReport {
  public qaService = inject(QaService);
  public exporter = inject(ReportExporterService);
  public isGenerating = signal<boolean>(false);
  public report = signal<PostSessionReport | null>(null);

  public async generateReport(): Promise<void> {
    this.isGenerating.set(true);
    const rep = await this.qaService.generatePostSessionReport();
    this.report.set(rep);
    this.isGenerating.set(false);
    if (rep) {
      this.qaService.showToast('Executive report synthesized successfully!');
    }
  }

  public async exportToPdf(): Promise<void> {
    const session = this.qaService.currentSession();
    const rep = this.report();
    const questions = this.qaService.questions();

    await this.exporter.exportPdf(session, rep, questions);
    this.qaService.showToast('Executive report PDF generated and downloaded!');
  }

  public exportToCsv(): void {
    const session = this.qaService.currentSession();
    const rep = this.report();
    const questions = this.qaService.questions();

    this.exporter.exportCsv(session, rep, questions);
    this.qaService.showToast('Session insights CSV generated and downloaded!');
  }

  public copyReportMarkdown(): void {
    const rep = this.report();
    if (!rep) return;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(rep.markdownReport);
      this.qaService.showToast('Report copied to clipboard in Markdown format!');
    }
  }
}


