# Firestore Security Specification & Threat Model

## Data Invariants
1. **Session Integrity**: A session must have a valid non-empty title, join code matching `^[A-Z0-9]+$`, and valid status. Only authenticated hosts or authorized tokens can update session settings and context.
2. **Question Belonging**: Questions can only be created within an active session. The `sessionId` field must match the path `{sessionId}`. The content must be non-empty string <= 1000 characters.
3. **Upvote Integrity**: Upvotes can only increment/toggle by authorized participants, and upvote records cannot be forged across sessions.
4. **Participant Isolation**: Participants cannot spoof ban states or modify other participants' records.
5. **Probe Isolation**: `/test/connection` is strictly read-only for verification.

## The "Dirty Dozen" Threat Payloads
1. **P1 (Shadow Field Injection in Question)**: Attempting to insert `__injectedAdmin: true` or `isAdmin: true` inside a question document payload.
2. **P2 (Unbounded String Attack)**: Submitting question content with 2MB junk text.
3. **P3 (ID Poisoning Attack)**: Injecting 2000-character document ID with invalid characters into `/sessions/{sessionId}/questions/{questionId}`.
4. **P4 (Cross-Session Question Creation)**: Creating a question in session `NEXT26` with `sessionId: 'OTHER_SESSION'`.
5. **P5 (Unauthorized Status Escalation)**: Attendee attempting to update question status directly to `ANSWERED` without presenter role.
6. **P6 (Negative Upvotes Forgery)**: Writing negative numbers or arbitary large number `upvotes: 999999` directly on question creation.
7. **P7 (Author Identity Spoofing)**: Submitting question with forged `authorUid: 'victim_uid'` while signed in as another user.
8. **P8 (Tampering with Immutable Creation Timestamps)**: Changing `createdAt` timestamp during an update.
9. **P9 (Participant Self-Unban)**: Moderated participant attempting to set `isBanned: false` on their participant doc.
10. **P10 (PII Exposure via Blanket List)**: Attempting unauthenticated query dump on `/users` collection without user UID boundary.
11. **P11 (Session Settings Hijack)**: Unauthenticated visitor attempting to change `settings.autoAiAnswers` on another user's session.
12. **P12 (Test Probe Tampering)**: Attempting to write or delete documents in the `/test` collection.

## Rules Test Implementation
Verified via unit rules test assertions ensuring zero false-negatives and zero unvalidated writes.
