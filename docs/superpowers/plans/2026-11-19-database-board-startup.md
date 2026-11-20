# Step 3.3.4: Database Board Startup Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display the verified account's database workspace in the existing board UI without writing during startup.

**Architecture:** A testable workspace-session coordinator owns repository construction, loading, retries and disposal. The shared auth screen hands verified sessions to the coordinator. app.js renders its ready snapshot and uses the injected repository for existing edits. Local startup continues through LocalBoardRepository, without the unconditional initial save.

**Tech Stack:** Existing browser ES modules, Clerk, revisioned API repository and Node tests. No new dependencies.

**Spec:** Approved Step 3.3.4 task list in this conversation.

## Constraints and review focus

- No production deployment, migration, environment changes or automatic local-data transfer.
- Neither local nor database startup writes. A missing database snapshot creates one empty in-memory board with no sample cards or projects.
- Session changes dispose old repositories and invalidate late loads, saves, imports and exports.
- Ordinary unchanged-session SDK notifications must not clear the workspace or restart loading.
- Database read failure is a retryable error screen, never an empty/sample/local workspace.
- Account label, sign-out control, delete/import wording and storage footer must accurately describe account storage.
- Full conflict/recovery UX and multi-device refresh behavior remain later steps.

## Tasks

- [x] Add failing coordinator and unchanged-session notification tests.
- [x] Implement workspace-session coordinator and stable auth notification handling.
- [x] Connect verified auth screens to database loading and render existing board data.
- [x] Remove startup save; guard mutations and imports/exports across session changes.
- [x] Add account controls, loading/error/retry screens and accurate storage copy.
- [x] Verify fixture-backed load/save/reload and account isolation; run full checks and read-only review.

## Manual verification target

In local database mode with development credentials, verify sign-in, loading, first-use empty board, a simple card save and reload, sign-out, another account, and load error/retry. Existing browser-local cards must remain untouched. Live sign-in may require the user's email-code interaction. Production deployment remains separate.

## Verification record

The new coordinator and unchanged-session tests failed before implementation, then passed. All 85 automated tests pass with loopback access, including HTTP and fixture API checks. npm run check and git diff --check pass. Separate read-only review found no material issues; its sandbox blocked two HTTP tests, which passed in the primary run with loopback access.

Real browser sign-in and a real PostgreSQL card save were not performed for this step; the manual target above remains outstanding. No .env, real database records, production files, commits or deployment changed. Full save-state/conflict recovery remains in Steps 3.3.5–6.

## Manual-test follow-up

The user reported a load error after successful authentication. Local read-only checks confirmed database connectivity, table existence, and zero workspace rows. Clerk CSP omissions were reproduced in an HTTP test and corrected using Clerk's documented worker, protection and challenge sources. The load/display stages now have distinct safe error messages.

A separate browser-compatibility defect was identified in ApiBoardRepository: calling a saved fetch function as this.#fetch supplied the repository as the host-function receiver. A receiver-sensitive regression test failed before the fix and passed after invocation was changed to a standalone function call. Error screens expose only typed error categories/status codes, without raw diagnostics or user data. User confirmation of the browser result remains pending.

The user subsequently confirmed the board loaded, the note "ME First Kard" survived reload, and the remaining local load-error/Retry and read-only refresh checks passed. Manual two-account UI testing remains deferred to production because only one development account is available. These implementation changes remain uncommitted alongside the following step.
