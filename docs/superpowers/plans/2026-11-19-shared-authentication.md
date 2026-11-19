# Step 3.3.2: Shared Authentication Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Share the working Clerk preview flow with the database-mode board without opening a local repository or loading database cards yet.

**Architecture:** src/auth.js owns Clerk initialization and observable verified-session state. src/auth-view.js presents accessible authentication screens. src/board-startup.js selects the configured storage path before repository creation. The server continues enforcing authorization on every API request.

**Tech Stack:** Browser ES modules, existing Clerk CDN SDKs, Node HTTP server and Node tests. No new dependencies.

**Spec:** User-approved Step 3.3.2 design in this conversation, following the online-first Step 3.3 design.

## Global Constraints

- Database mode must never instantiate LocalBoardRepository or fall back to local storage.
- Match backend-verified user ID to the current Clerk identity. Tokens stay in memory and must not be logged.
- Sign-out, expiry and account changes invalidate outstanding verification and token retrieval.
- Leave environment files, production deployment, workspace data and startup wrapper untouched.
- Keep the database-mode screen in an explicit integration-pending state after verification; adapter and workspace loading are later steps.

## Review Focus

- A delayed response from A must not restore A after a switch to B or sign-out.
- An authentication error must offer Retry without opening private content.
- Configuration fetch failures must not fall back to local data.
- Local mode must not load Clerk scripts or require an account.
- Pages restored from browser history must initialize authentication again.

## Tasks

- [x] Add failing controller/startup tests, then implement shared initialization, subscriptions, token retrieval, redirects and server verification in src/auth.js.
- [x] Add sign-out race and initialization retry tests; watch failures and implement fixes.
- [x] Move preview to the shared screen, with page restoration handling.
- [x] Read /api/config before any local repository is instantiated. Show sign-in, verification, error and verified integration-pending states in database mode.
- [x] Clear account-related application state on auth transitions; guard keyboard interactions while no board exists.
- [x] Serve the auth entry page in database mode and apply Clerk CSP permissions there, while preserving authenticated APIs.
- [x] Test screen transitions, retry and redirect destination using an isolated DOM fixture.
- [x] Update README, syntax checks and HTTP assertions for the new entry page.

## Verification and rollout

Automated coverage uses fixture credentials and fake Clerk clients; no real workspace is loaded or saved. Final verification: 58/58 tests pass; npm run check and git diff --check pass. A separate read-only reviewer found no material issues in the shared authentication, startup selection, identity gating, session invalidation and CSP integration.

Interactive verification was attempted at a temporary localhost database-mode server on port 4320, using process-only overrides and the existing development environment. The board displayed the loading auth screen. Browser control became unavailable during Clerk loading, and the fallback browser connection failed; successful live sign-in through the refactored flow has not been observed. The temporary server was stopped. The user should restart their local app and verify preview sign-in/sign-out, then optionally run a separate process with CARDBOARD_STORAGE=database to verify the board gate. Keep production in local mode until the remaining integration steps are complete.

The user subsequently manually confirmed Step 3.3.2. Steps 3.3.1 and 3.3.2 are being committed together as a local checkpoint. No environment, database, or hosted files changed.
