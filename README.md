# Cardboard

A PAPEPPE-style planning board with a separate storage layer. The board currently uses browser-local storage; the Node backend provides Clerk session verification and a revisioned, private PostgreSQL workspace API. Connecting the board UI to that API is being implemented in Step 3.3.

## Run

Use Node.js 24 for development and deployment. Install dependencies with `npm install`. In this directory run `npm start` (or `node server.js`) for a standalone board without loading an environment file. With a configured `.env`, use `node app.cjs` or `node --env-file=.env server.js`. The tracked `app.cjs` loads `.env` next to the wrapper before importing the server; cPanel can use it as the startup file. Keep the working directory set to the application root.

Open http://127.0.0.1:4318 for local use. On Windows, use `npm.cmd` if PowerShell blocks npm.ps1. Keep the terminal running. Stop with Ctrl+C. `PORT` may override the port; preserve cPanel's supplied port configuration. Use the same address each time: localhost and 127.0.0.1 have separate browser storage.

## Environment and storage configuration (Step 3.3.1)

Each environment has its own ignored `.env`; never upload the local file over production or commit credentials. Use matching Clerk development keys locally and matching production keys on the hosted site. `CARDBOARD_ORIGIN` must be the exact application origin, without a trailing slash or path. Production keys require an explicit HTTPS origin. The server rejects mixed development/production keys and reports safe configuration errors without printing key values.

Storage selection is server-controlled:

| Setting | Behavior at this checkpoint |
| --- | --- |
| `CARDBOARD_STORAGE=local` | Existing standalone browser-local board; Clerk preview and workspace API remain available separately. |
| `CARDBOARD_STORAGE=database` | Requires valid Clerk configuration. Board entry points show the shared sign-in screen. After server verification, show the signed-in account and an integration-pending message. No local repository is opened; workspace loading follows in later Step 3.3 tasks. |
| Variable absent | Defaults to `local` for existing deployments. |
| Any other value, including blank | Startup fails with a configuration error. |

Keep deployments on `local` during this checkpoint. Change to `database` only after the board integration and recovery steps are ready and verified. Neither setting migrates browser cards automatically. `GET /api/config` reports the selected `storageMode` and whether the board is ready; it contains no credentials. Existing `/api/clerk-preview-config` exposes only the public Clerk key and origin when authentication is configured. These responses are not cached.

The sign-in preview at `/sign-in-preview` and database-mode board share `src/auth.js` and `src/auth-view.js`. They verify the signed-in session through `/api/me`, expose Sign in / Sign out and Retry actions, and discard delayed verification results on session changes. The database-mode entry screen displays only the verified account; it does not read cards from browser storage. Clerk tokens remain in memory. The workspace API remains authenticated in both storage modes. PostgreSQL settings are read only by the backend; `npm run db:migrate` applies the database migrations when intentionally requested.

## Features

Notes, checklists, weekly planners, links, boards, projects, dates, search (Ctrl/Cmd+K), pinning, sorting, drag reordering, keyboard-accessible move-earlier controls, and JSON backup/import. Click a card heading or its Edit control to edit. Card order is manual within pinned/unpinned groups. Switching to another sort disables drag ordering.

Data persists in localStorage for this browser and origin. Browser data clearing removes it; export backups from Board options. Imports validate before replacement and require confirmation. Multiple concurrent tabs/devices are not synchronized; use one tab for editing in this version. A database/API can add conflict handling later.

## Separate storage layer

`src/storage.js` is the only module that reads or writes browser storage. It exposes async `load()`, `save(state)`, `exportJSON()` and `importJSON(text)`. `src/app.js` injects the local repository at startup and calls these methods. A future HTTP adapter can implement the same contract and replace that constructor. The version-1 schema in `src/model.js` defines boards, projects and cards with stable IDs; checklist items also have stable IDs. `src/seed.js` supplies starter data. JSON exports are versioned.

The current workspace API stores a complete validated snapshot per verified Clerk account with revision-based concurrency. The upcoming HTTP repository will implement the same asynchronous boundary. Granular operations and offline synchronization are outside the first database-backed release.

## Verify

`npm test` — persistence, import validation, write-failure safety, stable reorder and export/import tests.

`npm run check` — JavaScript syntax checks.

The loopback-only server serves only the app entry and source assets, not the downloaded website-review material. The app is an independent implementation; original public bundles are retained in website-review for analysis only and are not loaded by the app.
