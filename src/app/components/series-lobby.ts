import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { Segment, Question } from '../models/qa.models';

@Component({
  selector: 'app-series-lobby',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    @if (qaService.currentSeries(); as series) {
      <div id="series-lobby-container" class="space-y-6 max-w-7xl mx-auto pb-12 animate-fadeIn">

        <!-- ================= 1. LIVE STAGE HERO & COUNTDOWN BANNER ================= -->
        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white p-6 md:p-8 shadow-xl border border-indigo-800/40">
          <!-- Ambient Glow Effect -->
          <div class="absolute -right-16 -top-16 w-96 h-96 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none"></div>
          <div class="absolute left-1/3 -bottom-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
          <div class="absolute -left-10 top-1/2 w-60 h-60 rounded-full bg-purple-500/10 blur-3xl pointer-events-none"></div>

          <div class="relative z-10 space-y-6">
            <!-- Top Status Row -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div class="flex items-center gap-2.5 flex-wrap">
                @if (qaService.activeSegment(); as activeSeg) {
                  <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-xs">
                    <span class="relative flex h-2.5 w-2.5">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                    </span>
                    LIVE TALK ON STAGE
                  </span>
                } @else {
                  <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/40">
                    <mat-icon class="text-xs">timer</mat-icon> WORKSHOP INTERMISSION
                  </span>
                }

                <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono bg-white/10 border border-white/15 text-indigo-200">
                  <mat-icon class="text-xs text-indigo-300">tag</mat-icon>
                  <span>Room:</span>
                  <strong class="text-white font-bold tracking-wider">#{{ series.joinCode }}</strong>
                </span>

                <span class="text-xs text-indigo-300/90 font-medium flex items-center gap-1">
                  <mat-icon class="text-xs text-indigo-400">calendar_today</mat-icon>
                  {{ series.date }} • {{ series.timezone }}
                </span>
              </div>

              <!-- Top Action Quick Links -->
              <div class="flex items-center gap-2.5 flex-wrap">
                <button
                  id="btn-switch-feed"
                  type="button"
                  (click)="qaService.activeTab.set('feed')"
                  class="px-3.5 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Switch to live Q&A stream"
                >
                  <mat-icon class="text-sm text-indigo-300">question_answer</mat-icon>
                  <span>Live Q&amp;A Feed ({{ qaService.questions().length }})</span>
                </button>

                @if (qaService.isAdmin()) {
                  <button
                    id="btn-switch-control"
                    type="button"
                    (click)="qaService.activeTab.set('series-control')"
                    class="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/40 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <mat-icon class="text-sm">tune</mat-icon>
                    <span>Run of Show</span>
                  </button>
                }

                <button
                  id="btn-export-calendar"
                  type="button"
                  (click)="downloadSeriesCalendar()"
                  class="px-3 py-2 text-xs font-medium text-indigo-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                  title="Export Series Schedule to .ICS Calendar"
                >
                  <mat-icon class="text-xs">event</mat-icon>
                  <span>.ICS</span>
                </button>
              </div>
            </div>

            <!-- Middle Row: Active Speaker vs Next Speaker & Countdown Widget -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              
              <!-- Left / Main Stage Info (7 cols) -->
              <div class="lg:col-span-7 space-y-3.5">
                @if (qaService.activeSegment(); as activeSeg) {
                  <div>
                    <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <mat-icon class="text-base text-emerald-400">mic</mat-icon>
                      <span>Active Presentation (Talk #{{ activeSeg.order }})</span>
                    </div>
                    
                    <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
                      {{ activeSeg.title }}
                    </h1>
                    
                    <div class="flex items-center gap-3 text-sm text-indigo-200 mt-2.5 flex-wrap">
                      <div class="flex items-center gap-2">
                        @if (activeSeg.speakerAvatar) {
                          <img [src]="activeSeg.speakerAvatar" [alt]="activeSeg.speakerName" class="w-8 h-8 rounded-full object-cover border border-white/30" />
                        } @else {
                          <div class="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border border-white/20">
                            {{ activeSeg.speakerName.charAt(0) }}
                          </div>
                        }
                        <span class="font-bold text-white text-base">{{ activeSeg.speakerName }}</span>
                      </div>
                      
                      @if (activeSeg.speakerRole) {
                        <span class="text-indigo-300/60">•</span>
                        <span class="text-xs text-indigo-300 font-medium">{{ activeSeg.speakerRole }}</span>
                      }
                      @if (activeSeg.speakerOrg) {
                        <span class="text-indigo-300/60">•</span>
                        <span class="text-xs text-indigo-200 font-semibold bg-white/10 px-2 py-0.5 rounded-md">{{ activeSeg.speakerOrg }}</span>
                      }
                    </div>

                    @if (activeSeg.speakerBio) {
                      <p class="text-xs text-indigo-200/90 mt-2.5 line-clamp-2 leading-relaxed max-w-xl">
                        {{ activeSeg.speakerBio }}
                      </p>
                    }

                    <!-- Active talk quick actions -->
                    <div class="flex items-center gap-2.5 pt-2">
                      <button
                        type="button"
                        (click)="prepareQuestionForSpeaker(activeSeg)"
                        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <mat-icon class="text-xs">chat</mat-icon>
                        <span>Ask Active Speaker</span>
                      </button>

                      <button
                        type="button"
                        (click)="openSpeakerDetailModal(activeSeg)"
                        class="px-3 py-1.5 rounded-xl text-xs font-medium text-indigo-200 bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">account_circle</mat-icon>
                        <span>View Speaker Profile</span>
                      </button>
                    </div>
                  </div>
                } @else {
                  <div>
                    <div class="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <mat-icon class="text-sm text-indigo-400">hub</mat-icon>
                      <span>Workshop Series Agenda</span>
                    </div>
                    <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
                      {{ series.title }}
                    </h1>
                    <p class="text-xs text-indigo-200/90 mt-2 max-w-xl leading-relaxed">
                      {{ series.description || 'Welcome to the workshop series. Review the full timeline agenda below, explore upcoming speaker bios, and submit your inquiries ahead of each session.' }}
                    </p>

                    @if (getNextSegment(); as nextSeg) {
                      <div class="mt-3 p-3 rounded-xl bg-white/10 border border-white/15 max-w-lg flex items-center justify-between gap-3">
                        <div class="truncate">
                          <span class="text-[10px] text-amber-300 font-bold uppercase block">Next Talk Starting Soon</span>
                          <span class="text-xs text-white font-semibold truncate block">{{ nextSeg.speakerName }} — {{ nextSeg.title }}</span>
                        </div>
                        <button
                          type="button"
                          (click)="prepareQuestionForSpeaker(nextSeg)"
                          class="shrink-0 px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                        >
                          Ask Ahead
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Right: Real-time Countdown Timer Box (5 cols) -->
              <div class="lg:col-span-5 bg-white/5 border border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-md space-y-3.5">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <mat-icon class="text-base text-amber-400">timelapse</mat-icon>
                    @if (qaService.activeSegment()) {
                      <span>Stage Talk Clock</span>
                    } @else {
                      <span>Next Speaker Countdown</span>
                    }
                  </span>
                  
                  @if (isOvertime()) {
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                      OVERTIME
                    </span>
                  } @else {
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      LIVE TICKER
                    </span>
                  }
                </div>

                <!-- Digital Countdown Display -->
                <div class="flex items-baseline justify-between">
                  <div>
                    <div class="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                      {{ countdownFormatted() }}
                    </div>
                    <div class="text-[11px] text-indigo-200/80 mt-0.5">
                      {{ timerStatusLabel() }}
                    </div>
                  </div>

                  <!-- Mini Progress Radial/Gauge -->
                  <div class="text-right">
                    <div class="text-xs font-bold text-white">{{ talkProgressPercent() }}%</div>
                    <div class="text-[10px] text-indigo-300">Elapsed</div>
                  </div>
                </div>

                <!-- Linear Progress Bar -->
                <div class="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-1000"
                    [class.bg-emerald-400]="!isOvertime()"
                    [class.bg-rose-400]="isOvertime()"
                    [style.width.%]="talkProgressPercent()"
                  ></div>
                </div>

                <!-- Up Next Sneak Peek in Timer Box -->
                @if (getNextSegment(); as nextSeg) {
                  <div class="pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                    <div class="truncate mr-2">
                      <span class="text-[10px] text-indigo-300 font-bold uppercase block">UP NEXT ({{ nextSeg.startTime }})</span>
                      <span class="text-white font-medium truncate block">{{ nextSeg.speakerName }} • {{ nextSeg.title }}</span>
                    </div>
                    <button
                      type="button"
                      (click)="prepareQuestionForSpeaker(nextSeg)"
                      class="shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                    >
                      Ask Ahead
                    </button>
                  </div>
                }
              </div>
            </div>

            <!-- ================= HORIZONTAL STAGE STEPPER RIBBON ================= -->
            <div class="pt-4 border-t border-white/10 space-y-2.5">
              <div class="flex items-center justify-between text-xs text-indigo-300">
                <span class="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <mat-icon class="text-xs text-indigo-400">linear_scale</mat-icon>
                  <span>Interactive Schedule Scrubber</span>
                </span>
                <span>{{ qaService.segments().length }} Sessions Planned</span>
              </div>

              <!-- Horizontal Step Flow -->
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                @for (seg of qaService.segments(); track seg.id; let idx = $index) {
                  <button
                    type="button"
                    (click)="scrollToSegment(seg.id)"
                    class="p-3 rounded-2xl text-left border transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between"
                    [class.bg-emerald-500/20]="seg.status === 'LIVE'"
                    [class.border-emerald-400/60]="seg.status === 'LIVE'"
                    [class.ring-1]="seg.status === 'LIVE'"
                    [class.ring-emerald-400/40]="seg.status === 'LIVE'"
                    [class.bg-indigo-500/20]="selectedSegmentId() === seg.id && seg.status !== 'LIVE'"
                    [class.border-indigo-400/60]="selectedSegmentId() === seg.id && seg.status !== 'LIVE'"
                    [class.bg-white/5]="seg.status !== 'LIVE' && selectedSegmentId() !== seg.id"
                    [class.border-white/10]="seg.status !== 'LIVE' && selectedSegmentId() !== seg.id"
                  >
                    <div class="flex items-center justify-between text-[10px] w-full">
                      <span class="font-mono text-indigo-200">#{{ idx + 1 }} • {{ seg.startTime }}</span>
                      <span
                        class="font-bold uppercase text-[9px] px-1.5 py-0.5 rounded-full"
                        [class.bg-emerald-400]="seg.status === 'LIVE'"
                        [class.text-slate-950]="seg.status === 'LIVE'"
                        [class.bg-amber-400/20]="seg.status === 'GRACE_WINDOW'"
                        [class.text-amber-300]="seg.status === 'GRACE_WINDOW'"
                        [class.bg-white/10]="seg.status === 'SCHEDULED'"
                        [class.text-indigo-200]="seg.status === 'SCHEDULED'"
                        [class.bg-slate-700]="seg.status === 'ENDED'"
                        [class.text-slate-400]="seg.status === 'ENDED'"
                      >
                        {{ seg.status === 'LIVE' ? 'LIVE' : seg.status === 'ENDED' ? 'DONE' : 'SOON' }}
                      </span>
                    </div>

                    <div class="mt-1.5">
                      <div class="font-bold text-xs text-white truncate group-hover:text-indigo-200 transition-colors">
                        {{ seg.speakerName }}
                      </div>
                      <div class="text-[10px] text-indigo-300/80 truncate mt-0.5">
                        {{ seg.title }}
                      </div>
                    </div>
                  </button>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- ================= 2. TWO-COLUMN MAIN CONTENT (AGENDA & GLOBAL COMPOSER) ================= -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          <!-- Left Column: Visually Rich Timeline Agenda View (7 or 8 cols depending on view) -->
          <div class="lg:col-span-7 xl:col-span-8 space-y-4">
            
            <!-- Controls & Toolbar -->
            <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                <div>
                  <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <mat-icon class="text-indigo-600">event_note</mat-icon>
                    <span>Series Timeline Agenda</span>
                  </h2>
                  <p class="text-xs text-slate-500 mt-0.5">
                    Browse all speaker sessions, read biographies, and view detailed discussion scopes
                  </p>
                </div>

                <!-- View Mode Selector -->
                <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs">
                  <button
                    type="button"
                    (click)="viewMode.set('TIMELINE')"
                    class="px-2.5 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                    [class.bg-white]="viewMode() === 'TIMELINE'"
                    [class.text-indigo-600]="viewMode() === 'TIMELINE'"
                    [class.shadow-xs]="viewMode() === 'TIMELINE'"
                    [class.text-slate-600]="viewMode() !== 'TIMELINE'"
                    title="Vertical connected chronological timeline"
                  >
                    <mat-icon class="text-sm">timeline</mat-icon>
                    <span>Timeline</span>
                  </button>

                  <button
                    type="button"
                    (click)="viewMode.set('GRID')"
                    class="px-2.5 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                    [class.bg-white]="viewMode() === 'GRID'"
                    [class.text-indigo-600]="viewMode() === 'GRID'"
                    [class.shadow-xs]="viewMode() === 'GRID'"
                    [class.text-slate-600]="viewMode() !== 'GRID'"
                    title="Bento speaker cards grid"
                  >
                    <mat-icon class="text-sm">grid_view</mat-icon>
                    <span>Speakers</span>
                  </button>

                  <button
                    type="button"
                    (click)="viewMode.set('COMPACT')"
                    class="px-2.5 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                    [class.bg-white]="viewMode() === 'COMPACT'"
                    [class.text-indigo-600]="viewMode() === 'COMPACT'"
                    [class.shadow-xs]="viewMode() === 'COMPACT'"
                    [class.text-slate-600]="viewMode() !== 'COMPACT'"
                    title="Compact schedule table view"
                  >
                    <mat-icon class="text-sm">view_list</mat-icon>
                    <span>Compact</span>
                  </button>
                </div>
              </div>

              <!-- ================= OVERALL SCHEDULE PROGRESS TRACKER BAR ================= -->
              @if (overallScheduleStats(); as stats) {
                <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-slate-800 flex items-center gap-1.5">
                        <mat-icon class="text-sm text-indigo-600">schedule</mat-icon>
                        Overall Schedule Progress:
                      </span>
                      <span class="text-slate-600 font-medium">
                        {{ stats.statusSummary }}
                      </span>
                      <span class="text-slate-400">•</span>
                      <span class="text-slate-500 font-mono text-[11px]">
                        {{ stats.elapsedMinutes }}m / {{ stats.totalMinutes }}m elapsed ({{ stats.totalHoursFormatted }} total)
                      </span>
                    </div>

                    <!-- Progress Percentage Badge -->
                    <div class="flex items-center gap-2">
                      @if (qaService.activeSegment(); as activeSeg) {
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          LIVE: Talk #{{ activeSeg.order }}
                        </span>
                      }
                      <span class="font-mono font-bold text-xs px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {{ stats.percent }}% Complete
                      </span>
                    </div>
                  </div>

                  <!-- Visual Multi-Segment Proportional Progress Bar -->
                  <div class="w-full h-3.5 bg-slate-200 rounded-full overflow-hidden p-0.5 flex gap-1 shadow-inner">
                    @for (seg of qaService.segments(); track seg.id; let idx = $index) {
                      <button
                        type="button"
                        (click)="scrollToSegment(seg.id)"
                        class="h-full rounded-full transition-all duration-500 cursor-pointer relative group flex items-center justify-center overflow-hidden border-0 p-0"
                        [style.flex]="seg.scheduledDurationMinutes || 45"
                        [class.bg-indigo-600]="seg.status === 'ENDED'"
                        [class.bg-emerald-500]="seg.status === 'LIVE'"
                        [class.ring-2]="seg.status === 'LIVE'"
                        [class.ring-emerald-300]="seg.status === 'LIVE'"
                        [class.bg-amber-400]="seg.status === 'GRACE_WINDOW'"
                        [class.bg-slate-300]="seg.status === 'SCHEDULED'"
                        [title]="'Talk #' + (idx + 1) + ': ' + seg.speakerName + ' (' + (seg.status === 'LIVE' ? 'LIVE NOW' : seg.status) + ')'"
                      >
                        <!-- Live fill animation for active segment -->
                        @if (seg.status === 'LIVE') {
                          <div
                            class="absolute inset-0 bg-emerald-400 opacity-90 transition-all duration-1000"
                            [style.width.%]="talkProgressPercent()"
                          ></div>
                          <span class="relative z-10 text-[8px] font-extrabold text-white tracking-wider animate-pulse">LIVE</span>
                        } @else if (seg.status === 'ENDED') {
                          <mat-icon class="text-[9px] text-white/90">check</mat-icon>
                        } @else {
                          <span class="text-[8px] font-mono text-slate-600 font-bold">#{{ idx + 1 }}</span>
                        }
                      </button>
                    }
                  </div>

                  <!-- Quick Talk Segment Chips Legend -->
                  <div class="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 text-[11px] scrollbar-none">
                    @for (seg of qaService.segments(); track seg.id; let idx = $index) {
                      <button
                        type="button"
                        (click)="scrollToSegment(seg.id)"
                        class="px-2 py-1 rounded-lg border text-left whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                        [class.bg-emerald-50]="seg.status === 'LIVE'"
                        [class.border-emerald-300]="seg.status === 'LIVE'"
                        [class.text-emerald-900]="seg.status === 'LIVE'"
                        [class.font-bold]="seg.status === 'LIVE'"
                        [class.bg-indigo-50]="seg.status === 'ENDED'"
                        [class.border-indigo-200]="seg.status === 'ENDED'"
                        [class.text-indigo-800]="seg.status === 'ENDED'"
                        [class.bg-white]="seg.status === 'SCHEDULED'"
                        [class.border-slate-200]="seg.status === 'SCHEDULED'"
                        [class.text-slate-600]="seg.status === 'SCHEDULED'"
                      >
                        @if (seg.status === 'LIVE') {
                          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        } @else if (seg.status === 'ENDED') {
                          <mat-icon class="text-xs text-indigo-600">check_circle</mat-icon>
                        } @else {
                          <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        }
                        <span>#{{ idx + 1 }} {{ seg.speakerName }}</span>
                        <span class="font-mono text-[10px] text-slate-400">({{ seg.startTime }})</span>
                      </button>
                    }
                  </div>
                </div>
              }

              <!-- Filter Tabs & Search Bar -->
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
                <!-- Search Input -->
                <div class="sm:col-span-6 relative">
                  <mat-icon class="absolute left-3 top-2.5 text-slate-400 text-sm">search</mat-icon>
                  <input
                    type="text"
                    [value]="agendaSearch()"
                    (input)="onSearchChange($event)"
                    placeholder="Search speakers, talks, topics..."
                    class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-800 outline-none transition-all"
                  />
                  @if (agendaSearch()) {
                    <button
                      type="button"
                      (click)="agendaSearch.set('')"
                      class="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      <mat-icon class="text-sm">close</mat-icon>
                    </button>
                  }
                </div>

                <!-- Status / Type Filter Pills -->
                <div class="sm:col-span-6 flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  <button
                    type="button"
                    (click)="agendaFilter.set('ALL')"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer"
                    [class.bg-indigo-600]="agendaFilter() === 'ALL'"
                    [class.text-white]="agendaFilter() === 'ALL'"
                    [class.bg-slate-100]="agendaFilter() !== 'ALL'"
                    [class.text-slate-600]="agendaFilter() !== 'ALL'"
                  >
                    All ({{ qaService.segments().length }})
                  </button>

                  <button
                    type="button"
                    (click)="agendaFilter.set('LIVE')"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1"
                    [class.bg-emerald-600]="agendaFilter() === 'LIVE'"
                    [class.text-white]="agendaFilter() === 'LIVE'"
                    [class.bg-slate-100]="agendaFilter() !== 'LIVE'"
                    [class.text-slate-600]="agendaFilter() !== 'LIVE'"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Live Now
                  </button>

                  <button
                    type="button"
                    (click)="agendaFilter.set('TALK')"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer"
                    [class.bg-indigo-600]="agendaFilter() === 'TALK'"
                    [class.text-white]="agendaFilter() === 'TALK'"
                    [class.bg-slate-100]="agendaFilter() !== 'TALK'"
                    [class.text-slate-600]="agendaFilter() !== 'TALK'"
                  >
                    Talks
                  </button>

                  <button
                    type="button"
                    (click)="agendaFilter.set('PANEL')"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer"
                    [class.bg-indigo-600]="agendaFilter() === 'PANEL'"
                    [class.text-white]="agendaFilter() === 'PANEL'"
                    [class.bg-slate-100]="agendaFilter() !== 'PANEL'"
                    [class.text-slate-600]="agendaFilter() !== 'PANEL'"
                  >
                    Panels
                  </button>

                  <button
                    type="button"
                    (click)="agendaFilter.set('BOOKMARKED')"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1"
                    [class.bg-amber-500]="agendaFilter() === 'BOOKMARKED'"
                    [class.text-white]="agendaFilter() === 'BOOKMARKED'"
                    [class.bg-slate-100]="agendaFilter() !== 'BOOKMARKED'"
                    [class.text-slate-600]="agendaFilter() !== 'BOOKMARKED'"
                  >
                    <mat-icon class="text-xs">bookmark</mat-icon>
                    Saved ({{ bookmarkedSegmentIds().size }})
                  </button>
                </div>
              </div>
            </div>

            <!-- ================= VIEW MODE 1: VERTICAL CONNECTED TIMELINE ================= -->
            @if (viewMode() === 'TIMELINE') {
              <div class="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-4 before:bottom-4 before:w-1 before:bg-slate-200">
                @for (seg of filteredSegments(); track seg.id; let idx = $index) {
                  <div
                    [id]="'timeline-node-' + seg.id"
                    class="relative transition-all duration-300"
                  >
                    <!-- Timeline Node Icon / Dot with Pulse Ring for Active Talk -->
                    <div
                      class="absolute -left-6 sm:-left-8 top-4 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all shadow-xs z-10"
                      [class.bg-emerald-500]="seg.status === 'LIVE'"
                      [class.border-emerald-200]="seg.status === 'LIVE'"
                      [class.text-white]="seg.status === 'LIVE'"
                      [class.ring-4]="seg.status === 'LIVE'"
                      [class.ring-emerald-400/30]="seg.status === 'LIVE'"
                      [class.bg-indigo-600]="seg.status === 'SCHEDULED'"
                      [class.border-indigo-200]="seg.status === 'SCHEDULED'"
                      [class.text-white]="seg.status === 'SCHEDULED'"
                      [class.bg-slate-200]="seg.status === 'ENDED'"
                      [class.border-slate-300]="seg.status === 'ENDED'"
                      [class.text-slate-600]="seg.status === 'ENDED'"
                    >
                      @if (seg.status === 'LIVE') {
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                        <mat-icon class="text-xs sm:text-sm animate-pulse relative z-10">mic</mat-icon>
                      } @else if (seg.status === 'ENDED') {
                        <mat-icon class="text-xs sm:text-sm">check</mat-icon>
                      } @else {
                        <span class="text-[10px] sm:text-xs">{{ seg.order }}</span>
                      }
                    </div>

                    <!-- Timeline Content Card -->
                    <div
                      class="rounded-2xl border transition-all overflow-hidden bg-white shadow-xs hover:shadow-md"
                      [class.border-emerald-500]="seg.status === 'LIVE'"
                      [class.ring-2]="seg.status === 'LIVE'"
                      [class.ring-emerald-500/25]="seg.status === 'LIVE'"
                      [class.border-indigo-400]="selectedSegmentId() === seg.id && seg.status !== 'LIVE'"
                      [class.border-slate-200]="seg.status !== 'LIVE' && selectedSegmentId() !== seg.id"
                    >
                      <!-- ================= LIVE SESSION PROGRESS BANNER (ONLY ON ACTIVE TALK) ================= -->
                      @if (seg.status === 'LIVE') {
                        @let prog = getActiveSegmentProgress(seg);
                        <div class="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 text-white p-3.5 sm:px-5 space-y-2">
                          <div class="flex items-center justify-between gap-2 flex-wrap">
                            <div class="flex items-center gap-2">
                              <span class="relative flex h-2.5 w-2.5">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-90"></span>
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                              </span>
                              <span class="text-xs font-extrabold uppercase tracking-wider text-white">
                                CURRENTLY LIVE ON STAGE • TALK #{{ seg.order }}
                              </span>
                            </div>

                            <!-- Live time status label -->
                            <div class="flex items-center gap-2 text-xs font-mono font-bold">
                              @if (prog.isOvertime) {
                                <span class="px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-200 border border-rose-400/40 text-[10px] animate-pulse">
                                  OVERTIME ({{ prog.elapsedFormatted }})
                                </span>
                              } @else {
                                <span class="px-2 py-0.5 rounded-md bg-white/20 text-white text-[11px]">
                                  {{ prog.elapsedFormatted }} / {{ prog.totalFormatted }} mins ({{ prog.percent }}%)
                                </span>
                              }
                            </div>
                          </div>

                          <!-- Live Linear Progress Bar -->
                          <div class="w-full bg-black/20 rounded-full h-2 overflow-hidden">
                            <div
                              class="h-full rounded-full transition-all duration-1000"
                              [class.bg-white]="!prog.isOvertime"
                              [class.bg-rose-300]="prog.isOvertime"
                              [style.width.%]="prog.percent"
                            ></div>
                          </div>
                        </div>
                      }

                      <div class="p-5 space-y-3.5">
                        
                        <!-- Top Metadata Row -->
                        <div class="flex items-start justify-between gap-3 flex-wrap">
                          <div class="flex items-center gap-2 flex-wrap">
                            <!-- Time Badge -->
                            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                              <mat-icon class="text-xs text-slate-500">schedule</mat-icon>
                              {{ seg.startTime }} ({{ seg.scheduledDurationMinutes }} mins)
                            </span>

                            <!-- Status Badge -->
                            <span
                              class="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px]"
                              [class.bg-emerald-100]="seg.status === 'LIVE'"
                              [class.text-emerald-800]="seg.status === 'LIVE'"
                              [class.bg-slate-100]="seg.status === 'SCHEDULED'"
                              [class.text-slate-600]="seg.status === 'SCHEDULED'"
                              [class.bg-slate-200]="seg.status === 'ENDED'"
                              [class.text-slate-700]="seg.status === 'ENDED'"
                              [class.bg-amber-100]="seg.status === 'GRACE_WINDOW'"
                              [class.text-amber-800]="seg.status === 'GRACE_WINDOW'"
                            >
                              {{ seg.status === 'LIVE' ? '🟢 LIVE ON STAGE' : seg.status === 'ENDED' ? 'COMPLETED' : seg.status === 'GRACE_WINDOW' ? 'WRAP UP' : 'UPCOMING' }}
                            </span>

                            <!-- Type Badge -->
                            <span class="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {{ seg.type }}
                            </span>
                          </div>

                          <!-- Action Tools (Bookmark & Question Count) -->
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              (click)="toggleBookmark(seg.id)"
                              class="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 transition-colors cursor-pointer"
                              [class.text-amber-500]="isBookmarked(seg.id)"
                              title="Bookmark this session"
                            >
                              <mat-icon class="text-base">{{ isBookmarked(seg.id) ? 'bookmark' : 'bookmark_border' }}</mat-icon>
                            </button>

                            <button
                              type="button"
                              (click)="filterFeedToSegment(seg.id)"
                              class="px-2.5 py-1 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-colors flex items-center gap-1 cursor-pointer"
                              title="View questions submitted for this talk"
                            >
                              <mat-icon class="text-xs">question_answer</mat-icon>
                              <span>{{ getSegmentQuestionCount(seg.id) }} Questions</span>
                            </button>
                          </div>
                        </div>

                        <!-- Session Title & Abstract -->
                        <div>
                          <h3 class="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                            {{ seg.title }}
                          </h3>

                          @if (seg.topicSummary) {
                            <p class="text-xs text-slate-600 mt-1.5 leading-relaxed">
                              {{ seg.topicSummary }}
                            </p>
                          }
                        </div>

                        <!-- Speaker Info Row with Avatar -->
                        <div class="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 flex-wrap">
                          <div class="flex items-center gap-2.5">
                            @if (seg.speakerAvatar) {
                              <img [src]="seg.speakerAvatar" [alt]="seg.speakerName" class="w-8 h-8 rounded-full object-cover border border-slate-200" />
                            } @else {
                              <div class="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                                {{ seg.speakerName.charAt(0) }}
                              </div>
                            }

                            <div>
                              <div class="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                <span>{{ seg.speakerName }}</span>
                                @if (seg.speakerOrg) {
                                  <span class="text-slate-300">•</span>
                                  <span class="text-indigo-600 font-medium text-[11px]">{{ seg.speakerOrg }}</span>
                                }
                              </div>
                              @if (seg.speakerRole) {
                                <div class="text-[11px] text-slate-500 font-normal">{{ seg.speakerRole }}</div>
                              }
                            </div>
                          </div>

                          <!-- Speaker Details Button -->
                          <button
                            type="button"
                            (click)="openSpeakerDetailModal(seg)"
                            class="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/80 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <mat-icon class="text-xs">account_box</mat-icon>
                            <span>Speaker Bio</span>
                          </button>
                        </div>

                        <!-- Categories / Topic Tags -->
                        @if (seg.categories && seg.categories.length > 0) {
                          <div class="flex items-center gap-1.5 flex-wrap pt-1">
                            @for (cat of seg.categories; track cat) {
                              <button
                                type="button"
                                (click)="selectTopicTag(cat)"
                                class="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors cursor-pointer"
                              >
                                #{{ cat }}
                              </button>
                            }
                          </div>
                        }

                        <!-- Collapsible Deep Bio & Grounding Notes -->
                        @if (expandedSegmentId() === seg.id) {
                          <div class="pt-3.5 border-t border-slate-100 text-xs space-y-3 animate-fadeIn">
                            @if (seg.speakerBio) {
                              <div>
                                <strong class="text-slate-800 block text-[11px] uppercase tracking-wider mb-1">Speaker Biography</strong>
                                <p class="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                                  {{ seg.speakerBio }}
                                </p>
                              </div>
                            }

                            @if (seg.groundingContext) {
                              <div class="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100">
                                <strong class="text-indigo-800 block text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <mat-icon class="text-xs text-indigo-600">auto_awesome</mat-icon> AI Grounding &amp; Key Discussion Scope
                                </strong>
                                <p class="text-[11px] text-slate-700 font-mono line-clamp-4 leading-relaxed">
                                  {{ seg.groundingContext }}
                                </p>
                              </div>
                            }
                          </div>
                        }

                        <!-- Card Action Footer -->
                        <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <button
                            type="button"
                            (click)="toggleExpandSegment(seg.id)"
                            class="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>{{ expandedSegmentId() === seg.id ? 'Hide Details' : 'View Session Notes & Grounding' }}</span>
                            <mat-icon class="text-sm">{{ expandedSegmentId() === seg.id ? 'expand_less' : 'expand_more' }}</mat-icon>
                          </button>

                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              (click)="prepareQuestionForSpeaker(seg)"
                              class="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                            >
                              <mat-icon class="text-xs">chat</mat-icon>
                              <span>Ask Ahead</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- ================= VIEW MODE 2: BENTO SPEAKER CARDS GRID ================= -->
            @if (viewMode() === 'GRID') {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                @for (seg of filteredSegments(); track seg.id) {
                  <div
                    class="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                    [class.border-emerald-500]="seg.status === 'LIVE'"
                    [class.ring-2]="seg.status === 'LIVE'"
                    [class.ring-emerald-500/20]="seg.status === 'LIVE'"
                  >
                    <!-- Active talk live header in grid -->
                    @if (seg.status === 'LIVE') {
                      @let prog = getActiveSegmentProgress(seg);
                      <div class="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-3 space-y-1.5">
                        <div class="flex items-center justify-between text-[11px] font-bold">
                          <span class="flex items-center gap-1.5 uppercase tracking-wider">
                            <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
                            LIVE ON STAGE
                          </span>
                          <span class="font-mono">
                            {{ prog.elapsedFormatted }} / {{ prog.totalFormatted }}m
                          </span>
                        </div>
                        <div class="w-full bg-black/20 rounded-full h-1.5 overflow-hidden">
                          <div class="h-full bg-white rounded-full transition-all duration-1000" [style.width.%]="prog.percent"></div>
                        </div>
                      </div>
                    }

                    <div class="p-5 space-y-3">
                      <!-- Card Header -->
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2.5">
                          @if (seg.speakerAvatar) {
                            <img [src]="seg.speakerAvatar" [alt]="seg.speakerName" class="w-11 h-11 rounded-full object-cover border border-slate-200" />
                          } @else {
                            <div class="w-11 h-11 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                              {{ seg.speakerName.charAt(0) }}
                            </div>
                          }

                          <div>
                            <h3 class="text-sm font-bold text-slate-900 leading-snug">{{ seg.speakerName }}</h3>
                            <div class="text-xs text-slate-500">{{ seg.speakerRole || 'Keynote Presenter' }}</div>
                            @if (seg.speakerOrg) {
                              <div class="text-[11px] text-indigo-600 font-semibold">{{ seg.speakerOrg }}</div>
                            }
                          </div>
                        </div>

                        <span
                          class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                          [class.bg-emerald-100]="seg.status === 'LIVE'"
                          [class.text-emerald-800]="seg.status === 'LIVE'"
                          [class.bg-slate-100]="seg.status !== 'LIVE'"
                          [class.text-slate-600]="seg.status !== 'LIVE'"
                        >
                          {{ seg.status === 'LIVE' ? 'LIVE NOW' : seg.startTime }}
                        </span>
                      </div>

                      <!-- Talk info -->
                      <div>
                        <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Talk #{{ seg.order }} • {{ seg.scheduledDurationMinutes }}m</span>
                        <h4 class="text-sm font-bold text-slate-900 mt-0.5 leading-snug">{{ seg.title }}</h4>
                        @if (seg.speakerBio) {
                          <p class="text-xs text-slate-600 mt-1.5 line-clamp-3 leading-relaxed">
                            {{ seg.speakerBio }}
                          </p>
                        }
                      </div>
                    </div>

                    <!-- Footer Action -->
                    <div class="p-4 pt-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <button
                        type="button"
                        (click)="openSpeakerDetailModal(seg)"
                        class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1"
                      >
                        <span>Full Profile</span>
                        <mat-icon class="text-xs">arrow_forward</mat-icon>
                      </button>

                      <button
                        type="button"
                        (click)="prepareQuestionForSpeaker(seg)"
                        class="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">chat</mat-icon>
                        <span>Ask Speaker</span>
                      </button>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- ================= VIEW MODE 3: COMPACT SCHEDULE TABLE ================= -->
            @if (viewMode() === 'COMPACT') {
              <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div class="divide-y divide-slate-100">
                  @for (seg of filteredSegments(); track seg.id; let idx = $index) {
                    <div
                      class="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors relative"
                      [class.bg-emerald-50/40]="seg.status === 'LIVE'"
                      [class.border-l-4]="seg.status === 'LIVE'"
                      [class.border-l-emerald-500]="seg.status === 'LIVE'"
                    >
                      <div class="flex items-center gap-3 min-w-0">
                        <span
                          class="w-7 h-7 rounded-lg font-mono font-bold text-xs flex items-center justify-center shrink-0"
                          [class.bg-emerald-600]="seg.status === 'LIVE'"
                          [class.text-white]="seg.status === 'LIVE'"
                          [class.bg-slate-100]="seg.status !== 'LIVE'"
                          [class.text-slate-700]="seg.status !== 'LIVE'"
                        >
                          #{{ seg.order }}
                        </span>

                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-mono text-xs font-bold text-indigo-600">{{ seg.startTime }}</span>
                            <span class="text-xs text-slate-300">•</span>
                            <span class="font-bold text-xs text-slate-900 truncate">{{ seg.title }}</span>
                            @if (seg.status === 'LIVE') {
                              @let prog = getActiveSegmentProgress(seg);
                              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                LIVE ({{ prog.percent }}%)
                              </span>
                            }
                          </div>
                          <div class="text-xs text-slate-500 truncate mt-0.5">
                            {{ seg.speakerName }} @if (seg.speakerOrg) { ({{ seg.speakerOrg }}) }
                          </div>
                        </div>
                      </div>

                      <div class="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          (click)="openSpeakerDetailModal(seg)"
                          class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                          title="View bio"
                        >
                          <mat-icon class="text-sm">info</mat-icon>
                        </button>

                        <button
                          type="button"
                          (click)="prepareQuestionForSpeaker(seg)"
                          class="px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                        >
                          Ask
                        </button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            @if (filteredSegments().length === 0) {
              <div class="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2">
                <mat-icon class="text-3xl text-slate-300">search_off</mat-icon>
                <h3 class="text-sm font-bold text-slate-700">No sessions match your filter</h3>
                <p class="text-xs text-slate-500">Try adjusting your search keywords or switching filter tabs</p>
                <button
                  type="button"
                  (click)="resetFilters()"
                  class="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            }
          </div>

          <!-- Right Column: Global Workshop Question Composer (5 cols / 4 cols on xl) -->
          <div class="lg:col-span-5 xl:col-span-4 space-y-4">
            
            <div class="bg-white rounded-2xl p-5 md:p-6 border border-slate-200 shadow-xs space-y-5 sticky top-20">
              
              <!-- Composer Header -->
              <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <mat-icon class="text-lg">forum</mat-icon>
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-slate-900">Ask Workshop Speakers</h3>
                    <p class="text-[11px] text-slate-500">Target any talk or ask the global panel</p>
                  </div>
                </div>

                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  AI 2-Line Ready
                </span>
              </div>

              <!-- Question Form -->
              <form [formGroup]="questionForm" (ngSubmit)="onQuestionSubmit()" class="space-y-4">
                
                <!-- Target Recipient Dropdown -->
                <div>
                  <label for="lobby-target-speaker" class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Direct Question To *
                  </label>
                  <select
                    id="lobby-target-speaker"
                    formControlName="targetSegmentId"
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs font-semibold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="GLOBAL">🌐 General Workshop Inquiries &amp; All Speakers</option>
                    @for (seg of qaService.segments(); track seg.id) {
                      <option [value]="seg.id">
                        Talk {{ seg.order }}: {{ seg.speakerName }} — {{ seg.title }} ({{ seg.status === 'LIVE' ? '🟢 LIVE' : seg.status }})
                      </option>
                    }
                  </select>
                </div>

                <!-- Topic Category Selection Chips -->
                <div>
                  <span class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Topic Category
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    @for (cat of availableCategories(); track cat) {
                      <button
                        type="button"
                        (click)="selectCategory(cat)"
                        class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                        [class.bg-indigo-600]="questionForm.get('category')?.value === cat"
                        [class.text-white]="questionForm.get('category')?.value === cat"
                        [class.shadow-xs]="questionForm.get('category')?.value === cat"
                        [class.bg-slate-100]="questionForm.get('category')?.value !== cat"
                        [class.text-slate-600]="questionForm.get('category')?.value !== cat"
                      >
                        {{ cat }}
                      </button>
                    }
                  </div>
                </div>

                <!-- Question Text Input -->
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label for="lobby-question-text" class="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Your In-Depth Question *
                    </label>
                    <span class="text-[11px] text-slate-400 font-mono">
                      {{ questionForm.get('content')?.value?.length || 0 }}/500
                    </span>
                  </div>

                  <textarea
                    id="lobby-question-text"
                    formControlName="content"
                    rows="3"
                    placeholder="e.g. How will the new edge-caching layer impact cold-start latency for microVM workers?"
                    class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs text-slate-900 outline-none leading-relaxed"
                    maxlength="500"
                  ></textarea>
                </div>

                <!-- Author Identity & Anonymous Checkbox -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label for="lobby-author-name" class="block text-[11px] font-semibold text-slate-600 mb-1">
                      Your Name / Handle (Optional)
                    </label>
                    <input
                      id="lobby-author-name"
                      type="text"
                      formControlName="authorName"
                      placeholder="e.g. Maya Lin"
                      class="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-indigo-600 focus:bg-white rounded-xl text-xs outline-none"
                      maxlength="50"
                    />
                  </div>

                  <div class="pt-2 sm:pt-4">
                    <label class="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium">
                      <input
                        type="checkbox"
                        formControlName="isAnonymous"
                        class="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                      />
                      <span>Post as Anonymous</span>
                    </label>
                  </div>
                </div>

                <!-- Submit Button -->
                <div class="pt-2">
                  <button
                    id="btn-submit-lobby-question"
                    type="submit"
                    [disabled]="questionForm.invalid || isSubmitting()"
                    class="w-full py-2.5 px-4 rounded-xl font-display font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    @if (isSubmitting()) {
                      <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Synthesizing AI Answer &amp; Submitting...</span>
                    } @else {
                      <mat-icon class="text-sm">send</mat-icon>
                      <span>Submit Inquiries to Live Stage</span>
                    }
                  </button>
                </div>
              </form>

              <!-- Quick Helper Tip -->
              <div class="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-start gap-2.5 text-xs text-indigo-900">
                <mat-icon class="text-indigo-600 text-base shrink-0 mt-0.5">lightbulb</mat-icon>
                <div class="leading-relaxed text-[11px]">
                  <strong>Targeted Routing:</strong> Questions submitted ahead for future talks will be queued and ready on the presenter's teleprompter the second they take the stage!
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= 3. PARTICIPATING AUDIENCE STATS & FEED PREVIEW ================= -->
        <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <mat-icon class="text-xl">groups</mat-icon>
            </div>
            <div>
              <h4 class="text-sm font-bold text-slate-900">Workshop Live Audience</h4>
              <p class="text-xs text-slate-500">Connected across all {{ series.segments.length }} talks via single join code</p>
            </div>
          </div>

          <div class="flex items-center gap-4 text-xs font-semibold">
            <div class="flex items-center gap-1 text-slate-700">
              <mat-icon class="text-indigo-600 text-sm">question_answer</mat-icon>
              <span>{{ qaService.questions().length }} Total Questions</span>
            </div>

            <div class="flex items-center gap-1 text-slate-700">
              <mat-icon class="text-emerald-600 text-sm">thumb_up</mat-icon>
              <span>{{ getTotalUpvotes() }} Upvotes Cast</span>
            </div>

            <button
              type="button"
              (click)="qaService.activeTab.set('feed')"
              class="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Open Live Feed</span>
              <mat-icon class="text-sm">arrow_forward</mat-icon>
            </button>
          </div>
        </div>

        <!-- ================= 4. SPEAKER DETAIL MODAL / SPOTLIGHT DIALOG ================= -->
        @if (selectedSpeakerModal(); as speakerSeg) {
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
            <div class="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 space-y-5 p-6 md:p-7 relative">
              
              <!-- Close Button -->
              <button
                type="button"
                (click)="closeSpeakerModal()"
                class="absolute right-5 top-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <mat-icon class="text-lg">close</mat-icon>
              </button>

              <!-- Speaker Header -->
              <div class="flex items-start gap-4">
                @if (speakerSeg.speakerAvatar) {
                  <img [src]="speakerSeg.speakerAvatar" [alt]="speakerSeg.speakerName" class="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-100 shadow-sm" />
                } @else {
                  <div class="w-16 h-16 rounded-2xl bg-indigo-600 text-white font-bold text-2xl flex items-center justify-center shadow-sm">
                    {{ speakerSeg.speakerName.charAt(0) }}
                  </div>
                }

                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 uppercase">Talk #{{ speakerSeg.order }}</span>
                    <span class="text-xs font-mono text-slate-500">{{ speakerSeg.startTime }} ({{ speakerSeg.scheduledDurationMinutes }}m)</span>
                  </div>
                  <h3 class="text-xl font-extrabold text-slate-900 leading-tight">{{ speakerSeg.speakerName }}</h3>
                  <div class="text-xs text-slate-600 font-medium">
                    {{ speakerSeg.speakerRole || 'Speaker' }} @if (speakerSeg.speakerOrg) { • <strong class="text-indigo-600">{{ speakerSeg.speakerOrg }}</strong> }
                  </div>
                </div>
              </div>

              <!-- Session Presentation Details -->
              <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scheduled Presentation</span>
                <h4 class="text-base font-bold text-slate-900 leading-snug">{{ speakerSeg.title }}</h4>
                @if (speakerSeg.topicSummary) {
                  <p class="text-xs text-slate-600 leading-relaxed">{{ speakerSeg.topicSummary }}</p>
                }
              </div>

              <!-- Full Bio -->
              @if (speakerSeg.speakerBio) {
                <div class="space-y-1.5">
                  <h5 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Biography &amp; Background</h5>
                  <p class="text-xs text-slate-600 leading-relaxed">{{ speakerSeg.speakerBio }}</p>
                </div>
              }

              <!-- Grounding & Focus Topics -->
              @if (speakerSeg.groundingContext) {
                <div class="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-1">
                  <div class="text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1">
                    <mat-icon class="text-xs text-indigo-600">auto_awesome</mat-icon>
                    <span>Speaker Slide Context &amp; Discussion Scope</span>
                  </div>
                  <p class="text-xs text-slate-700 leading-relaxed font-mono line-clamp-4">{{ speakerSeg.groundingContext }}</p>
                </div>
              }

              <!-- Top Questions asked for this talk -->
              <div class="space-y-2 pt-2 border-t border-slate-100">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-slate-800">Submitted Questions for this Talk</span>
                  <span class="text-slate-500">{{ getSegmentQuestions(speakerSeg.id).length }} Inquiries</span>
                </div>

                @if (getSegmentQuestions(speakerSeg.id).length > 0) {
                  <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                    @for (q of getSegmentQuestions(speakerSeg.id); track q.id) {
                      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-xs space-y-1">
                        <div class="flex items-start justify-between gap-2">
                          <p class="text-slate-800 font-medium">{{ q.content }}</p>
                          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">▲ {{ q.upvotes }}</span>
                        </div>
                        @if (q.aiLine1) {
                          <div class="text-[11px] text-indigo-900/80 bg-white p-1.5 rounded-lg border border-indigo-100">
                            <strong>AI:</strong> {{ q.aiLine1 }}
                          </div>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <p class="text-xs text-slate-400 italic">No questions submitted yet for this speaker. Be the first to ask!</p>
                }
              </div>

              <!-- Modal Footer -->
              <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  (click)="closeSpeakerModal()"
                  class="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  (click)="prepareQuestionFromModal(speakerSeg)"
                  class="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <mat-icon class="text-xs">chat</mat-icon>
                  <span>Ask {{ speakerSeg.speakerName }}</span>
                </button>
              </div>

            </div>
          </div>
        }

      </div>
    }
  `,
})
export class SeriesLobby implements OnInit, OnDestroy {
  public qaService = inject(QaService);

  // Timer & Countdown Signals
  public currentTime = signal<number>(Date.now());
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // View Mode: Timeline, Grid, Compact
  public viewMode = signal<'TIMELINE' | 'GRID' | 'COMPACT'>('TIMELINE');

  // Agenda Filter, Search & Expansion
  public agendaFilter = signal<'ALL' | 'LIVE' | 'TALK' | 'PANEL' | 'BOOKMARKED'>('ALL');
  public agendaSearch = signal<string>('');
  public expandedSegmentId = signal<string | null>(null);
  public selectedSegmentId = signal<string | null>(null);

  // Bookmarking state (stored in session memory / local set)
  public bookmarkedSegmentIds = signal<Set<string>>(new Set());

  // Modal State for full speaker profile
  public selectedSpeakerModal = signal<Segment | null>(null);

  // Question Submission State
  public isSubmitting = signal<boolean>(false);

  public questionForm = new FormGroup({
    targetSegmentId: new FormControl('GLOBAL', [Validators.required]),
    category: new FormControl('Architecture', [Validators.required]),
    content: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]),
    authorName: new FormControl(''),
    isAnonymous: new FormControl(false),
  });

  // Filtered Segments computation
  public filteredSegments = computed<Segment[]>(() => {
    const segments = this.qaService.segments();
    const filter = this.agendaFilter();
    const search = this.agendaSearch().toLowerCase().trim();

    let list = segments;

    // Filter by type or status
    if (filter === 'LIVE') {
      list = list.filter(s => s.status === 'LIVE' || s.status === 'GRACE_WINDOW');
    } else if (filter === 'TALK') {
      list = list.filter(s => s.type === 'TALK');
    } else if (filter === 'PANEL') {
      list = list.filter(s => s.type === 'PANEL');
    } else if (filter === 'BOOKMARKED') {
      const bookmarked = this.bookmarkedSegmentIds();
      list = list.filter(s => bookmarked.has(s.id));
    }

    // Search query filter
    if (search) {
      list = list.filter(s =>
        s.title.toLowerCase().includes(search) ||
        s.speakerName.toLowerCase().includes(search) ||
        (s.speakerRole && s.speakerRole.toLowerCase().includes(search)) ||
        (s.speakerOrg && s.speakerOrg.toLowerCase().includes(search)) ||
        (s.speakerBio && s.speakerBio.toLowerCase().includes(search)) ||
        (s.topicSummary && s.topicSummary.toLowerCase().includes(search)) ||
        (s.categories && s.categories.some(c => c.toLowerCase().includes(search)))
      );
    }

    return list;
  });

  // Available Categories
  public availableCategories = computed<string[]>(() => {
    const active = this.qaService.activeSegment();
    if (active && active.categories && active.categories.length > 0) {
      return active.categories;
    }
    return ['Architecture', 'Gemini AI', 'Performance', 'Security', 'Edge Caching', 'General'];
  });

  // Countdown & Progress Computations
  public countdownFormatted = computed<string>(() => {
    const _now = this.currentTime();
    const active = this.qaService.activeSegment();

    if (active && active.actualStartTime) {
      const startMs = new Date(active.actualStartTime).getTime();
      const scheduledDurationMs = (active.scheduledDurationMinutes || 45) * 60 * 1000;
      const endMs = startMs + scheduledDurationMs;
      const diffMs = endMs - _now;

      if (diffMs > 0) {
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      } else {
        const overMs = Math.abs(diffMs);
        const overMins = Math.floor(overMs / 60000);
        const overSecs = Math.floor((overMs % 60000) / 1000);
        return `+${overMins.toString().padStart(2, '0')}:${overSecs.toString().padStart(2, '0')}`;
      }
    }

    const nextSeg = this.getNextSegment();
    if (nextSeg) {
      return '05:00';
    }

    return '00:00';
  });

  public isOvertime = computed<boolean>(() => {
    const _now = this.currentTime();
    const active = this.qaService.activeSegment();
    if (!active || !active.actualStartTime) return false;
    const startMs = new Date(active.actualStartTime).getTime();
    const scheduledDurationMs = (active.scheduledDurationMinutes || 45) * 60 * 1000;
    return _now > startMs + scheduledDurationMs;
  });

  public talkProgressPercent = computed<number>(() => {
    const _now = this.currentTime();
    const active = this.qaService.activeSegment();
    if (!active || !active.actualStartTime) return 0;
    const startMs = new Date(active.actualStartTime).getTime();
    const scheduledDurationMs = (active.scheduledDurationMinutes || 45) * 60 * 1000;
    const elapsedMs = _now - startMs;
    const percent = Math.min(100, Math.max(0, Math.round((elapsedMs / scheduledDurationMs) * 100)));
    return percent;
  });

  // Overall Workshop Schedule Progress across all speaker sessions
  public overallScheduleStats = computed(() => {
    const segments = this.qaService.segments();
    const _now = this.currentTime();
    const totalCount = segments.length;
    if (totalCount === 0) {
      return {
        totalMinutes: 0,
        elapsedMinutes: 0,
        percent: 0,
        completedCount: 0,
        activeSegmentIndex: -1,
        remainingCount: 0,
        totalHoursFormatted: '0m',
        statusSummary: 'No sessions scheduled'
      };
    }

    let totalMinutes = 0;
    let elapsedMinutes = 0;
    let completedCount = 0;
    let activeSegmentIndex = -1;

    segments.forEach((seg, idx) => {
      const dur = seg.scheduledDurationMinutes || 45;
      totalMinutes += dur;

      if (seg.status === 'ENDED') {
        completedCount++;
        elapsedMinutes += dur;
      } else if (seg.status === 'LIVE' || seg.status === 'GRACE_WINDOW') {
        activeSegmentIndex = idx;
        if (seg.actualStartTime) {
          const startMs = new Date(seg.actualStartTime).getTime();
          const liveElapsedMs = Math.max(0, _now - startMs);
          const liveElapsedMins = liveElapsedMs / (60 * 1000);
          elapsedMinutes += Math.min(dur, liveElapsedMins);
        } else {
          elapsedMinutes += dur * 0.15;
        }
      }
    });

    const percent = totalMinutes > 0 ? Math.min(100, Math.max(0, Math.round((elapsedMinutes / totalMinutes) * 100))) : 0;
    const remainingCount = Math.max(0, totalCount - completedCount - (activeSegmentIndex >= 0 ? 1 : 0));

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const totalHoursFormatted = hours > 0 ? `${hours}h ${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;

    let statusSummary = '';
    if (activeSegmentIndex >= 0) {
      statusSummary = `Session ${activeSegmentIndex + 1} of ${totalCount} currently live`;
    } else if (completedCount === totalCount) {
      statusSummary = `All ${totalCount} sessions completed`;
    } else {
      statusSummary = `${completedCount} of ${totalCount} sessions completed`;
    }

    return {
      totalMinutes,
      elapsedMinutes: Math.round(elapsedMinutes),
      percent,
      completedCount,
      activeSegmentIndex,
      remainingCount,
      totalHoursFormatted,
      statusSummary
    };
  });

  public getActiveSegmentProgress(seg: Segment): { elapsedFormatted: string; totalFormatted: string; percent: number; isOvertime: boolean } {
    const _now = this.currentTime();
    const durMins = seg.scheduledDurationMinutes || 45;
    if (!seg.actualStartTime) {
      return { elapsedFormatted: '00:00', totalFormatted: `${durMins}:00`, percent: 0, isOvertime: false };
    }

    const startMs = new Date(seg.actualStartTime).getTime();
    const elapsedMs = Math.max(0, _now - startMs);
    const scheduledMs = durMins * 60 * 1000;
    const isOvertime = elapsedMs > scheduledMs;

    const elMins = Math.floor(elapsedMs / 60000);
    const elSecs = Math.floor((elapsedMs % 60000) / 1000);
    const elapsedFormatted = `${elMins.toString().padStart(2, '0')}:${elSecs.toString().padStart(2, '0')}`;
    const totalFormatted = `${durMins.toString().padStart(2, '0')}:00`;
    const percent = Math.min(100, Math.round((elapsedMs / scheduledMs) * 100));

    return { elapsedFormatted, totalFormatted, percent, isOvertime };
  }

  public timerStatusLabel = computed<string>(() => {
    const active = this.qaService.activeSegment();
    if (active) {
      if (this.isOvertime()) {
        return 'Grace window active • Wrapping up discussion';
      }
      return 'Remaining in current speaker presentation';
    }
    return 'Until next speaker takes the live stage';
  });

  public ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.timerInterval = setInterval(() => {
        this.currentTime.set(Date.now());
      }, 1000);

      // Load saved bookmarks from localStorage
      try {
        const saved = localStorage.getItem('live_qa_bookmarked_segments');
        if (saved) {
          const arr = JSON.parse(saved);
          if (Array.isArray(arr)) {
            this.bookmarkedSegmentIds.set(new Set(arr));
          }
        }
      } catch {
        // ignore
      }
    }
  }

  public ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  public onSearchChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.agendaSearch.set(val);
  }

  public resetFilters(): void {
    this.agendaFilter.set('ALL');
    this.agendaSearch.set('');
  }

  public selectTopicTag(tag: string): void {
    this.agendaSearch.set(tag);
  }

  public toggleBookmark(segmentId: string): void {
    this.bookmarkedSegmentIds.update(set => {
      const next = new Set(set);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('live_qa_bookmarked_segments', JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }

  public isBookmarked(segmentId: string): boolean {
    return this.bookmarkedSegmentIds().has(segmentId);
  }

  public toggleExpandSegment(segmentId: string): void {
    if (this.expandedSegmentId() === segmentId) {
      this.expandedSegmentId.set(null);
    } else {
      this.expandedSegmentId.set(segmentId);
    }
  }

  public openSpeakerDetailModal(seg: Segment): void {
    this.selectedSpeakerModal.set(seg);
  }

  public closeSpeakerModal(): void {
    this.selectedSpeakerModal.set(null);
  }

  public prepareQuestionFromModal(seg: Segment): void {
    this.closeSpeakerModal();
    this.prepareQuestionForSpeaker(seg);
  }

  public selectCategory(cat: string): void {
    this.questionForm.patchValue({ category: cat });
  }

  public prepareQuestionForSpeaker(seg: Segment): void {
    this.selectedSegmentId.set(seg.id);
    this.questionForm.patchValue({
      targetSegmentId: seg.id,
      category: seg.categories?.[0] || 'Architecture',
    });

    if (typeof document !== 'undefined') {
      const el = document.getElementById('lobby-question-text');
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  public scrollToSegment(segmentId: string): void {
    this.selectedSegmentId.set(segmentId);
    if (typeof document !== 'undefined') {
      const el = document.getElementById('timeline-node-' + segmentId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  public filterFeedToSegment(segmentId: string): void {
    this.qaService.selectedSegmentFilter.set(segmentId);
    this.qaService.activeTab.set('feed');
  }

  public getSegmentQuestionCount(segmentId: string): number {
    return this.qaService.questions().filter(q => q.segmentId === segmentId).length;
  }

  public getSegmentQuestions(segmentId: string): Question[] {
    return this.qaService.questions().filter(q => q.segmentId === segmentId);
  }

  public getNextSegment(): Segment | null {
    const segments = this.qaService.segments();
    const active = this.qaService.activeSegment();
    if (!active) {
      return segments.find(s => s.status === 'SCHEDULED') || null;
    }
    const nextIdx = segments.findIndex(s => s.id === active.id) + 1;
    return nextIdx < segments.length ? segments[nextIdx] : null;
  }

  public getTotalUpvotes(): number {
    return this.qaService.questions().reduce((sum, q) => sum + (q.upvotes || 0), 0);
  }

  public async onQuestionSubmit(): Promise<void> {
    if (this.questionForm.invalid) return;

    const val = this.questionForm.value;
    const content = val.content || '';
    const category = val.category || 'General';
    const authorName = val.authorName || '';
    const isAnonymous = !!val.isAnonymous;
    const targetSegmentId = val.targetSegmentId === 'GLOBAL' ? undefined : val.targetSegmentId || undefined;

    this.isSubmitting.set(true);

    try {
      const res = await this.qaService.submitQuestion(content, category, isAnonymous, targetSegmentId, authorName);
      this.isSubmitting.set(false);

      if (res && res.success) {
        this.questionForm.patchValue({ content: '' });
      }
    } catch {
      this.isSubmitting.set(false);
    }
  }

  public downloadSeriesCalendar(): void {
    const series = this.qaService.currentSeries();
    if (!series) return;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AskQlive//Workshop Series Agenda//EN',
      'CALSCALE:GREGORIAN',
      ...series.segments.map(seg => {
        return [
          'BEGIN:VEVENT',
          `SUMMARY:${seg.title} - ${seg.speakerName}`,
          `DESCRIPTION:${seg.speakerBio || ''} Topics: ${seg.categories.join(', ')}`,
          `LOCATION:AskQlive Room #${series.joinCode}`,
          `STATUS:CONFIRMED`,
          'END:VEVENT'
        ].join('\r\n');
      }),
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${series.title.replace(/\s+/g, '_')}_Agenda.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
