# Step 3.3.7: Session Transitions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** Stop invalid-session operations and prevent private state crossing session/account boundaries, including expiry and tab restoration.

**Architecture:** Shared authentication provides guarded session rejection, expiry deadlines, bounded verification and foreground revalidation. The API adapter binds both user and session IDs and reports HTTP authentication rejection. A lifecycle module covers private UI during foreground checks and temporary verification outages. Existing coordinator cleanup disposes repositories, save/recovery state and editors on actual session transitions. Same-origin BroadcastChannel signals session end without tokens or workspace content.

**Spec:** User-approved Step 3.3.7 task list in this conversation.

## Decisions and constraints

- Retain existing clear-on-session-end policy; no recovery across reauthentication or accounts. No new browser persistence.
- Temporary connectivity failure during same-session revalidation covers UI and pauses access while retaining tab memory; it is not treated as a confirmed logout.
- Definite 401/403 or absent/expired sessions clear private state and require sign-in. An old response cannot invalidate a newer session.
- A sign-out signal affects only matching session IDs and cannot grant access. No token or workspace data is broadcast.
- Ordinary SDK notifications and successful same-session foreground checks must not erase drafts or reload the workspace.
- Existing voluntary sign-out warning/recovery download stays in place. Request cancellation cannot guarantee cancellation of a server write.
- No environment, production, real database test writes, commit or deployment.

## Tasks

- [x] Add failing expiry, authentication rejection and lifecycle tests.
- [x] Implement bounded auth verification, guarded expiry/rejection, fresh foreground checks and session-end signals.
- [x] Bind repository instances to session as well as user and route 401/403 to authentication cleanup.
- [x] Add foreground/session-check overlay and expired-session UI; retain same-session drafts only during temporary suspension.
- [x] Audit all completion/export/import/recovery guards and cleanup paths.
- [x] Run full checks and separate read-only review; maintain the outstanding verification checklist.

## Verification and review

- New transition tests failed before the lifecycle module and rejection/revalidation methods existed, then passed after implementation.
- Final suite: 131/131 pass. npm run check and git diff --check pass. Tests use fixtures and temporary loopback HTTP servers, without real database access or credential inspection.
- Separate read-only review found a pending-token suspension race. Two regression tests failed before the fix, then passed after suspension checks were added after token acquisition and immediately before HTTP transmission. No request is resent automatically.
- Additional tests cover session-ID replacement for the same user, stale rejection tickets, expiry deadlines, verification timeout, cross-tab signal scoping/no echo/no token contents, observer failure isolation, expiry during save/recovery, same-session offline draft retention/retry and delayed modal layering.
- API/session cleanup remains server-authorized; UI masking is supplementary. Client cancellation cannot undo a server write already accepted.
- Manual expiry, sign-out, multi-tab, history restoration, suspended-editor and multi-account checks remain in docs/verification.md. No manual results are inferred from test coverage.
- No environment, real database, production, commit or deployment changes. Step 3.3.6 is also still uncommitted.

## Recovery policy

Confirmed session end clears all private state, including unsubmitted forms and retained candidates, even if the same user later signs in. A downloaded backup can be imported afterward. During a temporary same-session verification outage, the tab retains memory behind a blocking modal, with new token transmission/export/recovery UI actions paused until revalidation succeeds. This is not recovery across accounts or authentication sessions.
