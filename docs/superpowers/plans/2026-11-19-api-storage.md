# Step 3.3.3: API Storage Adapter Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the authenticated revisioned repository without connecting it to board startup.

**Architecture:** src/api-storage.js implements load/save/importJSON/exportJSON. A repository is permanently bound to the verified authentication session at construction. Requests and state mutations are serialized. Last acknowledged data and latest valid submitted recovery data are separate in-memory copies. The server remains responsible for ownership.

**Tech Stack:** Existing browser ES modules and Node test runner; no dependencies or backend schema changes.

**Spec:** User-approved Step 3.3.3 task list in this conversation.

## Global Constraints

- No board startup, environment file, database, production or deployment changes.
- Acquire a current token for each request; never persist tokens or include client-supplied ownership fields.
- Revisions remain decimal strings with bigint comparisons, never JavaScript numbers.
- Validate snapshots and responses before accepting them. Load does not write; an absent snapshot returns null.
- Serialize operations; never automatically retry PUT. Conflicts and uncertain outcomes require a successful reload.
- Enforce the backend's 5,000,000-byte UTF-8 request limit, including the JSON wrapper.

## Review Focus

- Late token, response and JSON parsing results must not leak data after an account change or dispose.
- An accepted server write followed by a lost response must not be blindly resent.
- A failed first write must stop later queued writes, while the latest valid submitted edit remains recoverable.
- Reloading must not silently delete recovery data or overwrite an acknowledged snapshot with malformed data.
- A returned save revision must equal the expected revision plus one.

## Tasks

- [x] Write failing tests for the repository contract, owner binding, response validation and queued revisions.
- [x] Implement ApiBoardRepository and typed safe errors in src/api-storage.js.
- [x] Test import/export isolation, byte limits, conflicts, uncertain outcomes and session changes during requests.
- [x] Document the interface and rollout boundary; add syntax coverage.
- [x] Run full checks and a separate read-only review. Leave the result uncommitted for user review.

## Interface

`new ApiBoardRepository({auth, fetchImpl=fetch, requestTimeoutMs=30000})` requires auth.state.status === 'verified', a userId, getToken() and subscribe(). Async load returns snapshot or null; save and importJSON return the acknowledged snapshot; exportJSON returns the last acknowledged non-null snapshot as JSON without issuing a read. Read-only revision, updatedAt, needsReload and recoverySnapshot getters expose defensive copies where applicable. dispose() cancels outstanding requests and discards in-memory data. All access is refused after session invalidation.

Recovery retains the latest valid submitted snapshot, including a queued save that could not run. Successful reload clears the write block but retains recovery; successful acknowledgement of that candidate clears it. Queued full snapshots are serialized, not merged; callers remain responsible for constructing each intended state. Normal exports contain acknowledged data only. Request timeouts and uncertain responses block subsequent writes until reloaded.

## Verification

- Initial repository tests failed with the module absent, then passed after implementation.
- 16 focused repository tests and all 74 project tests pass. HTTP tests use temporary loopback servers with fixture credentials.
- npm run check and git diff --check pass.
- A separate read-only reviewer found no material issues and independently ran the 16 focused tests successfully.
- No live database calls, environment edits, board startup changes, commits or deployment performed. Integration with real authenticated board loading remains Step 3.3.4.
