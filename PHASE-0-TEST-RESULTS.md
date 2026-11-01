# Phase 0 — Test Results

- **Date:** 2026-11-01 (Sunday, Asia/Manila)
- **Commit:** `92c4203` on `phase-0-record-punches`
- **Backend:** `npm test` (Vitest + convex-test). 30/30 pass.
- **E2E driver:** Playwright over Electron (`npm run build && npm run e2e`) against Convex dev deployment `woozy-nightingale-996`. 12 pass, 3 skipped, 0 fail.

## Per story

### US-1 HR login (E2E)
| Condition | Test | Result |
|---|---|---|
| Accepts: correct credentials open HR screen | correct login shows Punch tab | PASS |
| Accepts: logout returns to login | logout returns to login | PASS |
| Rejects: wrong password shows error | wrong password shows error and stays on login | PASS |
| Rejects: unauthenticated HR calls refused | backend `requireAdmin rejects unauthenticated` / `role employee` + per-function non-admin tests | PASS |
| (review fix) employee account in HR app | employee account sees Not authorized and can log out | PASS |

### US-2 Manage employees (E2E)
| Condition | Test | Result |
|---|---|---|
| Accepts: create appears in list | create employee appears in list as Active | PASS |
| Accepts: deactivate shows inactive | deactivate shows Inactive | PASS |
| Accepts: search filters | search filters list | PASS |
| Accepts: paginated with 300+ | backend `list paginates 25 then 5` | PASS (backend only) |
| Rejects: duplicate ID | duplicate ID shows error | PASS |
| Rejects: empty fields | blank fields show required error | PASS |

### US-3 Record punch (E2E)
| Condition | Test | Result |
|---|---|---|
| Accepts: first punch = time-in, second = time-out | punch in then out shows Timed in then Timed out | SKIPPED (weekend) — backend tests PASS |
| Accepts: today's list shows status | same | SKIPPED (weekend) — backend tests PASS |
| Rejects: unknown ID | unknown ID shows Employee not found | PASS |
| Rejects: inactive ID | inactive ID shows Employee inactive | PASS |
| Rejects: third punch | third punch shows Already timed out | SKIPPED (weekend) — backend tests PASS |
| Rejects: rest day | weekend punch shows Not a workday | PASS |
| Review Focus #5: double Enter sends one punch | double Enter sends one punch | SKIPPED (weekend), not proven |

## Left behind
- Employees `E2E-<timestamp>` created by each run remain in the dev deployment (Phase 0 has no delete).
- Their attendance: none (all runs on a weekend).

## Open
- Re-run `npm run build && npm run e2e` on a weekday (Manila) to execute the 3 skipped workday tests.
