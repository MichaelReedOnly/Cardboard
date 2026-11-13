# Cardboard

A standalone, local PAPEPPE-style planning board. No account, remote services, analytics, or runtime dependencies. Includes representative sample cards rather than private account data.

## Run

Requires Node.js 20+. In this directory run `npm start` (or `node server.js`), then open http://127.0.0.1:4318. On Windows, use `npm.cmd` if PowerShell blocks npm.ps1. Keep the terminal running. Stop with Ctrl+C. `PORT` may override the port. Use the same address each time: localhost and 127.0.0.1 have separate browser storage.

## Features

Notes, checklists, weekly planners, links, boards, projects, dates, search (Ctrl/Cmd+K), pinning, sorting, drag reordering, keyboard-accessible move-earlier controls, and JSON backup/import. Click a card heading or its Edit control to edit. Card order is manual within pinned/unpinned groups. Switching to another sort disables drag ordering.

Data persists in localStorage for this browser and origin. Browser data clearing removes it; export backups from Board options. Imports validate before replacement and require confirmation. Multiple concurrent tabs/devices are not synchronized; use one tab for editing in this version. A database/API can add conflict handling later.

## Separate storage layer

`src/storage.js` is the only module that reads or writes browser storage. It exposes async `load()`, `save(state)`, `exportJSON()` and `importJSON(text)`. `src/app.js` injects the local repository at startup and calls these methods. A future HTTP adapter can implement the same contract and replace that constructor. The version-1 schema in `src/model.js` defines boards, projects and cards with stable IDs; checklist items also have stable IDs. `src/seed.js` supplies starter data. JSON exports are versioned.

For a production API, evolve the repository into granular card/board operations with server validation, authorization and revision-based concurrency, rather than sending entire snapshots for every change. The current asynchronous boundary avoids coupling UI code to localStorage; it does not implement remote collaboration.

## Verify

`npm test` — persistence, import validation, write-failure safety, stable reorder and export/import tests.

`npm run check` — JavaScript syntax checks.

The loopback-only server serves only the app entry and source assets, not the downloaded website-review material. The app is an independent implementation; original public bundles are retained in website-review for analysis only and are not loaded by the app.
