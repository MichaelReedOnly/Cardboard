# Cardboard

A PAPEPPE-style planning board with separate local and authenticated database storage modes. The Node backend provides Clerk session verification and a revisioned, private PostgreSQL workspace API. Step 3.3.4 connects the board to that API; complete save/recovery controls and production rollout are later checkpoints.

## Run

Use Node.js 24 for development and deployment. Install dependencies with `npm install`. In this directory run `npm start` (or `node server.js`) for a standalone board without loading an environment file. With a configured `.env`, use `node app.cjs` or `node --env-file=.env server.js`. The tracked `app.cjs` loads `.env` next to the wrapper before importing the server; cPanel can use it as the startup file. Keep the working directory set to the application root.

Open http://127.0.0.1:4318 for local use. On Windows, use `npm.cmd` if PowerShell blocks npm.ps1. Keep the terminal running. Stop with Ctrl+C. `PORT` may override the port; preserve cPanel's supplied port configuration. Use the same address each time: localhost and 127.0.0.1 have separate browser storage.

## Environment and storage configuration (Step 3.3.1)

Each environment has its own ignored `.env`; never upload the local file over production or commit credentials. Use matching Clerk development keys locally and matching production keys on the hosted site. `CARDBOARD_ORIGIN` must be the exact application origin, without a trailing slash or path. Production keys require an explicit HTTPS origin. The server rejects mixed development/production keys and reports safe configuration errors without printing key values.

Storage selection is server-controlled:

| Setting | Behavior at this checkpoint |
| --- | --- |
| `CARDBOARD_STORAGE=local` | Existing standalone browser-local board; Clerk preview and workspace API remain available separately. |
| `CARDBOARD_STORAGE=database` | Requires valid Clerk configuration. Sign in, verify the session, then load that account's workspace through the API. Existing edits use the API repository. No local repository or sample data is opened. |
| Variable absent | Defaults to `local` for existing deployments. |
| Any other value, including blank | Startup fails with a configuration error. |

Keep production on `local` until the remaining save/recovery integration is verified. Local testing can select `database` through a process environment variable without changing `.env`. Neither setting migrates browser cards automatically. `GET /api/config` reports the selected `storageMode` and `boardReady: true` for both configured entry flows; it does not attest to database health. It contains no credentials. Existing `/api/clerk-preview-config` exposes only the public Clerk key and origin when authentication is configured. These responses are not cached.

The sign-in preview at `/sign-in-preview` and database-mode board share `src/auth.js` and `src/auth-view.js`. They verify the signed-in session through `/api/me`, expose Sign in / Sign out and Retry actions, and discard delayed verification results on session changes. Unchanged active-session notifications do not reopen the workspace. Clerk tokens remain in memory. The workspace API remains authenticated in both storage modes. PostgreSQL settings are read only by the backend; `npm run db:migrate` applies the database migrations when intentionally requested.

`src/workspace-session.js` owns the API repository lifetime and loading state. Saved snapshots open in the existing board UI. An account with no snapshot gets one empty board in memory at revision `"0"`, without sample cards or projects; its first explicit change saves it. Opening either storage mode performs no save and does not increment revisions. A database load error shows Retry and Sign out, without substituting an empty or local workspace. The account control identifies the verified account and offers Sign out, including on mobile. Account transitions clear rendered board state and dispose the old repository.

## Features

Notes, checklists, weekly planners, links, boards, projects, dates, search (Ctrl/Cmd+K), pinning, sorting, drag reordering, keyboard-accessible move-earlier controls, and JSON backup/import. Click a card heading or its Edit control to edit. Card order is manual within pinned/unpinned groups. Switching to another sort disables drag ordering.

In local mode, data persists in localStorage for this browser and origin. Browser data clearing removes it; export backups from Board options. In database mode, acknowledged changes persist in the signed-in account's PostgreSQL workspace. Imports validate before replacement and require confirmation for the current destination. Existing browser-local cards are not transferred automatically. There is no live cross-device refresh yet. Stale database saves are rejected by the API, while full conflict/recovery UI follows in Steps 3.3.5–6; use one editing session at a time during this checkpoint.

## Separate storage layer

`src/storage.js` contains the browser storage adapter with async `load()`, `save(state)`, `exportJSON()` and `importJSON(text)`. Startup selects it only in local mode, or injects `ApiBoardRepository` after verified authentication in database mode. `src/app.js` uses the same methods for board operations. The version-1 schema in `src/model.js` defines boards, projects and cards with stable IDs; checklist items also have stable IDs. `src/seed.js` supplies starter data in local mode only. JSON exports are versioned.

The current workspace API stores a complete validated snapshot per verified Clerk account with revision-based concurrency. The HTTP repository implements the same asynchronous boundary. Granular operations and offline synchronization are outside the first database-backed release.

### Authenticated API repository (Step 3.3.3)

`src/api-storage.js` implements `ApiBoardRepository`, with async `load()`, `save(state)`, `importJSON(text)` and `exportJSON()`. Database-mode board startup now uses it after authentication.

Construct it with `{auth, fetchImpl=fetch, requestTimeoutMs=30000}`, where `auth` is the shared verified authentication controller. Call `load()` before saving. An account without a workspace returns `null` at revision `"0"`; the adapter does not create sample cards or write during a read. Every HTTP request obtains a fresh token and sends it only in the Authorization header. It never supplies an owner ID or touches local storage.

Operations are serialized. Each save uses the latest acknowledged revision as a string; revisions are compared using bigint. Successful responses are validated before replacing the acknowledged snapshot. UTF-8 JSON requests, including their wrapper, are limited to 5,000,000 bytes. Normal exports contain only the last acknowledged snapshot and do not fetch from the server; empty/unloaded workspaces cannot be exported.

`ApiStorageError.kind` distinguishes `auth`, `session`, `validation`, `size`, `conflict`, `network`, `service`, `response`, `not-loaded`, `empty`, `reload-required` and `revision-limit`. Errors never echo server response bodies, tokens or raw network diagnostics. Conflicts and uncertain write results block later writes until a successful `load()`; PUT is never retried automatically. The default 30-second timeout covers token retrieval, transmission and response parsing.

Read-only getters expose `revision`, `updatedAt`, `needsReload` and a defensive copy of `recoverySnapshot`. Recovery is the latest valid submitted candidate, including a queued edit that could not be sent. Reload keeps it for explicit review/reapplication; acknowledging that candidate clears it. The adapter serializes whole snapshots rather than merging concurrent edits. Conflict recovery controls and local-data transfer remain later integration tasks.

An authentication transition away from the bound verified account permanently invalidates the repository and cancels outstanding requests; late results cannot be adopted. Recovery is memory-only and is cleared with private state on invalidation or `dispose()`. The board warns before voluntary sign-out with pending/unsaved changes and offers recovery downloads for submitted edits. Create a new repository after reauthentication. No draft or token is persisted by this adapter.

### Save handling and status (Step 3.3.5)

`src/save-controller.js` owns acknowledged and retained candidate snapshots for both storage modes. All board mutations and backup imports use it. Editing and drag interactions are disabled while a save is pending; any event that still arrives is explicitly refused with a wait-and-retry message. The controller does not queue invisible extra actions or retry writes automatically.

The footer uses singular/plural card counts and distinguishes Not saved yet, Edits not saved, Saving, Saved to your account / Saved on this device, Not saved, Workspace changed elsewhere, and Save outcome unknown. A persistent accessible status region announces transitions. Existing local data initially uses the neutral Local browser storage label until an explicit save is acknowledged.

A failed valid submission stays in memory and is displayed as unsaved board state; editor values remain open. Definite rejections offer explicit Retry save or corrected resubmission. Conflicts and uncertain results block further writes and offer Download unsaved changes; that version-1 JSON contains the retained full workspace. Normal exports still contain acknowledged storage data only. Latest-version reload/merge controls remain Step 3.3.6.

Editor input, photo removal, Post-it controls, to-do toggles and project assignment changes mark forms dirty. Closing a dirty editor, voluntary sign-out, and browser navigation warn about unsaved work. Browser close warnings depend on browser support and user interaction and cannot guarantee recovery. Download needed recovery data before leaving; forced expiry/account changes clear private memory rather than exposing it to another account. Unsubmitted form fields remain in the editor and are not included in a submitted-candidate download until Save is attempted.

## Verify

`npm test` — persistence, import validation, write-failure safety, stable reorder and export/import tests.

`npm run check` — JavaScript syntax checks.

The loopback-only server serves only the app entry and source assets, not the downloaded website-review material. The app is an independent implementation; original public bundles are retained in website-review for analysis only and are not loaded by the app.
