import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QaService } from '../services/qa.service';
import { QuestionCard } from './question-card';

@Component({
  selector: 'app-question-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule, QuestionCard],
  template: `
    <div class="space-y-6">
      
      <!-- Live Spotlight Banner if a question is currently being answered -->
      @if (activeAnsweringQuestion(); as liveQ) {
        <div class="bg-gradient-to-r from-[#1A73E8] to-[#185ABC] rounded-2xl p-5 text-white shadow-md border border-[#D2E3FC]/30 flex items-start gap-4">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <mat-icon class="text-white text-2xl animate-pulse">mic</mat-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2 py-0.5 rounded bg-white/20 text-white font-mono text-[10px] font-bold tracking-wider uppercase">
                Now Answering Live
              </span>
              <span class="text-white/80 text-xs font-medium">{{ liveQ.authorName }}</span>
            </div>
            <p class="font-display font-semibold text-base sm:text-lg text-white leading-snug">
              "{{ liveQ.content }}"
            </p>
          </div>
        </div>
      }

      <!-- Question Submission Card (or Host Intelligence Header if Host/Staff) -->
      <div id="submit-question-container" class="bg-white rounded-2xl p-5 sm:p-6 border border-[#E0E2EC] shadow-xs transition-all">
        @if (qaService.isStaff()) {
          <!-- Host & Organizer Stage View (No forced question asking - Questions, RAG, and Upvotes prioritized) -->
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <mat-icon class="text-2xl">admin_panel_settings</mat-icon>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="font-display font-bold text-base text-[#1F1F1F]">
                    Live Q&amp;A &amp; RAG Monitor
                  </h2>
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                    {{ qaService.userRole() === 'organizer' ? 'Host & Organizer' : qaService.userRole() === 'speaker' ? 'Speaker Stage' : 'Moderator' }}
                  </span>
                </div>
                <p class="text-xs text-[#747775] mt-0.5">
                  Review audience inquiries, verify Gemini RAG responses grounded on speaker notes, and prioritize upvoted topics.
                </p>
              </div>
            </div>

            <!-- Host Fast-Access Stats & Actions -->
            <div class="flex items-center gap-2 sm:gap-2.5 flex-wrap ml-auto">
              <!-- Total Questions -->
              <button
                type="button"
                (click)="qaService.filterStatus.set('ALL')"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8F9FA] border border-[#E0E2EC] text-xs font-semibold text-[#1F1F1F] hover:bg-[#F1F3F4] transition-colors cursor-pointer"
                title="View all audience questions"
              >
                <mat-icon class="text-sm text-indigo-600">forum</mat-icon>
                <span>{{ qaService.questions().length }} Questions</span>
              </button>

              <!-- RAG Grounded Answers -->
              <button
                type="button"
                (click)="qaService.filterStatus.set('AI_ANSWERED')"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer"
                [class.bg-[#E8F0FE]]="qaService.filterStatus() === 'AI_ANSWERED'"
                [class.border-[#1A73E8]]="qaService.filterStatus() === 'AI_ANSWERED'"
                [class.text-[#1A73E8]]="qaService.filterStatus() === 'AI_ANSWERED'"
                [class.bg-[#F8F9FA]]="qaService.filterStatus() !== 'AI_ANSWERED'"
                [class.border-[#E0E2EC]]="qaService.filterStatus() !== 'AI_ANSWERED'"
                [class.text-[#1A73E8]]="qaService.filterStatus() !== 'AI_ANSWERED'"
                title="Filter questions with ready RAG answers"
              >
                <mat-icon class="text-sm">auto_awesome</mat-icon>
                <span>{{ totalGroundedAnswers() }} RAG Answers</span>
              </button>

              <!-- Upvotes Counter & Sort -->
              <button
                type="button"
                (click)="qaService.sortBy.set('top')"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer"
                [class.bg-[#FEF7E0]]="qaService.sortBy() === 'top'"
                [class.border-[#FEEFC3]]="qaService.sortBy() === 'top'"
                [class.text-[#B06000]]="qaService.sortBy() === 'top'"
                [class.bg-[#F8F9FA]]="qaService.sortBy() !== 'top'"
                [class.border-[#E0E2EC]]="qaService.sortBy() !== 'top'"
                [class.text-[#B06000]]="qaService.sortBy() !== 'top'"
                title="Sort by highest upvotes"
              >
                <mat-icon class="text-sm text-[#E37400]">thumb_up</mat-icon>
                <span>{{ totalUpvotes() }} Upvotes</span>
              </button>

              <!-- Optional Seed / Ask Question Toggle -->
              <button
                id="btn-toggle-host-submit"
                type="button"
                (click)="showHostSubmitForm.set(!showHostSubmitForm())"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors"
                title="Optionally seed a question as host"
              >
                <mat-icon class="text-sm">{{ showHostSubmitForm() ? 'expand_less' : 'add_circle_outline' }}</mat-icon>
                <span>{{ showHostSubmitForm() ? 'Close Composer' : '+ Seed Question' }}</span>
              </button>
            </div>
          </div>

          <!-- Collapsible Composer for Host (only when explicitly opened) -->
          @if (showHostSubmitForm()) {
            <div class="mt-4 pt-4 border-t border-[#E0E2EC]">
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-xs font-semibold text-slate-700">Host / Organizer Question Composer</span>
                <span class="text-xs text-[#747775] font-mono">{{ remainingChars() }} chars left</span>
              </div>
              <form [formGroup]="questionForm" (ngSubmit)="onSubmitQuestion()" class="space-y-3">
                <div class="relative">
                  <textarea
                    id="input-question-content-host"
                    formControlName="content"
                    rows="3"
                    placeholder="Type an announcement or seed a discussion prompt for the audience..."
                    class="w-full p-3.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white focus:ring-2 focus:ring-[#D2E3FC] rounded-xl text-sm sm:text-base text-[#1F1F1F] placeholder:text-[#8E918F] outline-none resize-none transition-all"
                    maxlength="400"
                    (input)="updateRemainingChars()"
                  ></textarea>
                </div>

                <div class="flex items-center justify-between gap-3 flex-wrap pt-1">
                  <div class="flex items-center gap-3 flex-wrap">
                    @if (qaService.segments().length > 0) {
                      <div class="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200/60">
                        <mat-icon class="text-sm text-indigo-600">record_voice_over</mat-icon>
                        <span class="font-semibold">Speaker:</span>
                        <select
                          id="select-target-segment-host"
                          formControlName="segmentId"
                          class="bg-white border border-indigo-200 rounded-md px-2 py-0.5 text-xs font-semibold text-indigo-900 outline-none cursor-pointer"
                        >
                          @for (seg of qaService.segments(); track seg.id) {
                            <option [value]="seg.id">
                              {{ seg.speakerName }} ({{ seg.status === 'LIVE' ? '★ LIVE NOW' : seg.status }})
                            </option>
                          }
                        </select>
                      </div>
                    }

                    <div class="flex items-center gap-1.5 text-xs text-[#444746]">
                      <mat-icon class="text-base text-[#747775]">category</mat-icon>
                      <select
                        id="select-category-host"
                        formControlName="category"
                        class="bg-[#F8F9FA] border border-[#E0E2EC] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1F1F1F] outline-none cursor-pointer"
                      >
                        <option value="General">General</option>
                        @for (cat of currentCategories(); track cat) {
                          @if (cat !== 'General') {
                            <option [value]="cat">{{ cat }}</option>
                          }
                        }
                      </select>
                    </div>
                  </div>

                  <button
                    id="btn-submit-question-host"
                    type="submit"
                    [disabled]="questionForm.invalid || isSubmitting()"
                    class="px-5 py-2 rounded-xl font-display font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
                  >
                    @if (isSubmitting()) {
                      <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Posting...</span>
                    } @else {
                      <mat-icon class="text-base">send</mat-icon>
                      <span>Post as Host</span>
                    }
                  </button>
                </div>
              </form>
            </div>
          }
        } @else {
          <!-- Attendee Question Submission Card -->
          <div class="flex items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center">
                <mat-icon class="text-lg">edit_note</mat-icon>
              </div>
              <h2 class="font-display font-bold text-base text-[#1F1F1F]">Ask the Speaker</h2>
            </div>
            <span class="text-xs text-[#747775] font-mono">
              {{ remainingChars() }} chars left
            </span>
          </div>

          <form [formGroup]="questionForm" (ngSubmit)="onSubmitQuestion()" class="space-y-3">
            <div class="relative">
              <textarea
                id="input-question-content"
                formControlName="content"
                rows="3"
                placeholder="Type your question for the keynote speaker or panel... Gemini will automatically moderate and synthesize 2-line takeaways."
                class="w-full p-3.5 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white focus:ring-2 focus:ring-[#D2E3FC] rounded-xl text-sm sm:text-base text-[#1F1F1F] placeholder:text-[#8E918F] outline-none resize-none transition-all"
                maxlength="400"
                (input)="updateRemainingChars()"
              ></textarea>
            </div>

            <div class="flex items-center justify-between gap-3 flex-wrap pt-1">
              <!-- Speaker Target & Category & Anonymous controls -->
              <div class="flex items-center gap-3 flex-wrap">
                <!-- Speaker Target Selector (in workshop series) -->
                @if (qaService.segments().length > 0) {
                  <div class="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200/60">
                    <mat-icon class="text-sm text-indigo-600">record_voice_over</mat-icon>
                    <span class="font-semibold">Speaker:</span>
                    <select
                      id="select-target-segment"
                      formControlName="segmentId"
                      class="bg-white border border-indigo-200 rounded-md px-2 py-0.5 text-xs font-semibold text-indigo-900 outline-none cursor-pointer"
                    >
                      @for (seg of qaService.segments(); track seg.id) {
                        <option [value]="seg.id">
                          {{ seg.speakerName }} ({{ seg.status === 'LIVE' ? '★ LIVE NOW' : seg.status }})
                        </option>
                      }
                    </select>
                  </div>
                }

                <div class="flex items-center gap-1.5 text-xs text-[#444746]">
                  <mat-icon class="text-base text-[#747775]">category</mat-icon>
                  <select
                    id="select-category"
                    formControlName="category"
                    class="bg-[#F8F9FA] border border-[#E0E2EC] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1F1F1F] outline-none cursor-pointer"
                  >
                    <option value="General">General</option>
                    @for (cat of currentCategories(); track cat) {
                      @if (cat !== 'General') {
                        <option [value]="cat">{{ cat }}</option>
                      }
                    }
                  </select>
                </div>

                <label for="check-anonymous" class="flex items-center gap-1.5 text-xs text-[#444746] cursor-pointer select-none">
                  <input
                    id="check-anonymous"
                    type="checkbox"
                    formControlName="isAnonymous"
                    class="w-3.5 h-3.5 rounded border-[#747775] text-[#1A73E8] focus:ring-[#1A73E8] cursor-pointer"
                  />
                  <span>Ask anonymously</span>
                </label>
              </div>

              <!-- Submit Button -->
              <button
                id="btn-submit-question"
                type="submit"
                [disabled]="questionForm.invalid || isSubmitting()"
                class="px-5 py-2 rounded-xl font-display font-semibold text-xs text-white bg-[#1A73E8] hover:bg-[#185ABC] active:bg-[#174EA6] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
              >
                @if (isSubmitting()) {
                  <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Submitting...</span>
                } @else {
                  <mat-icon class="text-base">send</mat-icon>
                  <span>Submit Question</span>
                }
              </button>
            </div>
          </form>
        }
      </div>

      <!-- Top Prioritized Topics Banner (Crowd Favorites) -->
      @if (qaService.topPrioritizedQuestions().length > 0) {
        <div class="bg-[#FEF7E0]/60 border border-[#FEEFC3] rounded-2xl p-4 shadow-xs">
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <div class="flex items-center gap-1.5 text-xs font-bold text-[#B06000]">
              <mat-icon class="text-base text-[#E37400]">local_fire_department</mat-icon>
              <span>Audience Top Prioritized Topics</span>
              <span class="text-[11px] font-normal text-[#747775] hidden sm:inline">• Live on Presenter Stage</span>
            </div>
            <button
              type="button"
              (click)="qaService.sortBy.set('popular')"
              class="text-xs font-semibold text-[#1A73E8] hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <span>View all by popularity</span>
              <mat-icon class="text-xs">arrow_forward</mat-icon>
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            @for (topQ of qaService.topPrioritizedQuestions(); track topQ.id) {
              <div
                class="bg-white rounded-xl p-3 border border-[#FEEFC3] shadow-xs flex flex-col justify-between hover:border-[#1A73E8] transition-all group"
              >
                <div>
                  <div class="flex items-center justify-between gap-1 mb-1 text-xs">
                    <span class="inline-flex items-center gap-1 font-mono font-bold text-[#1A73E8] bg-[#E8F0FE] px-2 py-0.5 rounded-md">
                      <mat-icon class="text-xs">thumb_up</mat-icon>
                      {{ topQ.upvotes }}
                    </span>
                    <span class="text-[11px] text-[#747775] truncate max-w-[100px]">{{ topQ.authorName }}</span>
                  </div>
                  <p class="text-xs font-medium text-[#1F1F1F] line-clamp-2 leading-relaxed">
                    {{ topQ.content }}
                  </p>
                </div>

                <div class="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#F1F3F4] text-[11px]">
                  <span class="text-[#747775] truncate">{{ topQ.category || 'General' }}</span>
                  @if (qaService.isAdmin()) {
                    <button
                      type="button"
                      (click)="qaService.updateQuestionStatus(topQ.id, 'ANSWERING')"
                      class="font-bold text-[#1A73E8] hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <span>Stage</span>
                      <mat-icon class="text-xs">podium</mat-icon>
                    </button>
                  } @else {
                    <button
                      type="button"
                      (click)="qaService.toggleUpvote(topQ.id)"
                      class="font-semibold text-[#1A73E8] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <mat-icon class="text-xs">{{ qaService.userUpvotedIds().has(topQ.id) ? 'thumb_up' : 'thumb_up_off_alt' }}</mat-icon>
                      <span>{{ qaService.userUpvotedIds().has(topQ.id) ? 'Thumbs Up ✓' : 'Thumbs Up' }}</span>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Controls & Filter Toolbar -->
      <div class="bg-white rounded-2xl p-4 border border-[#E0E2EC] shadow-xs space-y-3">
        
        <!-- Search bar & Sort switcher -->
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <!-- Search input -->
          <div class="relative flex-1 min-w-[200px]">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#747775]">
              <mat-icon class="text-lg">search</mat-icon>
            </div>
            <input
              id="input-search-feed"
              type="text"
              [value]="qaService.searchQuery()"
              (input)="onSearchInput($event)"
              placeholder="Search live questions, authors, or AI answers..."
              class="w-full pl-9 pr-8 py-2 bg-[#F8F9FA] border border-[#E0E2EC] focus:border-[#1A73E8] focus:bg-white rounded-xl text-xs sm:text-sm text-[#1F1F1F] placeholder:text-[#8E918F] outline-none"
            />
            @if (qaService.searchQuery()) {
              <button
                type="button"
                (click)="qaService.searchQuery.set('')"
                class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#747775] hover:text-[#1F1F1F] cursor-pointer"
              >
                <mat-icon class="text-sm">close</mat-icon>
              </button>
            }
          </div>

          <!-- Sort Segmented Button -->
          <div class="flex items-center bg-[#F1F3F4] p-1 rounded-xl text-xs font-semibold border border-[#E0E2EC]">
            <button
              id="sort-popularity"
              type="button"
              (click)="qaService.sortBy.set('popular')"
              class="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
              [class.bg-white]="qaService.sortBy() === 'popular' || qaService.sortBy() === 'top'"
              [class.text-[#1A73E8]]="qaService.sortBy() === 'popular' || qaService.sortBy() === 'top'"
              [class.shadow-xs]="qaService.sortBy() === 'popular' || qaService.sortBy() === 'top'"
              [class.text-[#444746]]="qaService.sortBy() !== 'popular' && qaService.sortBy() !== 'top'"
              title="Sort questions by highest thumbs-up votes and audience popularity"
              aria-label="Sort feed by popularity"
            >
              <mat-icon class="text-sm">thumb_up</mat-icon>
              <span>Popularity</span>
            </button>

            <button
              id="sort-trending"
              type="button"
              (click)="qaService.sortBy.set('trending')"
              class="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
              [class.bg-white]="qaService.sortBy() === 'trending'"
              [class.text-[#1A73E8]]="qaService.sortBy() === 'trending'"
              [class.shadow-xs]="qaService.sortBy() === 'trending'"
              [class.text-[#444746]]="qaService.sortBy() !== 'trending'"
              title="Sort questions by recent upvote momentum and velocity"
              aria-label="Sort feed by trending"
            >
              <mat-icon class="text-sm">local_fire_department</mat-icon>
              <span>Trending</span>
            </button>

            <button
              id="sort-recent"
              type="button"
              (click)="qaService.sortBy.set('recent')"
              class="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
              [class.bg-white]="qaService.sortBy() === 'recent'"
              [class.text-[#1A73E8]]="qaService.sortBy() === 'recent'"
              [class.shadow-xs]="qaService.sortBy() === 'recent'"
              [class.text-[#444746]]="qaService.sortBy() !== 'recent'"
              title="Sort questions chronologically by newest first"
              aria-label="Sort feed by recent"
            >
              <mat-icon class="text-sm">schedule</mat-icon>
              <span>Recent</span>
            </button>
          </div>
        </div>

        <!-- Filter Category Pills & Status Filter Chips -->
        <div class="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-[#E0E2EC]/70">
          
          <!-- Categories -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              id="filter-cat-all"
              type="button"
              (click)="qaService.filterCategory.set('ALL')"
              class="px-3 py-1 rounded-full whitespace-nowrap font-medium transition-all cursor-pointer border"
              [class.bg-[#1A73E8]]="qaService.filterCategory() === 'ALL'"
              [class.text-white]="qaService.filterCategory() === 'ALL'"
              [class.border-[#1A73E8]]="qaService.filterCategory() === 'ALL'"
              [class.bg-[#F8F9FA]]="qaService.filterCategory() !== 'ALL'"
              [class.text-[#444746]]="qaService.filterCategory() !== 'ALL'"
              [class.border-[#E0E2EC]]="qaService.filterCategory() !== 'ALL'"
            >
              All Topics
            </button>

            @for (cat of currentCategories(); track cat) {
              <button
                [id]="'filter-cat-' + cat"
                type="button"
                (click)="qaService.filterCategory.set(cat)"
                class="px-3 py-1 rounded-full whitespace-nowrap font-medium transition-all cursor-pointer border"
                [class.bg-[#1A73E8]]="qaService.filterCategory() === cat"
                [class.text-white]="qaService.filterCategory() === cat"
                [class.border-[#1A73E8]]="qaService.filterCategory() === cat"
                [class.bg-[#F8F9FA]]="qaService.filterCategory() !== cat"
                [class.text-[#444746]]="qaService.filterCategory() !== cat"
                [class.border-[#E0E2EC]]="qaService.filterCategory() !== cat"
              >
                {{ cat }}
              </button>
            }
          </div>

          <!-- Status views dropdown or filter buttons -->
          <div class="flex items-center gap-1 text-xs">
            <button
              id="filter-status-all"
              type="button"
              (click)="qaService.filterStatus.set('ALL')"
              class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors"
              [class.text-[#1A73E8]]="qaService.filterStatus() === 'ALL'"
              [class.font-bold]="qaService.filterStatus() === 'ALL'"
              [class.text-[#747775]]="qaService.filterStatus() !== 'ALL'"
            >
              All
            </button>
            <span class="text-[#E0E2EC]">|</span>
            <button
              id="filter-status-my"
              type="button"
              (click)="qaService.filterStatus.set('MY_QUESTIONS')"
              class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors"
              [class.text-[#1A73E8]]="qaService.filterStatus() === 'MY_QUESTIONS'"
              [class.font-bold]="qaService.filterStatus() === 'MY_QUESTIONS'"
              [class.text-[#747775]]="qaService.filterStatus() !== 'MY_QUESTIONS'"
            >
              My Questions
            </button>
            <span class="text-[#E0E2EC]">|</span>
            <button
              id="filter-status-ai"
              type="button"
              (click)="qaService.filterStatus.set('AI_ANSWERED')"
              class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors"
              [class.text-[#1A73E8]]="qaService.filterStatus() === 'AI_ANSWERED'"
              [class.font-bold]="qaService.filterStatus() === 'AI_ANSWERED'"
              [class.text-[#747775]]="qaService.filterStatus() !== 'AI_ANSWERED'"
            >
              AI Answered
            </button>
            <span class="text-[#E0E2EC]">|</span>
            <button
              id="filter-status-upvoted"
              type="button"
              (click)="qaService.filterStatus.set(qaService.filterStatus() === 'UPVOTED' ? 'ALL' : 'UPVOTED')"
              class="px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors flex items-center gap-1"
              [class.text-[#1A73E8]]="qaService.filterStatus() === 'UPVOTED'"
              [class.bg-[#E8F0FE]]="qaService.filterStatus() === 'UPVOTED'"
              [class.font-bold]="qaService.filterStatus() === 'UPVOTED'"
              [class.text-[#747775]]="qaService.filterStatus() !== 'UPVOTED'"
              title="Filter to questions you voted thumbs-up on"
            >
              <mat-icon class="text-xs">thumb_up</mat-icon>
              <span>My Thumbs-Up ({{ qaService.userUpvotedIds().size }})</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Popularity Sorting Indicator Bar -->
      @if (qaService.sortBy() === 'popular' || qaService.sortBy() === 'top') {
        <div class="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#E8F0FE]/70 border border-[#D2E3FC] text-xs text-[#1A73E8] shadow-xs">
          <div class="flex items-center gap-2 font-medium">
            <mat-icon class="text-base text-[#1A73E8]">thumb_up</mat-icon>
            <span><strong>Sorted by Popularity:</strong> Questions with the most thumbs-up votes are ranked highest to prioritize speaker attention.</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold bg-white px-2.5 py-1 rounded-full border border-[#D2E3FC] text-[#1A73E8]">
            <mat-icon class="text-xs">how_to_vote</mat-icon>
            <span>{{ totalUpvotes() }} audience votes</span>
          </div>
        </div>
      }

      <!-- Question Feed List -->
      <div class="space-y-4">
        @for (q of qaService.filteredQuestions(); track q.id; let idx = $index) {
          <app-question-card
            [question]="q"
            [rank]="idx + 1"
            [showRank]="qaService.sortBy() === 'popular' || qaService.sortBy() === 'top'"
          />
        } @empty {
          <div class="bg-white rounded-2xl p-10 sm:p-12 text-center border border-[#E0E2EC] shadow-xs">
            @if (qaService.isStaff()) {
              <!-- Empty State for Host / Organizer / Speaker -->
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                <mat-icon class="text-2xl">sensors</mat-icon>
              </div>
              <h3 class="font-display font-bold text-base text-[#1F1F1F] mb-1">
                Waiting for audience questions
              </h3>
              <p class="text-xs text-[#747775] max-w-md mx-auto mb-4 leading-relaxed">
                Direct your audience to join using room code
                <span class="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  #{{ qaService.currentSession()?.joinCode || qaService.currentSeries()?.joinCode || 'LIVE' }}
                </span>.
                Incoming questions, Gemini RAG answers grounded on slide deck, and crowd upvotes will stream here live.
              </p>
              <div class="flex items-center justify-center gap-2.5 flex-wrap">
                <button
                  id="btn-copy-code-empty"
                  type="button"
                  (click)="copyJoinCode()"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">content_copy</mat-icon>
                  <span>Copy Room Code</span>
                </button>
                <button
                  id="btn-show-qr-empty"
                  type="button"
                  (click)="openShareModal()"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">qr_code_2</mat-icon>
                  <span>Show QR Code</span>
                </button>
                <button
                  id="btn-seed-question-empty"
                  type="button"
                  (click)="showHostSubmitForm.set(true)"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E0E2EC] text-[#1F1F1F] hover:bg-[#F8F9FA] transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">add_circle_outline</mat-icon>
                  <span>Seed a Starter Question</span>
                </button>
                <button
                  id="btn-open-teleprompter-empty"
                  type="button"
                  (click)="qaService.activeTab.set('teleprompter')"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#E8F0FE] text-[#1A73E8] hover:bg-[#D2E3FC] transition-colors cursor-pointer"
                >
                  <mat-icon class="text-sm">tv</mat-icon>
                  <span>Presenter Teleprompter</span>
                </button>
              </div>
            } @else {
              <!-- Empty State for Attendees -->
              <div class="w-12 h-12 rounded-2xl bg-[#F1F3F4] text-[#747775] flex items-center justify-center mx-auto mb-3">
                <mat-icon class="text-2xl">chat_bubble_outline</mat-icon>
              </div>
              <h3 class="font-display font-bold text-base text-[#1F1F1F] mb-1">
                No questions found
              </h3>
              <p class="text-xs text-[#747775] max-w-sm mx-auto mb-4">
                @if (qaService.searchQuery() || qaService.filterCategory() !== 'ALL' || qaService.filterStatus() !== 'ALL') {
                  Try resetting your search query or topic filters to see all audience submissions.
                } @else {
                  Be the first to submit a question! The speaker will review it live.
                }
              </p>
              @if (qaService.searchQuery() || qaService.filterCategory() !== 'ALL' || qaService.filterStatus() !== 'ALL') {
                <button
                  type="button"
                  (click)="resetFilters()"
                  class="px-4 py-2 rounded-xl text-xs font-semibold text-[#1A73E8] bg-[#E8F0FE] hover:bg-[#D2E3FC] cursor-pointer"
                >
                  Reset Filters
                </button>
              }
            }
          </div>
        }
      </div>

    </div>
  `,
})
export class QuestionFeed {
  public qaService = inject(QaService);
  public isSubmitting = signal<boolean>(false);
  public remainingChars = signal<number>(400);
  public showHostSubmitForm = signal<boolean>(false);

  public totalGroundedAnswers = computed(() => {
    return this.qaService.questions().filter(q => q.aiLine1 && q.aiStatus === 'READY').length;
  });

  public totalUpvotes = computed(() => {
    return this.qaService.questions().reduce((sum, q) => sum + (q.upvotes || 0), 0);
  });

  public questionForm = new FormGroup({
    content: new FormControl('', [Validators.required, Validators.minLength(5)]),
    category: new FormControl('General'),
    segmentId: new FormControl(''),
    isAnonymous: new FormControl(false),
  });

  public currentCategories(): string[] {
    const s = this.qaService.currentSession();
    return s?.categories || ['Architecture', 'Gemini AI', 'Performance', 'Security', 'Telemetry'];
  }

  public activeAnsweringQuestion() {
    return this.qaService.questions().find(q => q.status === 'ANSWERING');
  }

  public updateRemainingChars(): void {
    const text = this.questionForm.get('content')?.value || '';
    this.remainingChars.set(400 - text.length);
  }

  public async onSubmitQuestion(): Promise<void> {
    if (this.questionForm.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const val = this.questionForm.value;
    const targetSegment = val.segmentId || this.qaService.activeSegment()?.id;

    const res = await this.qaService.submitQuestion(
      val.content || '',
      val.category || 'General',
      !!val.isAnonymous,
      targetSegment
    );

    this.isSubmitting.set(false);
    if (res.success) {
      this.questionForm.reset({
        content: '',
        category: 'General',
        segmentId: this.qaService.activeSegment()?.id || '',
        isAnonymous: false,
      });
      this.remainingChars.set(400);
      this.showHostSubmitForm.set(false);
    }
  }

  public copyJoinCode(): void {
    const code = this.qaService.currentSession()?.joinCode || this.qaService.currentSeries()?.joinCode;
    if (code && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      this.qaService.showToast(`Room code #${code} copied to clipboard!`);
    }
  }

  public openShareModal(): void {
    const session = this.qaService.currentSession() || this.qaService.currentSeries();
    if (session) {
      this.qaService.openShareModal(session.joinCode, session.title, this.qaService.currentSeries() ? 'series' : 'single');
    }
  }

  public onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.qaService.searchQuery.set(val);
  }

  public resetFilters(): void {
    this.qaService.searchQuery.set('');
    this.qaService.filterCategory.set('ALL');
    this.qaService.filterStatus.set('ALL');
  }
}
