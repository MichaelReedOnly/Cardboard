# Step 3.3.9 release readiness

Status: **verification in progress; production release not approved or deployed by this step.**

## Tested baseline

November 20, 2026: Windows checkout `C:\save\Cardboard`, Node v24.15.0. Starting HEAD is `50d3972444dcc3c9ad34770da33b81df207c544f`; uncommitted recovery, session and migration changes are part of the tested working tree. Record a new release commit before deploying; deploying the starting HEAD would omit those changes.

Automated child servers use fixture configuration, random loopback ports and no environment file. They do not establish that the running local app or hosted app has correct credentials/database settings. Actual environment values were not read or printed in this step.

## Local verification sequence

Run `npm test`, `npm run check`, and `git diff --check`. Record pass totals/date in verification.md. The HTTP smoke test traverses static browser imports and verifies module/style responses, private-file rejection and unsigned workspace GET/PUT rejection; it does not execute a browser or authenticate with Clerk.

For manual tests, use the configured local database-mode app and a workspace you can safely edit. Export needed data first. Follow the existing V-IDs in verification.md; record results individually, including environment, date and a short observation. Keep tokens, passwords and real card contents out of evidence.

1. **V-02, ordinary operations:** create/edit/reload each available card type; toggle checklist and single-to-do completion; confirm Photo device/URL content and Post-it styling persist. Create/rename/delete a temporary project; confirm cards survive project deletion. Create a temporary board. Change filters, columns, per-column text sizing and swap cards across columns; reload and verify saved preferences/placements. Watch Saving then Saved to your account. Try rapid actions; accepted changes must survive, while unavailable actions should be visibly disabled.
2. **V-03/V-04, failed saves and drafts:** using browser request blocking for `/api/workspace`, submit a disposable edit; confirm it remains visible with an honest failure/unknown status. Remove blocking. Use Retry only if offered; otherwise use recovery. Download and inspect a recovery backup. In a dirty editor, attempt cancellation/sign-out; cancel the warning and verify fields remain. Include photo removal and the editor to-do checkbox. Browser navigation dialogs depend on browser behavior.
3. **V-05–V-08, recovery:** open the same account in two tabs and load both. Save a disposable change in tab A, then save from stale tab B. B must report conflict. Download its retained edits, check latest and confirm GET does not advance revision. Cancel each recovery choice first. Separately test Use latest and explicit whole-workspace replacement. Repeat with an additional A save after B checks latest; B's replacement must conflict again. Test recovery with an editor open and with network loss; do not assume reconnect automatically retries an uncertain write.
4. **V-09–V-13, sessions:** test clean and dirty sign-out, warning cancellation, cross-tab sign-out, background return and Back/Forward restoration. Offline foreground verification must cover private UI; reconnect and Retry should restore same-session work. For expiry/rejection use a disposable session revoked through Clerk, not a fabricated bearer token. Confirm private UI and retained recovery are cleared when the session actually ends. Pending-request cases can use network throttling.
5. **V-15–V-18, migration:** export source and destination first. Open Import local cards; check account/counts and download both offered backups. Cancel and verify neither workspace changed. In a disposable destination, confirm replacement, reload and compare boards/projects/cards. Verify source local data still exists. Test JSON transfer from another browser/address, missing local data, invalid JSON and an over-limit payload. Save from a second tab after preview and verify conflict/recovery rather than overwrite.

Local mode is a separate regression check: run a separate server process without loading `.env`, with `CARDBOARD_STORAGE=local` explicitly set, using an unused port and separate browser origin. Confirm local create/save/reload/export/import still work without signing in. Do not overwrite the normal development environment file or assume local and database modes share storage.

## Production configuration and release gates

- Local manual checks must have evidence; unresolved failures require fixes and affected-check reruns. Production-only account switching checks remain open until the release candidate is on the host.
- Prepare an authorized Git checkpoint covering all intended tracked/new source, tests and docs. Review `git status` and the staged diff; exclude `.env`, backup JSON, logs and node_modules. Record exact release SHA and verified remote availability. No checkpoint or push is performed automatically by this document.
- On the host, activate its Node 24 environment and enter `/home/fuzzziai/public_html/cardboard`. Confirm cPanel startup is `app.cjs` and application root/working directory match. Preserve cPanel's supplied port. Do not launch a second unmanaged production server.
- Keep production `.env` on the host. Verify privately: `CARDBOARD_STORAGE=database`, origin `https://cardboard.fuzzhead.net`, matching production Clerk keys in the same instance, and server-local PG connection settings. Do not copy the development `.env` or print secrets to terminal evidence. Invite-only access must remain configured in Clerk.
- Take a restorable hosting/PostgreSQL backup, and record its identifier/time and restoration procedure. Export each test account workspace. Preserve a protected copy of the current deployed files, lockfile, startup wrapper and environment configuration; store backups outside the public web root. Record the pre-release commit and host modifications. A backup is not a confirmed restore test.
- Reconcile the host's uncommitted changes before updating. Do not use `git reset --hard`, force-pull or overwrite host-only fixes. Compare the deployment candidate with the protected old copy and preserve the node_modules virtual-environment symlink.
- Review migration files against the database's migration history. Steps 3.3.6–3.3.9 add no schema migration. Do not run a database migration merely as a smoke test; missing schema/history is a separate issue to resolve before release.

## Deployment sequence — execute only after deployment approval

1. Record the release SHA, old deployment SHA, backup identifiers and outstanding production checks.
2. Apply the reviewed release files/commit after host changes have been reconciled. Keep the production environment file and hosting files intact.
3. In the activated Node environment use the host's established `npm install --omit=dev` workflow, then verify `git diff --exit-code -- package.json package-lock.json` and `npm ls --omit=dev`. Stop if dependency manifests changed or the dependency tree is invalid; reconcile rather than accept an unreviewed dependency update. Preserve the host-managed node_modules symlink: do not use a clean-install command that removes it. Run `npm test` and `npm run check`. All current test dependencies are runtime/built-in. If the host disallows loopback test listeners, record that limitation and use the exact-release local automated evidence; do not claim a hosted suite pass. Stop on failures.
4. Restart through cPanel's Node application controls (or its documented Passenger restart procedure). Inspect the configured application log for startup errors without sharing credentials.
5. Open the site in a fresh browser. Confirm `/api/config` reports database mode, the sign-in screen appears, and unsigned `/api/me` and workspace GET/PUT return 401. A direct URL to `/api/me` may return 401 even after browser sign-in because the app uses bearer authorization; use the app's authenticated requests to verify sign-in.
6. With two invited accounts in the same production Clerk instance, complete V-01, V-14 and V-19. Use separate browser profiles. A disposable card created in A must never appear in B; reload and switching back must restore each account's own workspace. Exercise account changes during picker/read/preview and pending load/save/recovery; stale results must not update the new account. Repeat representative persistence/conflict/migration smoke checks against the hosted candidate.
7. Remove only explicitly created test records, verify real data remains intact, and record deployed SHA and results. Preserve unresolved V-IDs. Release completion requires the manual/production evidence, not only the automated test count.

## Rollback

If startup, identity isolation or persistence fails, stop testing and account writes while diagnosing. Record safe error/status evidence. Restore the previous reviewed application files and lockfile from the protected backup, preserve the correct production `.env` and hosting configuration, reinstall the matching dependencies and restart through cPanel. Verify sign-in and read-only workspace load first.

An application rollback must not automatically change `CARDBOARD_STORAGE` to local: that would display a different storage source and conceal database work. Do not overwrite newer database rows with old JSON backups as a rollback shortcut. This release has no schema changes, so application rollback should normally leave the database intact. Database restoration requires a separate explicit decision about writes after the backup and a defined restore point; it can discard newer work. If necessary, use the hosting restore procedure and reverify both accounts afterward.
