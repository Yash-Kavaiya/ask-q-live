import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';

@Component({
  selector: 'app-grounding-context',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      
      <!-- Grounding Header -->
      <div class="bg-white rounded-2xl p-5 border border-[#E0E2EC] shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center">
            <mat-icon class="text-xl">auto_stories</mat-icon>
          </div>
          <div>
            <h2 class="font-display font-bold text-lg text-[#1F1F1F]">Presentation Grounding Context</h2>
            <p class="text-xs text-[#747775]">
              Feed keynote slide transcripts, speaker notes, or product specs into Gemini context caching
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <input
            #fileInputGrounding
            type="file"
            (change)="onFileSelected($event)"
            accept=".txt,.md,.pdf,.docx,.doc,.pptx,.ppt,.json,.csv"
            class="hidden"
          />
          <button
            type="button"
            (click)="fileInputGrounding.click()"
            class="px-4 py-2.5 rounded-xl font-display font-semibold text-xs text-[#1A73E8] bg-[#E8F0FE] hover:bg-[#D2E3FC] transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <mat-icon class="text-base">upload_file</mat-icon>
            <span>Upload Document</span>
          </button>

          <button
            id="btn-save-grounding"
            type="button"
            (click)="saveContext()"
            [disabled]="isSaving() || isReadingFile()"
            class="px-5 py-2.5 rounded-xl font-display font-semibold text-xs text-white bg-[#1A73E8] hover:bg-[#185ABC] disabled:opacity-50 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            @if (isSaving()) {
              <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Saving Context...</span>
            } @else {
              <mat-icon class="text-base">save</mat-icon>
              <span>Save Grounding Context</span>
            }
          </button>
        </div>
      </div>

      <!-- Editor & Context Sandbox -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <!-- Left: Context Editor (7 cols) -->
        <div class="lg:col-span-7 bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-[#E0E2EC]">
            <h3 class="font-display font-bold text-sm text-[#1F1F1F]">Presentation Transcript &amp; Knowledge Base</h3>
            <span class="text-xs text-[#747775] font-mono">
              {{ contextControl.value?.length || 0 }} chars
            </span>
          </div>

          <!-- Drag and drop zone -->
          <button
            type="button"
            id="grounding-drop-zone"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onFileDrop($event)"
            (click)="fileInputGrounding.click()"
            [class.border-[#1A73E8]]="isDragging()"
            [class.bg-[#E8F0FE]/40]="isDragging()"
            class="w-full text-left relative p-3.5 rounded-xl border-2 border-dashed border-[#D2E3FC] bg-[#F8F9FA] hover:bg-[#F1F3F4] transition-all cursor-pointer group block"
          >
            @if (isReadingFile()) {
              <div class="flex items-center justify-center gap-2 py-1.5 text-xs text-[#1A73E8] font-medium">
                <span class="w-4 h-4 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin"></span>
                <span>Reading and extracting file contents...</span>
              </div>
            } @else if (uploadedFileName()) {
              <div class="flex items-center justify-between px-2 py-1 text-xs">
                <div class="flex items-center gap-2 text-[#1E8E3E] font-medium truncate">
                  <mat-icon class="text-base text-[#1E8E3E]">task</mat-icon>
                  <span class="truncate">Imported: {{ uploadedFileName() }}</span>
                  <span class="text-[11px] text-[#747775]">({{ uploadedFileSize() }})</span>
                </div>
                <span
                  (click)="removeUploadedFile($event)"
                  (keydown.enter)="removeUploadedFile($event)"
                  tabindex="0"
                  role="button"
                  class="p-1 text-[#747775] hover:text-[#D93025] rounded-full hover:bg-white inline-flex items-center justify-center"
                  title="Clear notice"
                >
                  <mat-icon class="text-sm">close</mat-icon>
                </span>
              </div>
            } @else {
              <div class="flex items-center justify-center gap-2 text-xs text-[#444746]">
                <mat-icon class="text-base text-[#1A73E8] group-hover:scale-110 transition-transform">cloud_upload</mat-icon>
                <span class="font-medium text-[#1F1F1F]">Drag &amp; drop slide deck notes</span> or click to upload (TXT, MD, PDF, DOCX, PPTX, JSON, CSV)
              </div>
            }
          </button>

          <p class="text-xs text-[#444746] leading-relaxed">
            Gemini Flash references this context cache to synthesize high-accuracy, 2-line answers for incoming audience inquiries.
          </p>

          <textarea
            id="textarea-grounding-context"
            [formControl]="contextControl"
            rows="12"
            placeholder="Paste speaker slides transcript, keynote outline, architecture diagrams notes, or FAQ items here..."
            class="w-full p-4 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white focus:ring-2 focus:ring-[#D2E3FC] rounded-xl text-xs sm:text-sm font-mono text-[#1F1F1F] outline-none resize-y leading-relaxed"
          ></textarea>

          <div class="flex items-center justify-between text-xs text-[#747775]">
            <span>Tip: Structured bullet points and numeric specs work best for zero hallucination.</span>
            <button
              type="button"
              (click)="loadDemoContext()"
              class="text-[#1A73E8] hover:underline font-semibold cursor-pointer"
            >
              Load Sample Keynote Notes
            </button>
          </div>
        </div>

        <!-- Right: Grounding Sandbox & Info (5 cols) -->
        <div class="lg:col-span-5 space-y-6">
          
          <div class="bg-white rounded-2xl p-6 border border-[#E0E2EC] shadow-xs space-y-4">
            <div class="flex items-center gap-2 pb-3 border-b border-[#E0E2EC]">
              <mat-icon class="text-[#1A73E8] text-base">science</mat-icon>
              <h3 class="font-display font-bold text-sm text-[#1F1F1F]">Grounding Architecture</h3>
            </div>

            <div class="space-y-3 text-xs text-[#444746]">
              <div class="p-3 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC] space-y-1">
                <strong class="text-[#1F1F1F] block">Zero Hallucination Constraint:</strong>
                <span>If a topic is unaddressed in the grounding context, Gemini explicitly reports incomplete confidence rather than fabricating specs.</span>
              </div>

              <div class="p-3 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC] space-y-1">
                <strong class="text-[#1F1F1F] block">Strict 2-Line Format:</strong>
                <span>Output strictly obeys JSON Schema with <code class="font-mono text-[#1A73E8]">line1</code> (direct declarative answer) and <code class="font-mono text-[#1A73E8]">line2</code> (contextual caveat).</span>
              </div>

              <div class="p-3 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC] space-y-1">
                <strong class="text-[#1F1F1F] block">Sub-Second Processing:</strong>
                <span>Leveraging <code class="font-mono text-[#1A73E8]">gemini-3.7-flash</code> enables processing during the attendee typing debounce window.</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  `,
})
export class GroundingContext {
  public qaService = inject(QaService);
  public isSaving = signal<boolean>(false);

  // File upload state
  public isDragging = signal<boolean>(false);
  public isReadingFile = signal<boolean>(false);
  public uploadedFileName = signal<string | null>(null);
  public uploadedFileSize = signal<string | null>(null);

  public contextControl = new FormControl(
    this.qaService.currentSession()?.contextData || '',
    [Validators.required]
  );

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
      this.processFile(file);
    }
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.processFile(file);
    }
  }

  public removeUploadedFile(event: Event): void {
    event.stopPropagation();
    this.uploadedFileName.set(null);
    this.uploadedFileSize.set(null);
  }

  private processFile(file: File): void {
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
          // keep raw string
        }
      }

      const existing = this.contextControl.value || '';
      const prefix = existing.trim() ? `${existing.trim()}\n\n--- Document: ${file.name} ---\n` : `--- Document: ${file.name} ---\n`;
      this.contextControl.setValue(prefix + content);

      this.isReadingFile.set(false);
      this.qaService.showToast(`Imported ${content.length} characters from ${file.name}`);
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

  public async saveContext(): Promise<void> {
    const val = this.contextControl.value || '';
    this.isSaving.set(true);
    await this.qaService.updateGroundingContext(val);
    this.isSaving.set(false);
  }

  public loadDemoContext(): void {
    const sample = `KEYNOTE OUTLINE: Google Cloud Multimodal AI & Real-Time Distributed Architecture 2026

Session Overview:
- Next-generation edge streaming with sub-50ms latency across 38 global regions.
- Gemini 2.5 and 3.0 series model matrix: Flash for real-time synthesis, Pro for deep multi-turn reasoning, Live API for bidirectional auditory streaming.
- Vector search with ScaNN index supports 100k queries/sec with recall > 99%.
- Data Governance: Zero customer data retention on enterprise inference endpoints; GDPR, HIPAA, SOC2 Type II certified.
- Cost Optimization: Dynamic context caching cuts repetitive prompt processing cost by up to 75%.
- Web Speech API integration provides zero-latency client TTS for confidence monitors.`;

    this.contextControl.setValue(sample);
  }
}

