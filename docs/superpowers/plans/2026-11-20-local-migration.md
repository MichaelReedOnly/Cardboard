# Step 3.3.8: Local Workspace Migration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** Explicitly replace the verified account workspace from browser-local data or a JSON backup, preserving the source and guarding revisions/accounts.

**Architecture:** Targeted local JSON reading stays in storage.js. WorkspaceMigration owns validated source, isolated destination preview and account/session guards. Destination preview uses a separate API repository so it cannot advance the live board's cached revision. SaveController.replaceFromImport submits an explicitly confirmed snapshot through the live API adapter with the exact preview revision. Failed attempts use existing candidate/recovery handling.

**Spec:** User-approved Step 3.3.8 tasks in this conversation.

## Constraints and review focus

- No startup scanning, automatic import, append or merge. Read browser-local data only after an explicit workflow action.
- Local originals and selected files are never modified or removed. Offer original source JSON and current account snapshot downloads.
- Validate/migrate source before destination requests; oversized normalized payloads may be backed up but cannot be submitted.
- Preview must not mutate live repository revisions. Confirmed PUT uses only the checked destination revision; intervening saves cause conflict.
- Refuse new migration while there are pending/unsaved edits. Do not silently discard them.
- Capture picker ownership before opening the native file chooser; cancel old-account results even if the account changed while choosing or reading.
- Temporary same-session verification pauses the workflow; actual account/session changes dispose its private data and pending preview.
- No real database test writes, environment changes, production, commit or deployment.

## Tasks

- [x] Add read-only source helpers and explicit-revision regression tests.
- [x] Implement account-bound migration preview/commit and controller integration.
- [x] Add modal source/destination counts, backups, confirmation and errors; connect account/data workflows.
- [x] Test source preservation, absent/legacy/invalid/oversized input, conflicts, account changes and preview revision isolation.
- [x] Run full verification, independent review and update docs/verification.md.

Verification: 144 tests pass; syntax checks pass. Independent read-only review found no material ownership or revision issues. Browser/manual migration verification remains outstanding in V-15–V-19; no real workspace writes or deployment were performed.
