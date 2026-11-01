# Phase 2 — Test Results

Pass run under `.claude/skills/e2e-testing` (feature-workflow step 8).

- **Date:** 2026-11-01 (Sunday, Asia/Manila)
- **Branch:** `phase-2-corrections`
- **Test deployment:** throwaway project `hr-e2e-phase2`, deployment `adjoining-civet-921`. Admin was `e2e-admin` with a random password.
- **Isolation checks (all passed before the run):**
  - the build referenced `adjoining-civet-921` only, not `woozy-nightingale-996`
  - the deployment held exactly one user, the admin
  - `admin:isAdmin` returned `false` for an anonymous caller
  - `E2E_PURGE_ALLOWED` was set on the test deployment
- **Backend:** `npm test` (Vitest + convex-test). 84/84 pass after the review fixes.
- **E2E driver:** Playwright over Electron (`npm run e2e`). Final full run: 21 pass, 4 skipped, 0 fail, exit 0. The US-6 group was re-run after the last fix: 5/5 pass.
- **Weekday independence:** US-6 tests seed a punch on Fri 2026-10-30 through the internal `e2e:seedPunch` (same `E2E_PURGE_ALLOWED` gate as purge, `E2E-` IDs only), so they run on any day. The 4 skipped tests are the Phase 0/1 weekday-only punch tests and still need a weekday run.
- **RED before GREEN:** the 4 original US-6 tests ran against the old UI first and all failed waiting for the Edit button.
- **Mutation checks:** with `correct` skipping its patch on the test deployment, the accept test failed (`Present · Corrected` not shown). With the server's same-minute compare removed, `untouched time-in with seconds` failed (2 history lines instead of 1). Both passed again after the code was restored.
- **Purge:** 42 `E2E-` users removed, along with their attendance. Afterwards only the admin was left (0 attendance, 0 holidays).
- **Left behind:** the Convex project `hr-e2e-phase2`, which the developer deletes in the dashboard.

## US-6 HR corrects an attendance record

| Condition | Test | Result |
|---|---|---|
| Accepts: edit time-in or time-out with a reason, and values recompute | backend `correct: time-out edit…`, `correct: time-in edit…`; E2E `adding a time-out and fixing time-in…` (8h Present, then 7h 40m, late 20m, Late) | PASS |
| Accepts: each correction stores old, new, timestamp, reason | backend `correct: time-out edit recomputes and logs` (exact entry), `second correction appends` | PASS (backend) |
| Accepts: correction history shown on the record | E2E history lines `Time out: — → 17:00 · …` and `Time in: 08:00 → 08:20 · …` | PASS |
| Accepts: add a missing time-out to an Incomplete day | backend `correct: adds missing time-out…`; E2E same accept test | PASS |
| Rejects: empty reason shows an error, nothing changes | backend `correct: reason trimmed; blank or too long rejected…`; E2E `blank reason shows error…` (focus returns to Reason) | PASS |
| Rejects: time-out earlier than time-in shows an error, nothing changes | backend `correct: time-out not after time-in…` (07:59, equal, time-in moved past out); E2E `time-out before time-in…` | PASS |
| Edge: Absent day gets a record (user decision) | backend `correct: Absent day gets a record` | PASS (backend) |
| Edge: weekend or holiday new record, future time, invalid date or time, no-op, unknown employee, non-admin | backend `correct: …` tests | PASS (backend) |
| Edge: untouched time-in with seconds not logged | backend `same minute as a punch with seconds…`; E2E `untouched time-in with seconds…` | PASS |
| Edge: Escape closes the form and focus returns to Edit | E2E `Escape closes the form…` | PASS |
