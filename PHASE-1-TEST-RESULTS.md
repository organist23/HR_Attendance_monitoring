# Phase 1 — Test Results

Pass run under `.claude/skills/e2e-testing` (feature-workflow step 8).

- **Date:** 2026-11-01 (Sunday, Asia/Manila)
- **Branch:** `phase-1-dtr-holidays`
- **Test deployment:** throwaway project `hr-e2e-phase1`, deployment `trustworthy-barracuda-670`. Admin was `e2e-admin` with a random password.
- **Isolation checks (all passed before the run):**
  - the build referenced `trustworthy-barracuda-670` only, not `woozy-nightingale-996`
  - the deployment held exactly one user, the admin
  - `admin:isAdmin` returned `false` for an anonymous caller
  - `E2E_PURGE_ALLOWED` was set on the test deployment
- **Backend:** `npm test` (Vitest + convex-test). 65/65 pass after the review fix pass.
- **E2E driver:** Playwright over Electron (`npm run e2e`). 17 pass, 4 skipped, 0 fail, exit 0.
- **Mutation check:** with five UI behaviors broken on purpose (holiday name hidden in the DTR, not-found text changed, Absences total hidden, Remove a no-op, add error swallowed), all 5 runnable new scenarios failed. They passed again after the code was restored.
- **Re-verify after the review fix pass** (absences stop at deactivation, and the creation day is no longer Absent): fresh throwaway project `hr-e2e-phase1b`, deployment `jovial-goose-577`. The same 4 isolation checks passed. 17 pass, 4 skipped, 0 fail, exit 0. Purge: `{"users":9,"accounts":9,"attendance":0,"holidays":1,"sessions":0,"refreshTokens":0}`, after which only the admin was left.
- **Re-run finding, fixed in the tests:** a second run before purge failed because the holiday tests reused fixed dates. Those tests now use unique far-future dates, and the DTR holiday test removes its own holiday. Two back-to-back runs then passed.

Exact US-4 values (rendered, late, undertime, missing per day, and monthly totals) need controlled punch times. Server time can't be set in E2E, so the backend tests prove them with hand-derived values: `convex/lib/dtr.test.js` has 13 cases and `convex/attendance.test.js` covers the month.

## Per story

### US-4 System computes daily attendance
| Condition | Test | Result |
|---|---|---|
| Accepts: 8:10–17:00 → 8h, Present | backend `dtr.test.js` | PASS (backend) |
| Accepts: 8:20–17:00 → 7h40m, late 20m, missing 20m, Late | backend `dtr.test.js`, `monthly: daily rows and totals` | PASS (backend) |
| Accepts: 8:00–16:00 → 7h, undertime 60m, missing 1h | backend | PASS (backend) |
| Accepts: 8:00–11:00 → 3h, undertime 300m, missing 5h | backend | PASS (backend) |
| Accepts: time-in only → Incomplete, 0h, missing 8h | backend; E2E `time-in only shows Incomplete for today` | PASS (backend), E2E SKIPPED (weekend) |
| Accepts: past workday without time-in → Absent, missing 8h | backend `monthly: daily rows and totals` | PASS (backend) |
| Accepts: HR views a monthly DTR with daily rows and totals | E2E `DTR shows the employee's month with today's row and totals` | PASS |
| Rejects: 7:30–18:00 not over 8h | backend | PASS (backend) |
| Rejects: weekends and holidays not Absent, no required hours | backend `monthly: holiday is not absent…`; E2E holiday row in DTR | PASS |
| Rejects: today and future not Absent | backend `monthly: daily rows and totals` | PASS (backend) |
| Edge: unknown employee ID | E2E `unknown ID shows Employee not found`; backend returns null | PASS |

### US-5 HR manages holidays
| Condition | Test | Result |
|---|---|---|
| Accepts: add holiday, the date drops out of required hours and absences | E2E `added holiday appears in list and drops out of the DTR`; backend monthly holiday tests | PASS |
| Accepts: remove holiday, the date becomes a workday again | E2E `remove drops the holiday`; backend `remove makes the date a workday again` | PASS |
| Rejects: duplicate date shows error | E2E `duplicate date shows error`; backend | PASS |

### US-3 (holiday rejection added this phase)
| Condition | Test | Result |
|---|---|---|
| Rejects: punch on a holiday → "Not a workday" | backend `punch on a holiday rejected, no row` | PASS (backend) |

Phase 0 E2E tests: all still pass, and the 3 workday-only tests were SKIPPED (weekend).

**Still needs a weekday run:** 3 Phase 0 workday tests, plus `time-in only shows Incomplete for today`.

## Teardown

- Purge counts on the final run: `{"users":13,"accounts":13,"attendance":0,"holidays":3,"sessions":0,"refreshTokens":0}`. Earlier runs were purged too. Afterwards the deployment held only the admin, and the holidays and attendance tables were empty.
- `.env.local` restored to `woozy-nightingale-996`, `.env.e2e` deleted, `dist/hr` rebuilt and confirmed to point at dev.
- **Left behind:** the Convex projects `hr-e2e-phase1` and `hr-e2e-phase1b`. The developer deletes them from the dashboard.
