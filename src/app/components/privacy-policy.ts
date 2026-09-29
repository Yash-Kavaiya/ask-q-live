import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-privacy-policy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    <article class="max-w-3xl mx-auto animate-fade-in pb-16">
      <header class="mb-8 space-y-3">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">Legal</p>
        <h1 class="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
          Privacy Policy
        </h1>
        <p class="text-sm text-slate-500">
          Last updated: 29 September 2026 · Effective for askqlive.com
        </p>
        <p class="text-sm text-slate-600 leading-relaxed">
          This Privacy Policy explains how AskQlive (“we”, “us”, “our”) collects, uses, shares, and
          protects personal data when you use our live Q&amp;A platform. It is written to align with
          the EU/UK GDPR, ePrivacy Directive (cookie consent), California CCPA/CPRA (where applicable),
          and similar privacy frameworks.
        </p>
        <div class="flex flex-wrap gap-3 pt-1 text-xs">
          <a routerLink="/cookies" class="text-indigo-600 hover:text-indigo-800 font-semibold underline-offset-2 hover:underline"
            >Cookie Policy &amp; preferences</a
          >
          <span class="text-slate-300">·</span>
          <a href="mailto:privacy@askqlive.com" class="text-indigo-600 hover:text-indigo-800 font-semibold underline-offset-2 hover:underline"
            >privacy&#64;askqlive.com</a
          >
        </div>
      </header>

      <div class="prose-legal space-y-8 text-sm text-slate-700 leading-relaxed">
        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">1. Who we are (controller)</h2>
          <p>
            <strong>Controller:</strong> AskQlive, operated by Yash Kavaiya.<br />
            <strong>Website:</strong> <a class="text-indigo-600 underline" href="https://askqlive.com">https://askqlive.com</a><br />
            <strong>Privacy contact:</strong>
            <a class="text-indigo-600 underline" href="mailto:privacy@askqlive.com">privacy&#64;askqlive.com</a>
          </p>
          <p>
            If we appoint an EU/UK representative or Data Protection Officer in the future, we will
            update this page.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">2. Scope</h2>
          <p>This policy covers:</p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Audience members who join a session with a code or QR (no account required)</li>
            <li>Hosts, organizers, speakers, and moderators who create accounts or use invite links</li>
            <li>Visitors to askqlive.com marketing and product surfaces</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">3. Data we collect</h2>

          <h3 class="font-semibold text-slate-900 pt-1">3.1 Audience (zero-auth join)</h3>
          <ul class="list-disc pl-5 space-y-1">
            <li>Optional display name you enter when joining</li>
            <li>Questions, upvotes, and related session activity</li>
            <li>
              A browser-stored participant fingerprint (local identifier) used to rate-limit abuse,
              track your upvotes, and support moderation bans — not used to sell ads
            </li>
            <li>Technical data: IP address (server logs / abuse prevention), user agent, timestamps</li>
          </ul>

          <h3 class="font-semibold text-slate-900 pt-2">3.2 Hosts, speakers &amp; staff</h3>
          <ul class="list-disc pl-5 space-y-1">
            <li>Account email and authentication data (via Firebase Authentication)</li>
            <li>Session / series metadata (title, description, run of show, speaker profiles)</li>
            <li>Optional speaker invite emails, bios, and social links you choose to store</li>
            <li>Optional host-provided Gemini API key (stored only when you paste one; blank does not clear an existing key)</li>
            <li>Uploaded grounding materials (PDF/DOCX/PPTX/images/text) and extracted text used for AI answers</li>
            <li>Hosted-session history saved in your browser (localStorage) for convenience</li>
          </ul>

          <h3 class="font-semibold text-slate-900 pt-2">3.3 Analytics (only with consent)</h3>
          <ul class="list-disc pl-5 space-y-1">
            <li>Google Analytics 4 (measurement ID G-V2Q44SS4M9) — page views and product usage metrics</li>
            <li>Microsoft Clarity (project ymqwv9le4d) — session replays / heatmaps to improve UX</li>
          </ul>
          <p>
            These load <strong>only after</strong> you accept analytics cookies. See our
            <a routerLink="/cookies" class="text-indigo-600 underline">Cookie Policy</a>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">4. Why we use data (purposes &amp; legal bases)</h2>
          <div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="min-w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-3 py-2 font-semibold">Purpose</th>
                  <th class="px-3 py-2 font-semibold">Examples</th>
                  <th class="px-3 py-2 font-semibold">Legal basis (GDPR)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr>
                  <td class="px-3 py-2 align-top font-medium text-slate-900">Provide the service</td>
                  <td class="px-3 py-2 align-top">Join codes, live feed, moderation, teleprompter, series manage</td>
                  <td class="px-3 py-2 align-top">Art. 6(1)(b) contract / legitimate interest for free audience use</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 align-top font-medium text-slate-900">Security &amp; abuse prevention</td>
                  <td class="px-3 py-2 align-top">Fingerprints, rate limits, bans, auth tokens</td>
                  <td class="px-3 py-2 align-top">Art. 6(1)(f) legitimate interests</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 align-top font-medium text-slate-900">AI features</td>
                  <td class="px-3 py-2 align-top">Grounding from decks, suggested answers, executive reports (Gemini)</td>
                  <td class="px-3 py-2 align-top">Art. 6(1)(b) / (f); host-controlled content</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 align-top font-medium text-slate-900">Product analytics</td>
                  <td class="px-3 py-2 align-top">GA4, Clarity</td>
                  <td class="px-3 py-2 align-top">Art. 6(1)(a) consent (cookies / ePrivacy)</td>
                </tr>
                <tr>
                  <td class="px-3 py-2 align-top font-medium text-slate-900">Legal compliance</td>
                  <td class="px-3 py-2 align-top">Respond to lawful requests, defend claims</td>
                  <td class="px-3 py-2 align-top">Art. 6(1)(c) legal obligation / (f)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">5. How AI uses your content</h2>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              When hosts enable grounding, uploaded documents and session context may be sent to
              <strong>Google Gemini</strong> to extract text, embed content, and generate suggested
              answers or reports.
            </li>
            <li>Audience questions may be processed by Gemini when AI answer features are used in a session.</li>
            <li>
              We do not sell question content. Hosts should avoid uploading special-category data
              (health, biometrics, etc.) unless they have a lawful basis and inform their audience.
            </li>
            <li>If a host pastes their own Gemini API key, processing may occur under that host’s Google account terms.</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">6. Processors &amp; subprocessors</h2>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Google Cloud / Firebase</strong> — hosting (Cloud Run), Auth, Firestore, Storage, Gemini</li>
            <li><strong>Cloudflare</strong> — DNS / edge for askqlive.com</li>
            <li><strong>Google Analytics</strong> — analytics (consent)</li>
            <li><strong>Microsoft Clarity</strong> — UX analytics (consent)</li>
          </ul>
          <p>
            These providers may process data in the United States or other countries. Where GDPR
            applies, transfers rely on appropriate safeguards (e.g. Standard Contractual Clauses)
            offered by those providers.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">7. Cookies &amp; similar technologies</h2>
          <p>
            We use strictly necessary storage for the product to work, and optional analytics cookies
            only with consent. Full details and controls:
            <a routerLink="/cookies" class="text-indigo-600 underline">Cookie Policy</a>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">8. Retention</h2>
          <ul class="list-disc pl-5 space-y-1">
            <li>Session/series data: retained while the event workspace exists and for a reasonable period afterward for host access, abuse review, and backups</li>
            <li>Auth accounts: until you delete the account or request erasure</li>
            <li>Server logs: typically short-lived operational retention</li>
            <li>Browser localStorage (fingerprint, preferences, bookmarks): until you clear site data or change consent</li>
            <li>Analytics (if consented): per Google / Microsoft retention settings for our properties</li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">9. Your rights</h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Access</strong> your personal data</li>
            <li><strong>Rectify</strong> inaccurate data</li>
            <li><strong>Erase</strong> data (“right to be forgotten”)</li>
            <li><strong>Restrict</strong> or <strong>object</strong> to certain processing</li>
            <li><strong>Portability</strong> of data you provided</li>
            <li><strong>Withdraw consent</strong> at any time (does not affect prior lawful processing)</li>
            <li><strong>Lodge a complaint</strong> with a supervisory authority (EEA/UK)</li>
          </ul>
          <p>
            <strong>CCPA/CPRA (California):</strong> We do not sell personal information for money.
            Analytics vendors may constitute “sharing” for cross-context behavioral advertising under
            some interpretations — we only enable those tools with cookie consent, and you can opt out
            via the Cookie Policy. You may request know/delete/correct via
            <a class="text-indigo-600 underline" href="mailto:privacy@askqlive.com">privacy&#64;askqlive.com</a>.
          </p>
          <p>
            To exercise rights, email us with enough detail to identify the session/account. Hosts
            remain responsible for audience notices when they run events.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">10. Children</h2>
          <p>
            AskQlive is not directed at children under 16 (or the digital consent age in your country).
            Do not use the service if you are under that age. Event organizers are responsible for
            obtaining any parental consents required for their audience.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">11. Security</h2>
          <p>
            We use HTTPS, authenticated host/speaker roles, token-scoped APIs, and cloud provider
            security controls. No method of transmission or storage is 100% secure; report issues to
            <a class="text-indigo-600 underline" href="mailto:privacy@askqlive.com">privacy&#64;askqlive.com</a>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">12. Hosts as independent controllers</h2>
          <p>
            When you host an event, you may determine the purpose of collecting audience questions and
            speaker profiles. In that case you may be an independent controller (or joint controller)
            for that event data. You must provide your own notices to attendees where required and
            only upload lawful content.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">13. Changes</h2>
          <p>
            We may update this policy. The “Last updated” date at the top will change. Material
            changes may also be highlighted in-product or via the cookie banner when relevant.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="font-display text-lg font-bold text-slate-900">14. Contact</h2>
          <p>
            Privacy requests:
            <a class="text-indigo-600 underline" href="mailto:privacy@askqlive.com">privacy&#64;askqlive.com</a><br />
            Product:
            <a class="text-indigo-600 underline" href="https://askqlive.com">https://askqlive.com</a>
          </p>
        </section>
      </div>

      <div class="mt-10 flex flex-wrap gap-3">
        <a
          routerLink="/cookies"
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
        >
          <mat-icon class="text-sm">cookie</mat-icon>
          Manage cookies
        </a>
        <a
          routerLink="/"
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
        >
          <mat-icon class="text-sm">home</mat-icon>
          Back to AskQlive
        </a>
      </div>
    </article>
  `,
})
export class PrivacyPolicy {}
