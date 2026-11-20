# Cardboard verification checklist

Updated November 20, 2026. Manual checks below are tracked separately from automated tests. A pending check is not a known defect. Confirmations are recorded only when reported by the user or directly observed.

## Outstanding manual verification

| ID | Step | Check | Status |
| --- | --- | --- | --- |
| V-01 | 3.3.4 / 3.3.7 | Two-account board isolation: B never sees A's cards; returning to A restores its workspace. | Deferred to Production; only one Development account available |
| V-02 | 3.3.5 | Save status for card, checkbox, project, board, layout and drag actions; no accepted rapid action disappears. | Requested local PostgreSQL save/reload checks passed (user confirmed November 20). Full action matrix and rapid-action checks remain pending. |
| V-03 | 3.3.5 | Definite failed-save retention, explicit retry, corrected resubmission and recovery download. | Pending |
| V-04 | 3.3.5 | Dirty editor/navigation/sign-out warnings, including photo removal and editor to-do toggles. | Requested dirty-editor cancellation warning passed (user confirmed November 20, local PostgreSQL). Navigation/sign-out and specialized editor checks remain pending. |
| V-05 | 3.3.6 | Two-tab conflict: check latest, choose latest, and separately confirm whole-workspace replacement. | Pending |
| V-06 | 3.3.6 | Intervening save between check and replacement produces another conflict; checking itself does not increment revision. | Pending |
| V-07 | 3.3.6 | Open-editor recovery works; cancelling a choice retains unsubmitted fields; confirmed success closes editors. | Pending |
| V-08 | 3.3.6 | Network-loss recovery and matching saved-content confirmation where practical. Commit-then-lost-response is covered automatically. | Pending |
| V-09 | 3.3.7 | Clean sign-out and dirty/pending sign-out: cancel preserves work; proceed clears private UI and recovery. Download needed data first. | Pending |
| V-10 | 3.3.7 | Expiry or rejected session during load/save/recovery clears private data, stops writes and offers sign-in. | Pending |
| V-11 | 3.3.7 | Same-profile cross-tab sign-out covers/clears the matching session without affecting unrelated sessions. | Pending |
| V-12 | 3.3.7 | Return to a background tab and Back/Forward restoration verify identity before exposing private content. | Pending |
| V-13 | 3.3.7 | Offline foreground check covers UI and keeps same-session edits; Retry restores them after verification. | Pending |
| V-14 | 3.3.7 | Switch accounts during pending load/save/export/import/recovery; no old completion alters the new account. | Deferred to Production |
| V-15 | 3.3.8 | Import local cards: verify source/destination account and counts; download both backups and cancel. Source and account stay unchanged. | Pending |
| V-16 | 3.3.8 | Confirm an import into a disposable account workspace, reload, and verify all boards/projects/cards; verify original local data remains intact. Download needed data first. | Pending |
| V-17 | 3.3.8 | Missing local data offers JSON selection; import from another address/browser via backup. Invalid/oversized sources cannot replace the account. | Pending |
| V-18 | 3.3.8 | Change the account workspace in another tab after preview; import reports conflict and offers recovery without overwriting the newer version. | Pending |
| V-19 | 3.3.8 | Switch accounts during the file picker, file read, destination preview and save; old results never update the new account. | Deferred to Production |

## Confirmed milestones

| Step | Evidence |
| --- | --- |
| 3.2.5 | User confirmed Production API ownership, persistence, claimed-owner rejection, stale-save 409, unsigned GET/PUT 401 and test cleanup. |
| 3.3.2 | User manually confirmed shared sign-in flow. |
| 3.3.4 | User confirmed note creation/reload persistence, load failure/Retry and refresh without a revision change. Two-account UI check remains V-01. |
| 3.3.9 | November 20: user confirmed the requested local PostgreSQL checks passed: ordinary edit/save, project or layout change, persistence after reload with saved status, and warning on cancelling a dirty editor. This confirmation covers the requested subsets of V-02/V-04, not the full release checklist. |

## Automated verification

Step 3.3.9 is in progress. See [release-readiness.md](release-readiness.md) for reproducible manual procedures, production gates and rollback. Manual passes are recorded above only to the extent reported. No Git checkpoint, deployment or database restore is implied by this status.

Independent final review found no remaining actionable issues in the inspected implementation or release instructions. The hosting install procedure preserves cPanel's managed node_modules symlink. Local runtime dependency-tree verification also passed. Browser automation and production SSH were unavailable in this session; manual rows remain pending until observed or reported.

Latest run (Step 3.3.9, November 20, 2026): 145/145 tests pass, including fixture-backed storage/recovery/session transitions, migration and loopback HTTP checks. Syntax and whitespace checks pass. Release smoke coverage traverses both browser entry points' module dependencies, checks styles and private-file denial, and rejects unsigned workspace GET/PUT. Migration coverage includes isolated previews, explicit destination revisions, conflict recovery, original-source preservation, legacy/invalid/oversized input, absent workspaces and account-bound picker/preview cancellation. Independent migration review found no material ownership or revision issues. The session review finding (late token transmission after suspension) was fixed with failing-then-passing regression tests. Automated tests do not mark the manual rows above passed.

## Tracking rules

Use Pending, Passed, Failed or Deferred to Production. Record the account/environment and evidence when a check passes or fails, without tokens, passwords, private card contents or invitation links. Preserve unresolved checks across steps and deployments. Earlier local checks do not prove hosted configuration or multi-account UI behavior.
