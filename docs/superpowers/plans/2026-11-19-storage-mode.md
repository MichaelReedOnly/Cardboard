# Step 3.3.1: Configuration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish reviewed development/production authentication configuration and explicit storage selection before connecting the board to the API.

**Architecture:** A pure server configuration module validates environment values. The existing server consumes it and exposes only browser-safe configuration. The local repository remains unchanged in this step.

**Tech Stack:** Node.js 24, browser ES modules, Clerk backend SDK, Node test runner.

**Spec:** User-approved Step 3.3 design in this conversation: online-first hosted PostgreSQL, explicit standalone local mode, recovery for failed edits, offline synchronization deferred.

## Global Constraints

- Preserve environment-specific .env files; never include secret values in logs or public configuration.
- No production deployment, database writes, or migration in this step.
- Continue in the existing checkout. No worktree or dependency change is needed.
- Database selection must not silently render the local-storage board.

## Review Focus

- Mixed test/live credentials must never configure a verification client.
- Live credentials require an explicit HTTPS application origin.
- Unknown storage settings must stop startup instead of reverting to local.
- Database mode must remain blocked until the authenticated board adapter exists.
- Missing authentication must leave the local-only board usable and diagnostics must not expose credentials.

## Task 1: Reconcile authentication and storage configuration

**Files:** backend/config.js, server.js, src/sign-in-preview.js, tests/config.test.js.

**Interface:** readServerConfig(env) returns storageMode, origin, publishableKey, secretKey, clerkOrigin, authConfigured, authError. getPublicConfig(config) exposes only storage mode and adapter readiness. No secrets in either public endpoint.

- [x] Add failing tests for both key environments, mismatched/missing/malformed keys, live origin restrictions and invalid storage settings.
- [x] Implement configuration extraction and integrate with the server and neutral preview wording.
- [x] Add HTTP checks proving database mode blocks board entry points while the preview/API remain usable, and that public responses exclude secrets.
- [x] Run full tests and syntax checks; inspect the diff.

## Task 2: Document rollout

**Files:** README.md, docs/superpowers/plans/2026-11-19-storage-mode.md.

- [x] Document local/database selection, existing startup wrapper, production reconciliation limits, and Step 3.3.2 onward.
- [x] Leave changes reviewable without committing or deploying automatically.

## Reconciliation baseline

Local HEAD and locally recorded origin/main are 3c67f33. That commit tracks app.cjs only; server.js remains development-only. Production production-key support was verified through the public endpoint and user sign-in tests, but its exact source is not available in this checkout. This step creates the shared reviewed implementation; it does not claim byte-for-byte equality with the hosted files. Production .env and hosting-specific files must be preserved during later deployment.

## Verification record

- Configuration tests initially failed because backend/config.js did not exist; all five pass with the implementation.
- Full suite: 48/48 pass, including actual HTTP checks using temporary loopback servers and fixture keys only. The first sandboxed run blocked loopback connections with EACCES; rerunning with network permission passed.
- Syntax and whitespace checks pass. No environment files, database records, or production files changed.
- Review: inspected config, server integration, public responses, startup wrapper and tests. Database mode deliberately blocks the board at this intermediate checkpoint; keep the current deployment in local mode until the remaining Step 3.3 integration is ready.
- Reconciliation limitation: no authenticated SSH connection or production source download was available to this process. Hosted source comparison remains a deployment check; the new local configuration replaces the known development-only checks.
