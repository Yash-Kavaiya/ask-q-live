import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';

export interface FrequencyHistoryRecord {
  currentCount: number;
  previousCount: number;
  delta: number;
  isNew: boolean;
  surgeTimestamp: number;
}

export interface WordAnalyticsDetail {
  text: string;
  occurrences: number;
  relatedQuestionCount: number;
  sentimentScore: number;
  sentimentFormatted: string;
  sentimentLabel: 'Positive' | 'Neutral' | 'Critical';
  sentimentColor: string;
  sentimentBg: string;
  sentimentBorder: string;
  positiveCount: number;
  neutralCount: number;
  criticalCount: number;
  positivePct: number;
  neutralPct: number;
  criticalPct: number;
  totalUpvotes: number;
  category: string;
  sampleQuestions: {
    id: string;
    authorName: string;
    content: string;
    upvotes: number;
    sentimentScore: number;
    sentimentLabel: string;
    sentimentColor: string;
    sentimentBg: string;
  }[];
}

export interface PlacedWord {
  text: string;
  count: number;
  fontSize: number;
  color: string;
  bgColor: string;
  borderColor: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDominant: boolean;
  category: string;
  relatedQuestionCount: number;
  sentimentScore: number;
  sentimentFormatted: string;
  sentimentLabel: 'Positive' | 'Neutral' | 'Critical';
  sentimentColor: string;
  sentimentBg: string;
  sampleQuestion?: string;
  frequencyDelta?: number;
  isNew?: boolean;
  isSurging?: boolean;
  previousCount?: number;
}

export interface BubbleWord {
  text: string;
  count: number;
  radius: number;
  color: string;
  fillColor: string;
  borderColor: string;
  x: number;
  y: number;
  category: string;
  relatedQuestionCount: number;
  sentimentScore: number;
  sentimentFormatted: string;
  sentimentLabel: 'Positive' | 'Neutral' | 'Critical';
  sentimentColor: string;
  sentimentBg: string;
  sampleQuestion?: string;
  frequencyDelta?: number;
  isNew?: boolean;
  isSurging?: boolean;
  previousCount?: number;
}

export type WordCloudViewMode = 'cloud' | 'bubbles' | 'matrix';

@Component({
  selector: 'app-word-cloud-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="space-y-6">
      
      <!-- Top Operational KPI Metric Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        <!-- Metric 1: Total Inquiries -->
        <div class="bg-white rounded-2xl p-4 sm:p-5 border border-[#E0E2EC] shadow-xs hover:border-[#1A73E8]/40 transition-all">
          <div class="flex items-center justify-between text-xs text-[#747775] mb-2">
            <span class="font-semibold uppercase tracking-wider">Total Questions</span>
            <div class="w-7 h-7 rounded-lg bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center">
              <mat-icon class="text-base">chat</mat-icon>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="font-display font-bold text-2xl sm:text-3xl text-[#1F1F1F]">
              {{ telemetry()?.totalQuestions ?? qaService.questions().length }}
            </span>
            <span class="text-xs text-[#1E8E3E] font-medium flex items-center">
              <mat-icon class="text-xs">trending_up</mat-icon>
              Live
            </span>
          </div>
        </div>

        <!-- Metric 2: Upvote Momentum -->
        <div class="bg-white rounded-2xl p-4 sm:p-5 border border-[#E0E2EC] shadow-xs hover:border-[#B06000]/40 transition-all">
          <div class="flex items-center justify-between text-xs text-[#747775] mb-2">
            <span class="font-semibold uppercase tracking-wider">Total Upvotes</span>
            <div class="w-7 h-7 rounded-lg bg-[#FEF7E0] text-[#B06000] flex items-center justify-center">
              <mat-icon class="text-base">thumb_up</mat-icon>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="font-display font-bold text-2xl sm:text-3xl text-[#1F1F1F]">
              {{ telemetry()?.totalUpvotes ?? totalUpvotesFallback() }}
            </span>
            <span class="text-xs text-[#747775] font-medium">
              {{ telemetry()?.upvoteVelocity ?? 0 }}/min
            </span>
          </div>
        </div>

        <!-- Metric 3: Question Velocity -->
        <div class="bg-white rounded-2xl p-4 sm:p-5 border border-[#E0E2EC] shadow-xs hover:border-[#1E8E3E]/40 transition-all">
          <div class="flex items-center justify-between text-xs text-[#747775] mb-2">
            <span class="font-semibold uppercase tracking-wider">Velocity (60s)</span>
            <div class="w-7 h-7 rounded-lg bg-[#E6F4EA] text-[#1E8E3E] flex items-center justify-center">
              <mat-icon class="text-base">speed</mat-icon>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="font-display font-bold text-2xl sm:text-3xl text-[#1F1F1F]">
              {{ telemetry()?.velocity ?? 0 }}
            </span>
            <span class="text-xs text-[#444746] font-medium">q/min</span>
          </div>
        </div>

        <!-- Metric 4: Sentiment Polarity -->
        <div class="bg-white rounded-2xl p-4 sm:p-5 border border-[#E0E2EC] shadow-xs hover:border-[#9334E6]/40 transition-all">
          <div class="flex items-center justify-between text-xs text-[#747775] mb-2">
            <span class="font-semibold uppercase tracking-wider">Overall Sentiment</span>
            <div class="w-7 h-7 rounded-lg bg-[#F3E8FD] text-[#9334E6] flex items-center justify-center">
              <mat-icon class="text-base">sentiment_satisfied_alt</mat-icon>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="font-display font-bold text-2xl sm:text-3xl text-[#1F1F1F]">
              {{ sentimentFormatted() }}
            </span>
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-md"
              [class.bg-[#E6F4EA]]="sentimentScore() >= 0.2"
              [class.text-[#137333]]="sentimentScore() >= 0.2"
              [class.bg-[#FEF7E0]]="sentimentScore() < 0.2 && sentimentScore() >= -0.2"
              [class.text-[#B06000]]="sentimentScore() < 0.2 && sentimentScore() >= -0.2"
              [class.bg-[#FCE8E6]]="sentimentScore() < -0.2"
              [class.text-[#D93025]]="sentimentScore() < -0.2"
            >
              {{ sentimentLabel() }}
            </span>
          </div>
        </div>

      </div>

      <!-- Main Analytics Bento Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <!-- Left: Dynamic Semantic Word Cloud & Visualizer (8 cols) -->
        <div class="lg:col-span-8 bg-white rounded-2xl p-5 sm:p-6 border border-[#E0E2EC] shadow-xs flex flex-col">
          
          <!-- Top Header & View Modes Toolbar -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E0E2EC] mb-4">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center shadow-xs">
                <mat-icon class="text-xl">cloud</mat-icon>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-display font-bold text-base text-[#1F1F1F]">Live Semantic Intelligence Cloud</h3>
                  <span class="px-2 py-0.5 text-[10px] font-bold bg-[#E8F0FE] text-[#1A73E8] rounded-full uppercase tracking-wider">
                    {{ filteredWords().length }} Keywords
                  </span>
                  <!-- Real-time dynamic frequency indicator -->
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-[#E6F4EA] text-[#137333] rounded-full">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#1E8E3E] animate-ping"></span>
                    Live Velocity Active
                  </span>
                </div>
                <p class="text-xs text-[#747775]">
                  Dynamic NLP token weights, exact occurrences &amp; sentiment scores with smooth frequency transitions.
                </p>
              </div>
            </div>

            <!-- Influx Action & View Switchers (Cloud / Bubbles / Matrix) -->
            <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <!-- Simulate Data Influx button to demonstrate smooth transition -->
              <button
                type="button"
                id="btn-simulate-data-influx"
                (click)="injectSampleData()"
                [disabled]="isInjectingData()"
                class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#E8F0FE] text-[#1A73E8] hover:bg-[#D2E3FC] disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Inject realistic attendee inquiry to trigger frequency transitions"
              >
                <mat-icon class="text-sm" [class.animate-spin]="isInjectingData()">{{ isInjectingData() ? 'sync' : 'add_circle' }}</mat-icon>
                <span class="hidden md:inline">{{ isInjectingData() ? 'Injecting...' : 'Simulate Influx' }}</span>
                <span class="md:hidden">Influx</span>
              </button>

              <div class="flex items-center gap-1 p-1 bg-[#F1F3F4] rounded-xl border border-[#E0E2EC]/70">
                <button
                  type="button"
                  id="btn-view-cloud"
                  (click)="viewMode.set('cloud')"
                  [class.bg-white]="viewMode() === 'cloud'"
                  [class.text-[#1A73E8]]="viewMode() === 'cloud'"
                  [class.shadow-xs]="viewMode() === 'cloud'"
                  [class.text-[#444746]]="viewMode() !== 'cloud'"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Cosmic Spiral Word Cloud"
                >
                  <mat-icon class="text-sm">grain</mat-icon>
                  <span class="hidden md:inline">Cosmic Cloud</span>
                </button>

                <button
                  type="button"
                  id="btn-view-bubbles"
                  (click)="viewMode.set('bubbles')"
                  [class.bg-white]="viewMode() === 'bubbles'"
                  [class.text-[#1A73E8]]="viewMode() === 'bubbles'"
                  [class.shadow-xs]="viewMode() === 'bubbles'"
                  [class.text-[#444746]]="viewMode() !== 'bubbles'"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Packed Thematic Bubble Clusters"
                >
                  <mat-icon class="text-sm">bubble_chart</mat-icon>
                  <span class="hidden md:inline">Bubble Cluster</span>
                </button>

                <button
                  type="button"
                  id="btn-view-matrix"
                  (click)="viewMode.set('matrix')"
                  [class.bg-white]="viewMode() === 'matrix'"
                  [class.text-[#1A73E8]]="viewMode() === 'matrix'"
                  [class.shadow-xs]="viewMode() === 'matrix'"
                  [class.text-[#444746]]="viewMode() !== 'matrix'"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Ranked Frequency & Velocity Matrix"
                >
                  <mat-icon class="text-sm">format_list_numbered</mat-icon>
                  <span class="hidden md:inline">Ranked Matrix</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Secondary Filter & Search Bar -->
          <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <!-- Search Keyword in Cloud -->
            <div class="relative flex-1 min-w-[200px] max-w-xs">
              <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-[#747775] text-sm">search</mat-icon>
              <input
                id="input-filter-keywords"
                type="text"
                [value]="searchFilter()"
                (input)="onSearchInput($event)"
                placeholder="Highlight keyword..."
                class="w-full pl-8 pr-7 py-1.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white rounded-lg text-xs outline-none transition-all"
              />
              @if (searchFilter()) {
                <button
                  type="button"
                  (click)="searchFilter.set('')"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-[#747775] hover:text-[#1F1F1F]"
                >
                  <mat-icon class="text-xs">close</mat-icon>
                </button>
              }
            </div>

            <!-- Minimum Frequency Filter Selector -->
            <div class="flex items-center gap-1.5 text-xs text-[#747775]">
              <span class="text-[11px] font-semibold uppercase tracking-wider">Threshold:</span>
              <button
                type="button"
                (click)="minThreshold.set(1)"
                [class.bg-[#1A73E8]]="minThreshold() === 1"
                [class.text-white]="minThreshold() === 1"
                [class.bg-[#F1F3F4]]="minThreshold() !== 1"
                [class.text-[#444746]]="minThreshold() !== 1"
                class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer"
              >
                All
              </button>
              <button
                type="button"
                (click)="minThreshold.set(2)"
                [class.bg-[#1A73E8]]="minThreshold() === 2"
                [class.text-white]="minThreshold() === 2"
                [class.bg-[#F1F3F4]]="minThreshold() !== 2"
                [class.text-[#444746]]="minThreshold() !== 2"
                class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer"
              >
                2+
              </button>
              <button
                type="button"
                (click)="minThreshold.set(3)"
                [class.bg-[#1A73E8]]="minThreshold() === 3"
                [class.text-white]="minThreshold() === 3"
                [class.bg-[#F1F3F4]]="minThreshold() !== 3"
                [class.text-[#444746]]="minThreshold() !== 3"
                class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer"
              >
                3+
              </button>
            </div>
          </div>

          <!-- Active Frequency Surge Toast Banner -->
          @if (lastSurgeNotice(); as notice) {
            <div class="mb-3 px-3 py-1.5 rounded-xl bg-[#E6F4EA] border border-[#CEEAD6] text-xs text-[#137333] flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-200">
              <div class="flex items-center gap-1.5">
                <mat-icon class="text-sm text-[#1E8E3E] animate-bounce">trending_up</mat-icon>
                <span>
                  <strong>Frequency Influx Detected:</strong> Keyword <em>"{{ notice.word }}"</em> surging
                  @if (notice.isNew) {
                    (New token added, {{ notice.count }} mentions)
                  } @else {
                    (+{{ notice.delta }} new mentions, now {{ notice.count }} total)
                  }
                </span>
              </div>
              <span class="text-[10px] font-mono font-semibold text-[#1E8E3E]">Smooth morphing</span>
            </div>
          }

          <!-- SVG Visual Canvas Container -->
          <div
            #canvasWrapper
            class="relative w-full h-[410px] sm:h-[450px] bg-gradient-to-b from-[#F8FAFD] to-[#F1F4F9] rounded-2xl border border-[#E0E2EC] overflow-hidden flex items-center justify-center shadow-inner"
          >
            <!-- Background Coordinate Grid Pattern -->
            <div class="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:20px_20px]"></div>

            <!-- Central Radial Glow Backdrop -->
            <div class="absolute w-72 h-72 rounded-full bg-[#1A73E8]/5 blur-3xl pointer-events-none"></div>

            <!-- VIEW 1: COSMIC CLOUD -->
            @if (viewMode() === 'cloud') {
              @if (placedWords().length > 0) {
                <svg
                  [attr.viewBox]="'0 0 ' + containerWidth() + ' ' + containerHeight()"
                  class="w-full h-full select-none relative z-10"
                >
                  <defs>
                    <!-- Soft Drop Shadow Filter for Pills -->
                    <filter id="softPillShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.08" />
                    </filter>
                    <filter id="glowDominant" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#1A73E8" flood-opacity="0.25" />
                    </filter>
                    <filter id="glowSurge" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#1E8E3E" flood-opacity="0.35" />
                    </filter>
                  </defs>

                  @for (item of placedWords(); track item.text) {
                    <g
                      [attr.transform]="'translate(' + item.x + ',' + item.y + ')'"
                      class="cursor-pointer word-node-transition group outline-none"
                      [class.animate-word-enter]="item.isNew"
                      [class.opacity-30]="searchFilter() && !item.text.toLowerCase().includes(searchFilter().toLowerCase())"
                      (mouseenter)="setHoveredPlacedWord(item)"
                      (mouseleave)="onWordMouseLeave()"
                      (click)="filterByWord(item.text)"
                      tabindex="0"
                      role="button"
                      [attr.aria-label]="item.text + ', ' + item.count + ' occurrences, sentiment score ' + item.sentimentScore"
                    >
                      <title>{{ item.text }}: {{ item.count }} occurrences | Sentiment: {{ item.sentimentFormatted }} ({{ item.sentimentLabel }})</title>
                      
                      <!-- Surge Expanding Ripple Halo when frequency increases -->
                      @if (item.isSurging) {
                        <rect
                          [attr.x]="-item.width / 2 - 5"
                          [attr.y]="-item.height / 2 - 5"
                          [attr.width]="item.width + 10"
                          [attr.height]="item.height + 10"
                          [attr.rx]="(item.height + 10) / 2"
                          [attr.ry]="(item.height + 10) / 2"
                          fill="none"
                          stroke="#1E8E3E"
                          stroke-width="2"
                          class="animate-surge-ripple pointer-events-none"
                        />

                        <!-- Floating Surge Delta Badge (+1, +2) -->
                        <g
                          [attr.transform]="'translate(0,' + (-item.height / 2 - 8) + ')'"
                          class="animate-float-badge pointer-events-none"
                        >
                          <rect
                            x="-16"
                            y="-9"
                            width="32"
                            height="16"
                            rx="8"
                            ry="8"
                            fill="#1E8E3E"
                          />
                          <text
                            text-anchor="middle"
                            dominant-baseline="central"
                            font-size="9"
                            font-weight="bold"
                            fill="#FFFFFF"
                          >
                            +{{ item.frequencyDelta }}
                          </text>
                        </g>
                      }

                      <!-- Rounded Pill Background Badge with smooth size and color transitions -->
                      <rect
                        [attr.x]="-item.width / 2"
                        [attr.y]="-item.height / 2"
                        [attr.width]="item.width"
                        [attr.height]="item.height"
                        [attr.rx]="item.height / 2"
                        [attr.ry]="item.height / 2"
                        [attr.fill]="item.bgColor"
                        [attr.stroke]="item.isSurging ? '#1E8E3E' : item.borderColor"
                        [attr.stroke-width]="item.isSurging ? 2 : (item.isDominant ? 2 : 1)"
                        [attr.filter]="item.isSurging ? 'url(#glowSurge)' : (item.isDominant ? 'url(#glowDominant)' : 'url(#softPillShadow)')"
                        class="word-rect-transition group-hover:stroke-[#1A73E8] group-hover:fill-white"
                      />

                      <!-- Keyword Text Label with smooth font size transitions -->
                      <text
                        text-anchor="middle"
                        dominant-baseline="central"
                        [attr.font-size]="item.fontSize"
                        [attr.fill]="item.color"
                        [attr.y]="-0.5"
                        class="word-text-transition font-display font-bold select-none tracking-tight group-hover:scale-105"
                      >
                        {{ item.text }}
                      </text>

                      <!-- Pill Count Indicator Badge -->
                      <g [attr.transform]="'translate(' + (item.width / 2 - 8) + ',' + (-item.height / 2 + 5) + ')'">
                        <circle
                          r="7.5"
                          [attr.fill]="item.isSurging ? '#1E8E3E' : (item.isDominant ? '#1A73E8' : '#747775')"
                          class="word-circle-transition group-hover:fill-[#1A73E8]"
                        />
                        <text
                          text-anchor="middle"
                          dominant-baseline="central"
                          font-size="8.5"
                          font-weight="bold"
                          fill="#FFFFFF"
                        >
                          {{ item.count }}
                        </text>
                      </g>
                    </g>
                  }
                </svg>
              } @else {
                <div class="text-center p-8 text-[#747775] relative z-10">
                  <div class="w-14 h-14 rounded-2xl bg-[#E8F0FE] text-[#1A73E8] mx-auto flex items-center justify-center mb-3">
                    <mat-icon class="text-3xl">bubble_chart</mat-icon>
                  </div>
                  <p class="font-display font-bold text-sm text-[#1F1F1F]">Extracting Semantic Tokens</p>
                  <p class="text-xs text-[#747775] mt-1 max-w-sm">
                    Inquiries submitted in this session will automatically be tokenized into semantic clusters with live frequency transitions.
                  </p>
                </div>
              }
            }

            <!-- VIEW 2: PACKED BUBBLE CLUSTERS -->
            @if (viewMode() === 'bubbles') {
              @if (bubbleWords().length > 0) {
                <svg
                  [attr.viewBox]="'0 0 ' + containerWidth() + ' ' + containerHeight()"
                  class="w-full h-full select-none relative z-10"
                >
                  @for (bubble of bubbleWords(); track bubble.text) {
                    <g
                      [attr.transform]="'translate(' + bubble.x + ',' + bubble.y + ')'"
                      class="cursor-pointer word-node-transition group outline-none"
                      [class.animate-word-enter]="bubble.isNew"
                      [class.opacity-25]="searchFilter() && !bubble.text.toLowerCase().includes(searchFilter().toLowerCase())"
                      (mouseenter)="setHoveredBubble(bubble)"
                      (mouseleave)="onWordMouseLeave()"
                      (click)="filterByWord(bubble.text)"
                      tabindex="0"
                      role="button"
                      [attr.aria-label]="bubble.text + ', ' + bubble.count + ' occurrences, sentiment score ' + bubble.sentimentScore"
                    >
                      <title>{{ bubble.text }}: {{ bubble.count }} occurrences | Sentiment: {{ bubble.sentimentFormatted }} ({{ bubble.sentimentLabel }})</title>

                      <!-- Surge Ripple for Bubbles -->
                      @if (bubble.isSurging) {
                        <circle
                          [attr.r]="bubble.radius + 8"
                          fill="none"
                          stroke="#1E8E3E"
                          stroke-width="2"
                          class="animate-surge-ripple pointer-events-none"
                        />

                        <!-- Floating Surge Delta Badge (+1, +2) -->
                        <g
                          [attr.transform]="'translate(0,' + (-bubble.radius - 8) + ')'"
                          class="animate-float-badge pointer-events-none"
                        >
                          <rect
                            x="-15"
                            y="-8"
                            width="30"
                            height="15"
                            rx="7"
                            ry="7"
                            fill="#1E8E3E"
                          />
                          <text
                            text-anchor="middle"
                            dominant-baseline="central"
                            font-size="8.5"
                            font-weight="bold"
                            fill="#FFFFFF"
                          >
                            +{{ bubble.frequencyDelta }}
                          </text>
                        </g>
                      }

                      <!-- Soft Outer Halo -->
                      <circle
                        [attr.r]="bubble.radius + 4"
                        [attr.fill]="bubble.isSurging ? '#1E8E3E' : bubble.color"
                        [attr.opacity]="bubble.isSurging ? 0.25 : 0.12"
                        class="word-circle-transition group-hover:opacity-25"
                      />

                      <!-- Main Bubble Circle with smooth radius transitions -->
                      <circle
                        [attr.r]="bubble.radius"
                        [attr.fill]="bubble.fillColor"
                        [attr.stroke]="bubble.isSurging ? '#1E8E3E' : bubble.borderColor"
                        [attr.stroke-width]="bubble.isSurging ? 2.5 : 1.5"
                        class="word-circle-transition group-hover:stroke-[#1A73E8] group-hover:scale-105 shadow-xs"
                      />

                      <!-- Word Text inside Bubble -->
                      <text
                        text-anchor="middle"
                        dominant-baseline="central"
                        [attr.y]="bubble.radius > 26 ? -4 : 0"
                        [attr.font-size]="Math.max(10, Math.min(18, bubble.radius * 0.42))"
                        [attr.fill]="bubble.color"
                        class="word-text-transition font-display font-bold select-none tracking-tight"
                      >
                        {{ bubble.text }}
                      </text>

                      <!-- Count Subtext for larger bubbles -->
                      @if (bubble.radius > 24) {
                        <text
                          text-anchor="middle"
                          dominant-baseline="central"
                          [attr.y]="10"
                          font-size="9.5"
                          font-weight="bold"
                          [attr.fill]="bubble.isSurging ? '#137333' : '#747775'"
                          class="select-none font-mono"
                        >
                          {{ bubble.count }}x @if (bubble.frequencyDelta && bubble.frequencyDelta > 0) { (+{{ bubble.frequencyDelta }}) }
                        </text>
                      }
                    </g>
                  }
                </svg>
              } @else {
                <div class="text-center p-8 text-[#747775] relative z-10">
                  <mat-icon class="text-3xl text-[#8E918F] mb-2">bubble_chart</mat-icon>
                  <p class="text-xs">No bubble clusters generated yet.</p>
                </div>
              }
            }

            <!-- VIEW 3: RANKED MATRIX VIEW -->
            @if (viewMode() === 'matrix') {
              <div class="w-full h-full p-4 sm:p-6 overflow-y-auto relative z-10 space-y-2.5">
                @for (item of filteredWords(); track item.text; let i = $index) {
                  @let detail = getWordDetail(item.text, item.count);
                  @let surgeInfo = getSurgeInfo(item.text);
                  <button
                    type="button"
                    (mouseenter)="setHoveredWordText(item.text, item.count)"
                    (mouseleave)="onWordMouseLeave()"
                    (click)="filterByWord(item.text)"
                    class="w-full text-left p-3 bg-white/90 hover:bg-white rounded-xl border border-[#E0E2EC] hover:border-[#1A73E8] shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group block"
                    [class.border-[#1E8E3E]]="surgeInfo.isSurging"
                    [class.bg-[#F2FAF4]]="surgeInfo.isSurging"
                  >
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                      <span class="font-mono text-xs font-bold text-[#747775] w-6">#{{ i + 1 }}</span>
                      
                      <div class="w-2.5 h-2.5 rounded-full shrink-0" [style.background-color]="getPaletteColor(i)"></div>
                      
                      <span class="font-display font-bold text-sm text-[#1F1F1F] group-hover:text-[#1A73E8] transition-colors truncate">
                        {{ item.text }}
                      </span>

                      @if (surgeInfo.isSurging) {
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E6F4EA] text-[#137333] flex items-center gap-0.5 animate-pulse">
                          <mat-icon class="text-xs">arrow_upward</mat-icon>
                          <span>+{{ surgeInfo.delta }} surge</span>
                        </span>
                      }

                      <!-- Relative frequency bar with smooth CSS width transition -->
                      <div class="hidden sm:block flex-1 max-w-xs h-2 bg-[#F1F3F4] rounded-full overflow-hidden ml-2">
                        <div
                          class="h-full rounded-full transition-all duration-700 ease-out"
                          [style.width.%]="getWordPercentage(item.count)"
                          [style.background-color]="surgeInfo.isSurging ? '#1E8E3E' : getPaletteColor(i)"
                        ></div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2.5 shrink-0">
                      <!-- Exact Occurrences Badge -->
                      <span
                        class="px-2 py-0.5 rounded-md text-xs font-mono font-bold transition-colors"
                        [class.bg-[#E6F4EA]]="surgeInfo.isSurging"
                        [class.text-[#137333]]="surgeInfo.isSurging"
                        [class.bg-[#F1F3F4]]="!surgeInfo.isSurging"
                        [class.text-[#1F1F1F]]="!surgeInfo.isSurging"
                      >
                        {{ item.count }} occurrences
                      </span>

                      <!-- Sentiment Score Pill -->
                      <span
                        class="px-2 py-0.5 rounded-md text-[11px] font-bold font-mono flex items-center gap-1"
                        [style.color]="detail.sentimentColor"
                        [style.background-color]="detail.sentimentBg"
                      >
                        <mat-icon class="text-[12px]">sentiment_satisfied_alt</mat-icon>
                        <span>{{ detail.sentimentFormatted }}</span>
                      </span>
                      
                      <span
                        class="text-xs font-semibold text-[#1A73E8] group-hover:underline flex items-center gap-1 ml-1"
                      >
                        <span>Filter</span>
                        <mat-icon class="text-sm">arrow_forward</mat-icon>
                      </span>
                    </div>
                  </button>
                } @empty {
                  <div class="text-center py-12 text-[#747775]">
                    <p class="text-xs">No keywords match your search query.</p>
                  </div>
                }
              </div>
            }

            <!-- Interactive Rich Floating Tooltip (Occurrences + Sentiment Score + Questions) -->
            @if (activeWordDetail(); as detail) {
              <div
                (mouseenter)="keepTooltipOpen = true"
                (mouseleave)="keepTooltipOpen = false; onTooltipMouseLeave()"
                class="absolute bottom-3 right-3 left-3 sm:left-auto sm:right-3 sm:w-96 max-h-[380px] overflow-y-auto bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-[#D2E3FC] shadow-xl z-30 pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150"
              >
                <!-- Tooltip Header -->
                <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-[#E0E2EC]/70">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-display font-bold text-base text-[#1F1F1F] tracking-tight truncate">
                        "{{ detail.text }}"
                      </span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F0FE] text-[#1A73E8] uppercase tracking-wider">
                        {{ detail.category }}
                      </span>
                    </div>
                    <p class="text-[11px] text-[#747775] mt-0.5">
                      Keyword Intelligence &amp; Inquiries
                    </p>
                  </div>

                  <button
                    type="button"
                    (click)="hoveredWordDetail.set(null)"
                    class="w-6 h-6 rounded-full hover:bg-[#F1F3F4] text-[#747775] flex items-center justify-center shrink-0 cursor-pointer"
                    title="Dismiss tooltip"
                  >
                    <mat-icon class="text-sm">close</mat-icon>
                  </button>
                </div>

                <!-- Core Metric 1 & 2 Cards -->
                <div class="grid grid-cols-2 gap-2.5 my-3">
                  
                  <!-- Metric 1: Exact Number of Occurrences -->
                  <div class="bg-[#F8FAFD] p-2.5 rounded-xl border border-[#E0E2EC]/70 flex flex-col justify-between">
                    <div class="flex items-center justify-between text-[11px] text-[#747775]">
                      <span class="font-semibold uppercase tracking-wider">Occurrences</span>
                      <mat-icon class="text-xs text-[#1A73E8]">tag</mat-icon>
                    </div>
                    <div class="flex items-baseline gap-1.5 mt-1">
                      <span class="font-display font-bold text-xl text-[#1F1F1F] font-mono">
                        {{ detail.occurrences }}
                      </span>
                      <span class="text-[11px] text-[#747775]">
                        in {{ detail.relatedQuestionCount }} {{ detail.relatedQuestionCount === 1 ? 'question' : 'questions' }}
                      </span>
                    </div>
                    <div class="text-[10px] text-[#747775] mt-1 flex items-center gap-1 font-medium">
                      <mat-icon class="text-[11px] text-[#B06000]">thumb_up</mat-icon>
                      <span>{{ detail.totalUpvotes }} total upvotes</span>
                    </div>
                  </div>

                  <!-- Metric 2: Sentiment Score of Related Questions -->
                  <div class="bg-[#F8FAFD] p-2.5 rounded-xl border border-[#E0E2EC]/70 flex flex-col justify-between">
                    <div class="flex items-center justify-between text-[11px] text-[#747775]">
                      <span class="font-semibold uppercase tracking-wider">Sentiment Score</span>
                      <mat-icon class="text-xs" [style.color]="detail.sentimentColor">sentiment_satisfied_alt</mat-icon>
                    </div>
                    <div class="flex items-baseline gap-1.5 mt-1">
                      <span class="font-display font-bold text-xl font-mono" [style.color]="detail.sentimentColor">
                        {{ detail.sentimentFormatted }}
                      </span>
                      <span
                        class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        [style.color]="detail.sentimentColor"
                        [style.background-color]="detail.sentimentBg"
                      >
                        {{ detail.sentimentLabel }}
                      </span>
                    </div>
                    
                    <!-- Sentiment Polarity Meter -->
                    <div class="mt-1.5">
                      <div class="w-full h-1.5 bg-[#E0E2EC] rounded-full overflow-hidden flex">
                        <div class="bg-[#1E8E3E] h-full" [style.width.%]="detail.positivePct" title="Positive: {{ detail.positivePct }}%"></div>
                        <div class="bg-[#F9AB00] h-full" [style.width.%]="detail.neutralPct" title="Neutral: {{ detail.neutralPct }}%"></div>
                        <div class="bg-[#D93025] h-full" [style.width.%]="detail.criticalPct" title="Critical: {{ detail.criticalPct }}%"></div>
                      </div>
                      <div class="flex items-center justify-between text-[9px] text-[#747775] mt-0.5 font-mono">
                        <span class="text-[#137333]">{{ detail.positivePct }}% pos</span>
                        <span class="text-[#B06000]">{{ detail.neutralPct }}% neu</span>
                        <span class="text-[#D93025]">{{ detail.criticalPct }}% crit</span>
                      </div>
                    </div>
                  </div>

                </div>

                <!-- Related Question Excerpts with Question-Level Sentiment -->
                @if (detail.sampleQuestions.length > 0) {
                  <div class="mb-3 space-y-1.5">
                    <div class="flex items-center justify-between text-[10px] uppercase font-bold text-[#747775] tracking-wider">
                      <span>Related Inquiries:</span>
                      <span>Polarity</span>
                    </div>
                    @for (sq of detail.sampleQuestions; track sq.id) {
                      <div class="bg-[#F8F9FA] p-2 rounded-xl border border-[#E0E2EC]/70 text-xs hover:bg-[#F1F4F9] transition-colors">
                        <p class="text-[#1F1F1F] font-medium line-clamp-2 leading-relaxed">
                          "{{ sq.content }}"
                        </p>
                        <div class="flex items-center justify-between mt-1.5 text-[10px] text-[#747775]">
                          <span class="flex items-center gap-1">
                            <span class="font-semibold text-[#444746]">{{ sq.authorName }}</span>
                            <span>·</span>
                            <span class="flex items-center gap-0.5 text-[#B06000]">
                              <mat-icon class="text-[10px]">thumb_up</mat-icon>
                              {{ sq.upvotes }}
                            </span>
                          </span>
                          <span
                            class="px-1.5 py-0.5 rounded font-mono font-bold text-[9.5px]"
                            [style.color]="sq.sentimentColor"
                            [style.background-color]="sq.sentimentBg"
                          >
                            {{ sq.sentimentScore > 0 ? '+' : '' }}{{ sq.sentimentScore }} {{ sq.sentimentLabel }}
                          </span>
                        </div>
                      </div>
                    }
                  </div>
                }

                <!-- Footer Action: Filter Feed -->
                <div class="flex items-center justify-between pt-2 border-t border-[#E0E2EC]/70">
                  <span class="text-[11px] text-[#747775] flex items-center gap-1 truncate max-w-[170px]">
                    <mat-icon class="text-xs text-[#1A73E8]">filter_list</mat-icon>
                    Click to filter feed
                  </span>
                  <button
                    type="button"
                    id="btn-filter-feed-by-word"
                    (click)="filterByWord(detail.text)"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1A73E8] text-white hover:bg-[#185ABC] transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <span>Filter Feed</span>
                    <mat-icon class="text-xs">arrow_forward</mat-icon>
                  </button>
                </div>
              </div>
            }
          </div>

          <!-- Bottom Trending Quick Tags Bar -->
          <div class="mt-4 flex items-center gap-2 flex-wrap text-xs">
            <div class="flex items-center gap-1 text-[#747775] font-semibold text-[11px] uppercase tracking-wider mr-1">
              <mat-icon class="text-sm text-[#1A73E8]">trending_up</mat-icon>
              <span>Hot Topics:</span>
            </div>
            @for (w of topTokens(); track w.text; let i = $index) {
              @let wDetail = getWordDetail(w.text, w.count);
              <button
                type="button"
                (mouseenter)="setHoveredWordText(w.text, w.count)"
                (mouseleave)="onWordMouseLeave()"
                (click)="filterByWord(w.text)"
                class="px-3 py-1 rounded-xl bg-[#F8F9FA] hover:bg-[#E8F0FE] text-[#1F1F1F] hover:text-[#1A73E8] font-medium border border-[#E0E2EC] hover:border-[#D2E3FC] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs group"
                title="{{ w.text }}: {{ w.count }} occurrences | Sentiment: {{ wDetail.sentimentFormatted }} ({{ wDetail.sentimentLabel }})"
              >
                <span class="w-2 h-2 rounded-full" [style.background-color]="getPaletteColor(i)"></span>
                <span class="font-semibold">{{ w.text }}</span>
                <span class="text-[10px] text-[#747775] font-mono group-hover:text-[#1A73E8]">({{ w.count }})</span>
                <span
                  class="w-1.5 h-1.5 rounded-full"
                  [style.background-color]="wDetail.sentimentColor"
                  title="Sentiment: {{ wDetail.sentimentFormatted }}"
                ></span>
              </button>
            }
          </div>

        </div>

        <!-- Right: Topic Distribution & Audience Intelligence (4 cols) -->
        <div class="lg:col-span-4 space-y-6">
          
          <!-- Topic Distribution Card -->
          <div class="bg-white rounded-2xl p-5 border border-[#E0E2EC] shadow-xs hover:border-[#1A73E8]/30 transition-all">
            <div class="flex items-center justify-between pb-3 border-b border-[#E0E2EC] mb-4">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center">
                  <mat-icon class="text-base">pie_chart</mat-icon>
                </div>
                <h3 class="font-display font-bold text-sm text-[#1F1F1F]">Topic Distribution</h3>
              </div>
              <span class="text-xs text-[#747775] font-mono">{{ qaService.questions().length }} Inquiries</span>
            </div>

            <div class="space-y-3.5">
              @for (topic of topicPercentages(); track topic.name) {
                <div>
                  <div class="flex items-center justify-between text-xs mb-1.5">
                    <span class="font-semibold text-[#1F1F1F] flex items-center gap-1.5">
                      <span class="w-2.5 h-2.5 rounded-full" [style.background-color]="topic.color"></span>
                      {{ topic.name }}
                    </span>
                    <span class="font-mono text-[#747775] font-semibold">{{ topic.count }} ({{ topic.percentage }}%)</span>
                  </div>
                  <div class="w-full h-2 bg-[#F1F3F4] rounded-full overflow-hidden p-0.5">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      [style.width.%]="topic.percentage"
                      [style.background-color]="topic.color"
                    ></div>
                  </div>
                </div>
              } @empty {
                <p class="text-xs text-[#747775] text-center py-6">No categorized questions yet.</p>
              }
            </div>
          </div>

          <!-- Audience Interaction Health Card -->
          <div class="bg-white rounded-2xl p-5 border border-[#E0E2EC] shadow-xs space-y-3.5">
            <div class="flex items-center gap-2 pb-3 border-b border-[#E0E2EC]">
              <div class="w-7 h-7 rounded-lg bg-[#E6F4EA] text-[#1E8E3E] flex items-center justify-center">
                <mat-icon class="text-base">health_and_safety</mat-icon>
              </div>
              <div>
                <h3 class="font-display font-bold text-sm text-[#1F1F1F]">AI &amp; Moderation Health</h3>
                <p class="text-[11px] text-[#747775]">Live pipeline status &amp; clustering</p>
              </div>
            </div>

            <div class="text-xs space-y-3">
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC]/60">
                <span class="text-[#444746] flex items-center gap-1.5">
                  <mat-icon class="text-sm text-[#1A73E8]">auto_awesome</mat-icon>
                  Two-Line AI Synthesized:
                </span>
                <span class="font-bold text-[#1F1F1F]">{{ aiAnsweredCount() }} / {{ qaService.questions().length }}</span>
              </div>

              <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC]/60">
                <span class="text-[#444746] flex items-center gap-1.5">
                  <mat-icon class="text-sm text-[#1E8E3E]">percent</mat-icon>
                  AI Coverage Ratio:
                </span>
                <span class="font-mono font-bold text-[#1E8E3E]">{{ aiRatio() }}%</span>
              </div>

              <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC]/60">
                <span class="text-[#444746] flex items-center gap-1.5">
                  <mat-icon class="text-sm text-[#B06000]">merge_type</mat-icon>
                  Semantic Clustered Queries:
                </span>
                <span class="font-bold text-[#B06000]">{{ clusteredCount() }}</span>
              </div>

              <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC]/60">
                <span class="text-[#444746] flex items-center gap-1.5">
                  <mat-icon class="text-sm text-[#1E8E3E]">shield</mat-icon>
                  Automated Spam Guard:
                </span>
                <span class="font-bold text-[#1E8E3E]">Active (Live)</span>
              </div>
            </div>

            <button
              id="btn-goto-teleprompter-from-analytics"
              type="button"
              (click)="qaService.activeTab.set('teleprompter')"
              class="w-full mt-2 py-2.5 px-3 rounded-xl text-xs font-semibold bg-[#E8F0FE] text-[#1A73E8] hover:bg-[#D2E3FC] transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <mat-icon class="text-sm">live_tv</mat-icon>
              <span>Open Presenter Teleprompter</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  `,
})
export class WordCloudAnalytics implements AfterViewInit, OnDestroy {
  public qaService = inject(QaService);
  public canvasWrapper = viewChild<ElementRef<HTMLDivElement>>('canvasWrapper');

  // Math reference for template bindings
  public Math = Math;

  // View state
  public viewMode = signal<WordCloudViewMode>('cloud');
  public searchFilter = signal<string>('');
  public minThreshold = signal<number>(1);
  public hoveredWordDetail = signal<WordAnalyticsDetail | null>(null);
  public keepTooltipOpen = false;

  // Frequency change tracking for dynamic transition animations
  public previousWordCounts = new Map<string, number>();
  public surgingWords = signal<Map<string, { delta: number; count: number; timestamp: number }>>(new Map());
  public lastSurgeNotice = signal<{ word: string; count: number; delta: number; isNew: boolean } | null>(null);
  public isInjectingData = signal<boolean>(false);
  private surgeClearTimeout: ReturnType<typeof setTimeout> | null = null;

  private leaveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Responsive SVG bounds
  public containerWidth = signal<number>(750);
  public containerHeight = signal<number>(430);

  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    // Reactive tracker for word frequency changes and surge animations
    effect(() => {
      const currentTokens = this.qaService.wordCloudData();
      if (!currentTokens || currentTokens.length === 0) return;

      const newSurges = new Map(this.surgingWords());
      let topSurge: { word: string; count: number; delta: number; isNew: boolean } | null = null;
      let hasChange = false;

      currentTokens.forEach(t => {
        if (this.previousWordCounts.has(t.text)) {
          const prev = this.previousWordCounts.get(t.text)!;
          if (t.count > prev) {
            const delta = t.count - prev;
            newSurges.set(t.text, { delta, count: t.count, timestamp: Date.now() });
            hasChange = true;
            if (!topSurge || delta > topSurge.delta) {
              topSurge = { word: t.text, count: t.count, delta, isNew: false };
            }
          }
        } else if (this.previousWordCounts.size > 0) {
          // Newly arrived token
          newSurges.set(t.text, { delta: t.count, count: t.count, timestamp: Date.now() });
          hasChange = true;
          if (!topSurge) {
            topSurge = { word: t.text, count: t.count, delta: t.count, isNew: true };
          }
        }
        this.previousWordCounts.set(t.text, t.count);
      });

      if (hasChange) {
        this.surgingWords.set(newSurges);
        if (topSurge) {
          this.lastSurgeNotice.set(topSurge);
        }

        // Auto-clear surge state after transition completes (3500ms)
        if (this.surgeClearTimeout) clearTimeout(this.surgeClearTimeout);
        this.surgeClearTimeout = setTimeout(() => {
          this.surgingWords.set(new Map());
          this.lastSurgeNotice.set(null);
        }, 3500);
      } else if (this.previousWordCounts.size === 0) {
        // Initial populate
        currentTokens.forEach(t => this.previousWordCounts.set(t.text, t.count));
      }
    });
  }

  // Curated Enterprise Color Palette matching Google Material tones
  private palette = [
    { color: '#1A73E8', bg: '#E8F0FE', border: '#D2E3FC' }, // Google Blue
    { color: '#1E8E3E', bg: '#E6F4EA', border: '#CEEAD6' }, // Google Green
    { color: '#B06000', bg: '#FEF7E0', border: '#FEEFC3' }, // Amber / Gold
    { color: '#D93025', bg: '#FCE8E6', border: '#FAD2CF' }, // Coral / Red
    { color: '#9334E6', bg: '#F3E8FD', border: '#E9D2FD' }, // Violet
    { color: '#007B83', bg: '#E0F2F1', border: '#B2DFDB' }, // Teal
    { color: '#E37400', bg: '#FEEFE3', border: '#FED7B0' }, // Deep Orange
    { color: '#185ABC', bg: '#E8F0FE', border: '#C2E7FF' }, // Navy Blue
  ];

  public telemetry = computed(() => this.qaService.telemetry());

  public totalUpvotesFallback = computed(() => {
    return this.qaService.questions().reduce((acc, q) => acc + q.upvotes, 0);
  });

  public sentimentScore = computed(() => {
    return this.telemetry()?.sentimentPolarity ?? 0.45;
  });

  public sentimentFormatted = computed(() => {
    const s = this.sentimentScore();
    return (s > 0 ? '+' : '') + s.toFixed(2);
  });

  public sentimentLabel = computed(() => {
    const s = this.sentimentScore();
    if (s >= 0.2) return 'Positive';
    if (s <= -0.2) return 'Critical';
    return 'Neutral';
  });

  public activeWordDetail = computed(() => {
    return this.hoveredWordDetail();
  });

  public aiAnsweredCount = computed(() => {
    return this.qaService.questions().filter(q => q.aiLine1 && q.aiStatus === 'READY').length;
  });

  public aiRatio = computed(() => {
    const total = this.qaService.questions().length;
    if (total === 0) return 0;
    return Math.round((this.aiAnsweredCount() / total) * 100);
  });

  public clusteredCount = computed(() => {
    return this.qaService.questions().reduce((acc, q) => acc + (q.clusterCount || 0), 0);
  });

  public filteredWords = computed(() => {
    const rawTokens = this.qaService.wordCloudData();
    const min = this.minThreshold();
    const query = this.searchFilter().toLowerCase().trim();

    return rawTokens.filter(t => {
      if (t.count < min) return false;
      if (query && !t.text.toLowerCase().includes(query)) return false;
      return true;
    });
  });

  public topTokens = computed(() => {
    return this.qaService.wordCloudData().slice(0, 8);
  });

  public topicPercentages = computed(() => {
    const questions = this.qaService.questions();
    if (questions.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const q of questions) {
      const cat = q.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    }

    const colors = ['#1A73E8', '#1E8E3E', '#F9AB00', '#D93025', '#9334E6', '#007B83'];
    let idx = 0;
    return Object.entries(counts).map(([name, count]) => {
      const percentage = Math.round((count / questions.length) * 100);
      const color = colors[idx % colors.length];
      idx++;
      return { name, count, percentage, color };
    });
  });

  public getPaletteColor(index: number): string {
    return this.palette[index % this.palette.length].color;
  }

  public getWordPercentage(count: number): number {
    const tokens = this.qaService.wordCloudData();
    if (tokens.length === 0) return 0;
    const max = Math.max(...tokens.map(t => t.count), 1);
    return Math.round((count / max) * 100);
  }

  // --- Dynamic Word Analytics Detail Generator with Exact Occurrences & Sentiment ---
  public getWordDetail(text: string, fallbackCount?: number): WordAnalyticsDetail {
    const textLower = text.toLowerCase();
    const questions = this.qaService.questions();
    const matchingQ = questions.filter(q =>
      q.content.toLowerCase().includes(textLower)
    );

    const occurrences = fallbackCount ?? matchingQ.length ?? 1;
    const relatedCount = matchingQ.length || 1;

    let totalSentiment = 0;
    let posCount = 0;
    let neuCount = 0;
    let critCount = 0;
    let totalUpvotes = 0;

    if (matchingQ.length > 0) {
      for (const q of matchingQ) {
        const s = q.sentimentScore !== undefined ? q.sentimentScore : this.estimateQuestionSentiment(q.content);
        totalSentiment += s;
        if (s >= 0.2) posCount++;
        else if (s <= -0.2) critCount++;
        else neuCount++;
        totalUpvotes += q.upvotes;
      }
    } else {
      const s = this.estimateQuestionSentiment(text);
      totalSentiment = s;
      if (s >= 0.2) posCount = 1;
      else if (s <= -0.2) critCount = 1;
      else neuCount = 1;
    }

    const avgSentiment = matchingQ.length > 0 ? (totalSentiment / matchingQ.length) : totalSentiment;
    const roundedSentiment = Math.round(avgSentiment * 100) / 100;
    const totalEvaluated = posCount + neuCount + critCount || 1;

    let label: 'Positive' | 'Neutral' | 'Critical' = 'Neutral';
    let color = '#B06000';
    let bg = '#FEF7E0';
    let border = '#FEEFC3';

    if (roundedSentiment >= 0.2) {
      label = 'Positive';
      color = '#137333';
      bg = '#E6F4EA';
      border = '#CEEAD6';
    } else if (roundedSentiment <= -0.2) {
      label = 'Critical';
      color = '#D93025';
      bg = '#FCE8E6';
      border = '#FAD2CF';
    }

    const sortedQuestions = [...matchingQ].sort((a, b) => b.upvotes - a.upvotes);
    const sampleQuestions = sortedQuestions.slice(0, 2).map(q => {
      const qSentiment = q.sentimentScore !== undefined ? q.sentimentScore : this.estimateQuestionSentiment(q.content);
      const isPos = qSentiment >= 0.2;
      const isCrit = qSentiment <= -0.2;
      return {
        id: q.id,
        authorName: q.authorName || (q.isAnonymous ? 'Anonymous' : 'Attendee'),
        content: q.content,
        upvotes: q.upvotes,
        sentimentScore: Math.round(qSentiment * 100) / 100,
        sentimentLabel: isPos ? 'Positive' : isCrit ? 'Critical' : 'Neutral',
        sentimentColor: isPos ? '#137333' : isCrit ? '#D93025' : '#B06000',
        sentimentBg: isPos ? '#E6F4EA' : isCrit ? '#FCE8E6' : '#FEF7E0',
      };
    });

    const category = sortedQuestions[0]?.category || 'General';

    return {
      text,
      occurrences,
      relatedQuestionCount: relatedCount,
      sentimentScore: roundedSentiment,
      sentimentFormatted: (roundedSentiment > 0 ? '+' : '') + roundedSentiment.toFixed(2),
      sentimentLabel: label,
      sentimentColor: color,
      sentimentBg: bg,
      sentimentBorder: border,
      positiveCount: posCount,
      neutralCount: neuCount,
      criticalCount: critCount,
      positivePct: Math.round((posCount / totalEvaluated) * 100),
      neutralPct: Math.round((neuCount / totalEvaluated) * 100),
      criticalPct: Math.round((critCount / totalEvaluated) * 100),
      totalUpvotes,
      category,
      sampleQuestions,
    };
  }

  private estimateQuestionSentiment(text: string): number {
    const lower = text.toLowerCase();
    const pos = ['great', 'awesome', 'love', 'best', 'excellent', 'fast', 'seamless', 'good', 'benefit', 'helpful', 'excited', 'innovative', 'perfect', 'reliable', 'scalable'];
    const neg = ['broken', 'fail', 'bad', 'terrible', 'slow', 'wrong', 'issue', 'bug', 'crash', 'problem', 'difficult', 'risk', 'flaw', 'cannot', 'error', 'scam'];
    let score = 0.35;
    for (const w of pos) { if (lower.includes(w)) score += 0.2; }
    for (const w of neg) { if (lower.includes(w)) score -= 0.35; }
    return Math.max(-1, Math.min(1, Math.round(score * 100) / 100));
  }

  // --- Tooltip Interaction Handlers ---
  public setHoveredPlacedWord(item: PlacedWord): void {
    if (this.leaveTimeout) {
      clearTimeout(this.leaveTimeout);
      this.leaveTimeout = null;
    }
    const detail = this.getWordDetail(item.text, item.count);
    this.hoveredWordDetail.set(detail);
  }

  public setHoveredBubble(bubble: BubbleWord): void {
    if (this.leaveTimeout) {
      clearTimeout(this.leaveTimeout);
      this.leaveTimeout = null;
    }
    const detail = this.getWordDetail(bubble.text, bubble.count);
    this.hoveredWordDetail.set(detail);
  }

  public setHoveredWordText(text: string, count?: number): void {
    if (this.leaveTimeout) {
      clearTimeout(this.leaveTimeout);
      this.leaveTimeout = null;
    }
    const detail = this.getWordDetail(text, count);
    this.hoveredWordDetail.set(detail);
  }

  public onWordMouseLeave(): void {
    if (this.leaveTimeout) clearTimeout(this.leaveTimeout);
    this.leaveTimeout = setTimeout(() => {
      if (!this.keepTooltipOpen) {
        this.hoveredWordDetail.set(null);
      }
    }, 250);
  }

  public onTooltipMouseLeave(): void {
    if (this.leaveTimeout) clearTimeout(this.leaveTimeout);
    this.leaveTimeout = setTimeout(() => {
      this.hoveredWordDetail.set(null);
    }, 200);
  }

  // --- Archimedean Elliptical Spiral Word Cloud Layout Engine ---
  public placedWords = computed<PlacedWord[]>(() => {
    const tokens = this.filteredWords();
    if (!tokens || tokens.length === 0) return [];

    const w = this.containerWidth();
    const h = this.containerHeight();
    const centerX = w / 2;
    const centerY = h / 2;

    const minFont = 13;
    const maxFont = 34;
    const fMin = Math.min(...tokens.map(t => t.count));
    const fMax = Math.max(...tokens.map(t => t.count));
    const fSpread = fMax - fMin || 1;

    const surgeMap = this.surgingWords();
    const result: PlacedWord[] = [];
    const occupiedBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];

    tokens.slice(0, 36).forEach((token, index) => {
      const detail = this.getWordDetail(token.text, token.count);
      const normalizedRatio = Math.sqrt((token.count - fMin) / fSpread);
      const fontSize = Math.round(minFont + normalizedRatio * (maxFont - minFont));
      const isDominant = index < 3 || token.count >= fMax;
      const theme = this.palette[index % this.palette.length];

      // Surge and delta tracking for smooth transition animations
      const surge = surgeMap.get(token.text);
      const isSurging = !!surge;
      const frequencyDelta = surge?.delta ?? 0;
      const isNew = isSurging && (token.count === frequencyDelta);
      const previousCount = (this.previousWordCounts.get(token.text) ?? token.count) - frequencyDelta;

      // Pill dimensions including count badge space
      const textWidth = token.text.length * (fontSize * 0.56);
      const pillWidth = Math.max(70, textWidth + 36);
      const pillHeight = fontSize + 16;

      // Archimedean Spiral Parameters
      const a = 6;
      const b = 5.2;
      let theta = index * 1.7;
      let posX = centerX;
      let posY = centerY;
      let found = false;

      for (let step = 0; step < 140; step++) {
        const r = a + b * theta;
        posX = centerX + r * Math.cos(theta) * 1.45; // wide aspect ratio compensation
        posY = centerY + r * Math.sin(theta) * 0.85;

        const box = {
          x1: posX - pillWidth / 2 - 4,
          y1: posY - pillHeight / 2 - 4,
          x2: posX + pillWidth / 2 + 4,
          y2: posY + pillHeight / 2 + 4,
        };

        // Boundary constraint check
        if (box.x1 >= 14 && box.x2 <= w - 14 && box.y1 >= 14 && box.y2 <= h - 14) {
          const collides = occupiedBoxes.some(
            b => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
          );
          if (!collides) {
            occupiedBoxes.push(box);
            found = true;
            break;
          }
        }
        theta += 0.32;
      }

      if (found) {
        result.push({
          text: token.text,
          count: token.count,
          fontSize,
          color: isDominant ? theme.color : '#1F1F1F',
          bgColor: isDominant ? theme.bg : '#FFFFFF',
          borderColor: isDominant ? theme.border : '#E0E2EC',
          x: Math.round(posX),
          y: Math.round(posY),
          width: Math.round(pillWidth),
          height: Math.round(pillHeight),
          isDominant,
          frequencyDelta,
          isNew,
          isSurging,
          previousCount,
          category: detail.category,
          relatedQuestionCount: detail.relatedQuestionCount,
          sentimentScore: detail.sentimentScore,
          sentimentFormatted: detail.sentimentFormatted,
          sentimentLabel: detail.sentimentLabel,
          sentimentColor: detail.sentimentColor,
          sentimentBg: detail.sentimentBg,
          sampleQuestion: detail.sampleQuestions[0]?.content,
        });
      }
    });

    return result;
  });

  // --- Packed Thematic Bubble Cluster Engine ---
  public bubbleWords = computed<BubbleWord[]>(() => {
    const tokens = this.filteredWords();
    if (!tokens || tokens.length === 0) return [];

    const w = this.containerWidth();
    const h = this.containerHeight();
    const centerX = w / 2;
    const centerY = h / 2;

    const fMin = Math.min(...tokens.map(t => t.count));
    const fMax = Math.max(...tokens.map(t => t.count));
    const fSpread = fMax - fMin || 1;

    const surgeMap = this.surgingWords();
    const bubbles: BubbleWord[] = [];

    tokens.slice(0, 24).forEach((token, index) => {
      const detail = this.getWordDetail(token.text, token.count);
      const ratio = (token.count - fMin) / fSpread;
      const radius = Math.round(22 + ratio * 28);
      const theme = this.palette[index % this.palette.length];

      // Surge and delta tracking for smooth transition animations
      const surge = surgeMap.get(token.text);
      const isSurging = !!surge;
      const frequencyDelta = surge?.delta ?? 0;
      const isNew = isSurging && (token.count === frequencyDelta);
      const previousCount = (this.previousWordCounts.get(token.text) ?? token.count) - frequencyDelta;

      // Radial placement with collision push
      const angle = index * (Math.PI * 2 / Math.min(tokens.length, 24)) + (index % 2 * 0.4);
      const dist = 40 + (index * 12);

      const x = Math.max(radius + 10, Math.min(w - radius - 10, centerX + Math.cos(angle) * dist * 1.2));
      const y = Math.max(radius + 10, Math.min(h - radius - 10, centerY + Math.sin(angle) * dist * 0.75));

      bubbles.push({
        text: token.text,
        count: token.count,
        radius,
        color: theme.color,
        fillColor: theme.bg,
        borderColor: theme.border,
        x: Math.round(x),
        y: Math.round(y),
        frequencyDelta,
        isNew,
        isSurging,
        previousCount,
        category: detail.category,
        relatedQuestionCount: detail.relatedQuestionCount,
        sentimentScore: detail.sentimentScore,
        sentimentFormatted: detail.sentimentFormatted,
        sentimentLabel: detail.sentimentLabel,
        sentimentColor: detail.sentimentColor,
        sentimentBg: detail.sentimentBg,
        sampleQuestion: detail.sampleQuestions[0]?.content,
      });
    });

    return bubbles;
  });

  public getSurgeInfo(word: string): { isSurging: boolean; delta: number } {
    const s = this.surgingWords().get(word);
    return { isSurging: !!s, delta: s?.delta ?? 0 };
  }

  // --- Simulate Real-Time Attendee Influx to showcase smooth frequency morphing ---
  public async injectSampleData(): Promise<void> {
    if (this.isInjectingData()) return;
    this.isInjectingData.set(true);

    const sampleInquiries = [
      {
        content: 'How does real-time streaming scale latency and performance across distributed microservices?',
        category: 'Architecture',
      },
      {
        content: 'What are best practices for secure token authentication with OAuth and Firestore?',
        category: 'Security',
      },
      {
        content: 'Can we optimize vector embeddings with Gemini 2.5 Pro for semantic search and topic clusters?',
        category: 'AI & ML',
      },
      {
        content: 'How do we handle WebSocket failover and automatic cluster reconnects under high attendee load?',
        category: 'Performance',
      },
      {
        content: 'What is the deployment strategy for Cloud Run containers with zero downtime rollback?',
        category: 'DevOps',
      },
    ];

    try {
      const randomInquiry = sampleInquiries[Math.floor(Math.random() * sampleInquiries.length)];
      await this.qaService.submitQuestion(randomInquiry.content, randomInquiry.category, false);
      await this.qaService.refreshSessionData(true);
    } catch (err) {
      console.warn('Influx simulation notice:', err);
    } finally {
      setTimeout(() => {
        this.isInjectingData.set(false);
      }, 600);
    }
  }

  public ngAfterViewInit(): void {
    const el = this.canvasWrapper()?.nativeElement;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const width = Math.floor(entry.contentRect.width);
          const height = Math.floor(entry.contentRect.height);
          if (width > 0) this.containerWidth.set(width);
          if (height > 0) this.containerHeight.set(height);
        }
      });
      this.resizeObserver.observe(el);
    }
  }

  public ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.leaveTimeout) {
      clearTimeout(this.leaveTimeout);
    }
    if (this.surgeClearTimeout) {
      clearTimeout(this.surgeClearTimeout);
    }
  }

  public onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value || '';
    this.searchFilter.set(val);
  }

  public filterByWord(word: string): void {
    this.qaService.searchQuery.set(word);
    this.qaService.activeTab.set('feed');
  }
}
