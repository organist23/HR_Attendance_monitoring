# Phase 0 — Test Results

Pass run under `.claude/skills/e2e-testing` (feature-workflow step 8).

- **Date:** 2026-11-01 (Sunday, Asia/Manila)
- **Commit:** `a184ba6` on `phase-0-record-punches`
- **Test deployment:** throwaway project `hr-e2e-phase0`, deployment `hardy-malamute-410`. Admin was `e2e-admin` with a random password.
- **Isolation checks (all passed before the run):**
  - the build referenced `hardy-malamute-410` only, not `woozy-nightingale-996`
  - the deployment held exactly one user, the admin
  - `admin:isAdmin` returned `false` for an anonymous caller
  - `E2E_PURGE_ALLOWED` was set on the test deployment
- **Backend:** `npm test` (Vitest + convex-test). 33/33 pass.
- **E2E driver:** Playwright over Electron (`npm run e2e`). 12 pass, 3 skipped, 0 fail, exit 0.

## Per story

### US-1 HR login
| Condition | Test | Result |
|---|---|---|
| Accepts: correct credentials open HR screen | correct login shows Punch tab | PASS |
| Accepts: logout returns to login | logout returns to login | PASS |
| Rejects: wrong password shows error | wrong password shows error and stays on login | PASS |
| Rejects: unauthenticated HR calls refused | backend: `requireAdmin` tests plus non-admin tests on every function | PASS (backend) |
| Review fix: employee account in HR app | employee account sees Not authorized and can log out | PASS |

### US-2 Manage employees
| Condition | Test | Result |
|---|---|---|
| Accepts: create appears in list | create employee appears in list as Active | PASS |
| Accepts: deactivate shows inactive | deactivate shows Inactive | PASS |
| Accepts: search filters | search filters list | PASS |
| Accepts: paginated with 300+ | backend: `list paginates 25 then 5` | PASS (backend) |
| Rejects: duplicate ID | duplicate ID shows error | PASS |
| Rejects: empty fields | blank fields show required error | PASS |

### US-3 Record punch
| Condition | Test | Result |
|---|---|---|
| Accepts: first punch = time-in, second = time-out | punch in then out shows Timed in then Timed out | SKIPPED (weekend). Backend tests PASS |
| Accepts: today's list shows status | same | SKIPPED (weekend). Backend tests PASS |
| Rejects: unknown ID | unknown ID shows Employee not found | PASS |
| Rejects: inactive ID | inactive ID shows Employee inactive | PASS |
| Rejects: third punch | third punch shows Already timed out | SKIPPED (weekend). Backend tests PASS |
| Rejects: rest day | weekend punch shows Not a workday | PASS |
| Review Focus #5: double Enter sends one punch | double Enter sends one punch | SKIPPED (weekend). Not proven |

## Teardown
- `e2e:purge` on `hardy-malamute-410` removed users 7, accounts 7, attendance 0, sessions 0, refresh tokens 0. One user remains, the test admin.
- `.env.local` restored to `woozy-nightingale-996`, `.env.e2e` removed, and `dist/hr` rebuilt and checked against dev.
- One-off dev cleanup, approved by the developer: `e2e:purge` on `woozy-nightingale-996` removed 60 users, 60 accounts, 1 session and 2 refresh tokens from passes run before this skill existed. `E2E_PURGE_ALLOWED` was then removed from dev, which `env list` confirms.

## Left behind
- Nothing. The developer deleted the Convex project `hr-e2e-phase0` in the dashboard (2026-11-01).

## Open
- On a weekday (Manila), run a new pass under the e2e-testing skill to execute the 3 skipped workday tests.
