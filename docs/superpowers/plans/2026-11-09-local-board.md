# Local Board Implementation Plan

Goal: a standalone PAPEPPE-style board with a replaceable asynchronous storage repository.
Architecture: browser-native ES modules, stable IDs, versioned JSON, localStorage only inside its adapter. No dependencies or live account connection. Use representative sample content.

- [x] Write and run repository tests for persistence, failed writes, invalid imports, and pinned reordering.
- [x] Implement src/model.js, src/storage.js, src/seed.js.
- [x] Build responsive board with editing, checklists, search, filters, projects, dates, pinning, sorting, drag and keyboard reorder, import/export.
- [x] Verify tests, syntax and browser interactions; document API migration.

Review focus: preserve data on invalid import; surface save failures; render user content as text; preserve pinned grouping; support mobile and keyboard use.

Verification: 10 Node tests pass; syntax checks pass. Browser verified card creation, literal-text rendering, search, persistence after reload, checklist persistence, editor visibility, board options and 390px mobile layout without page overflow. Independent review findings fixed: malformed URLs, repeated checklist IDs, active-board change before save. Default preview port changed to 4318 after port 4173 was unavailable. No Git checkout exists; no commits were created.
