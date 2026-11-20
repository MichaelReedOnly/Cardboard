# Step 3.3.6: Workspace Recovery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** Resolve conflicts and uncertain saves without silently discarding candidates or overwriting newer data.

**Architecture:** Extend SaveController with a read-only latest-version check, structural JSON comparison, explicit adoption/discard and revision-checked replacement. ApiBoardRepository exposes serialized in-memory recovery clearing after a validated load. A separate recovery dialog remains usable above an open editor; replacing displayed data warns about unsubmitted editor values.

**Spec:** User-approved Step 3.3.6 enumeration in this conversation.

## Constraints and review focus

- No environment edits, real database test writes, production changes, commit or deployment.
- Checking latest never writes and preserves candidates on failure.
- Matching contents confirm presence at read time, not which request wrote them. Ignore object-key order but preserve array order and content.
- Different versions require an explicit choice; replacement applies to the whole workspace and uses the checked revision.
- An intervening server write must produce another conflict, with no automatic retry.
- Keep controller/repository recovery copies consistent, with clearing only after acknowledgement or explicit discard.
- Dispose/account changes invalidate pending checks and replacements.
- Recovery UI must work while an editor modal is open and warn before closing unsubmitted fields.

## Tasks

- [x] Write failing controller and repository recovery tests.
- [x] Implement latest checks, content comparison, version metadata and guarded choices.
- [x] Add accessible modal recovery controls, explicit replacement/discard confirmations and editor protection.
- [x] Verify failure, repeated conflicts, same-content outcomes, empty workspaces and account transitions.
- [x] Run full tests and syntax checks, review independently, and document manual verification.

## Completion boundary

No automatic merge or offline synchronization. Recovery compares whole version-1 workspace snapshots. Manual two-tab conflict and lost-response checks remain separate from automated fixture tests; previous Step 3.3.5 manual UI checks are not assumed passed.

## Verification record

- New recovery tests initially failed because the comparison/recovery methods did not exist, then passed after implementation.
- Final suite: 112/112 pass. npm run check and git diff --check pass. All persistence scenarios use fixture requests; no real database records were read or written for this step.
- Separate read-only review found no material functional issues. Its one assertion failure observed a concurrent singular/plural copy update; the final primary run includes the corrected assertion and all tests pass.
- Tests cover matching uncertain saves without resending, candidate preservation, explicit discard, whole-workspace replacement, repeated conflict, failed reads/replacements, empty server workspace, checked-revision validation, pending-operation guards, disposal during read/adoption and modal action/confirmation content.
- No environment or production changes, commit or deployment performed. Manual browser verification remains pending.

## Manual verification

Use two local tabs signed into the same development account. Load both, save a disposable test change in the first, then save a different change from the stale second tab. Confirm conflict status and retained data, open Review save recovery from the banner or editor, download the candidate, and Check latest version. Check must not increment the database revision. Exercise Use latest and, in a separate conflict, confirmed Replace; verify the resulting workspace after refresh. Keep another intervening save between check and replacement to confirm another conflict instead of overwrite.

Verify an open editor retains additional unsent values while checking and that cancelling a recovery confirmation leaves it intact. Confirm choosing a version warns about those values and closes editors only after success. Simulated lost-response-after-commit is covered by fixture tests; if manually testing network loss, do not assume the request committed without a matching latest-content check. Account-switch board UI checks remain deferred to the production accounts as previously recorded.
