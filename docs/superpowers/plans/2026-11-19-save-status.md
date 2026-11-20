# Step 3.3.5: Save Handling and Status Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** Every accepted mutation has an acknowledged save result or retained recovery state and truthful visible status.

**Architecture:** A testable SaveController owns acknowledged/candidate snapshots and save state. app.js routes edits and imports through it, disables editing during pending saves, announces status, preserves failed candidate rendering and editor fields, and offers explicit retry for definite failures plus recovery download. No automatic retries; conflict/uncertain writes block further changes until later recovery integration.

**Spec:** User-approved Step 3.3.5 task list in this conversation.

## Constraints and review focus

- Keep previous Step 3.3.4 uncommitted changes; no deployment, commit, environment edits or production writes.
- Saved means acknowledged by the repository; lost responses are outcome unknown, not definite failures.
- Disable editing while pending; events that still arrive receive an explicit busy error rather than disappearing.
- Failed valid submissions remain as a candidate, including direct checkbox/layout actions; normal export remains acknowledged data only.
- Account changes dispose save handling before old callbacks can update another screen.
- Full latest-version reload, merge and conflict resolution remain Step 3.3.6.
- Leaving/sign-out warnings cover pending writes and dirty forms; browser warnings cannot guarantee recovery.

## Tasks

- [x] Add failing controller/status tests; implement state, pending protection, retained candidates and error classification.
- [x] Audit mutation and import paths and integrate the controller without false success notifications.
- [x] Add footer/status announcements, pending-control disabling, retry and recovery download.
- [x] Track editor dirty state and guard navigation/sign-out; preserve privacy on forced session changes.
- [x] Run focused and full checks and a read-only review; document manual verification needs.

## Verification

- Tests failed before SaveController existed, then passed after implementation.
- Final suite: 97/97 pass. npm run check and git diff --check pass. HTTP tests used temporary loopback servers and fixture credentials; no real workspace data was accessed or changed for this step.
- A separate read-only reviewer found a dirty-tracking gap for photo removal and editor to-do toggles. The shared event tracker now includes those controls, with a regression test that failed before the helper existed and passes afterward.
- Additional control-lock regression failed when an async photo control could remain disabled, then passed after preserving only lock-owned disabled states. Dragging is also locked during requests. Programmatic project assignment dispatches a dirty-change event.
- Manual browser verification of the new footer transitions, failure retention/retry/download, dirty-form warnings and sign-out prompt is still required. Browser automation was unavailable in the preceding debugging work; no live visual verification is claimed here.
- Prior Step 3.3.4 and this step remain uncommitted. No production, environment-file, or database changes were made.

## Manual check sequence

Refresh the local database-mode app. Edit/save a note, toggle a task, change layout, and verify Saving followed by Saved to your account and persistence after refresh. Under an explicitly simulated failed request, confirm Not saved or Save outcome unknown (as appropriate), retained editor/candidate data and recovery download. Retry only a definite failure; uncertain outcomes/conflicts require recovery/latest-version handling in Step 3.3.6. Change only photo removal or a to-do completion in an editor, then cancel/navigation/sign-out to verify dirty warnings. Cancel the warning to keep editing. Browser navigation warnings are browser-dependent.
