# Phase 3 — Test Results

Pass run under `.claude/skills/e2e-testing` (feature-workflow step 8).

- **Date:** 2026-11-01 (Sunday, Asia/Manila)
- **Branch:** `phase-3-employee-web-app`
- **Test deployment:** throwaway project `hr-e2e-phase3`, deployment `hidden-crane-700`. Admin was `e2e-admin` with a random password.
- **Isolation checks (all passed before the run):**
  - both `dist/hr` and `dist/web` referenced `hidden-crane-700` only, not `woozy-nightingale-996`
  - the deployment held exactly one user, the admin
  - `admin:isAdmin` returned `false` for an anonymous caller
  - `E2E_PURGE_ALLOWED` was set on the test deployment
- **Backend:** `npm test` (Vitest + convex-test). 96/96 pass after the review fixes.
- **E2E drivers:** Playwright over Electron (`hr` project) and Playwright in system Chrome against `vite preview` of `dist/web` (`web` project). Final full run: 32 pass, 4 skipped, 0 fail, exit 0. The 4 skipped tests are the Phase 0/1 weekday-only punch tests and still need a weekday run.
- **Setup path:** web tests create `E2E-` employees through a `ConvexHttpClient` signed in as `e2e-admin` against the real deployment, and seed a punch with `e2e:seedPunch`. Nothing is stubbed.
- **Real bugs the E2E found:**
  - The inactive-sign-in check was attached to the wrong provider property, so an inactive employee could sign in. Fixed and re-verified.
  - The login error read "employee id". Fixed.
- **Watched fail:**
  - `inactive employee can't log in` failed before the fix above.
  - With `mustChangePassword` forced to false on the test deployment, the forced-change test failed.
  - `cleared month` showed "Loading…" before the guard.
  - `lockout after 10 wrong passwords` showed "Invalid employee ID or password" before the mapping.
  - All passed again after the code was restored or fixed.
- **Purge:** `{"users":87,"accounts":87,"attendance":20,"holidays":3,"rateLimits":14,"sessions":54,"refreshTokens":76}`. Afterwards only the admin user and account were left, plus the admin's own 75 sessions. 0 attendance, 0 rate-limit rows.
- **Left behind:** the Convex project `hr-e2e-phase3`, which the developer deletes in the dashboard.

## US-7 Employee logs in to the web app

| Condition | Test | Result |
|---|---|---|
| Accepts: valid ID + temp password log in, then force a password change first | E2E `temp password forces a change…` (change screen, no table); backend `me: new employee must change password`, `monthly: blocked until password changed` | PASS |
| Accepts: after the change, the new password works and the old one doesn't | E2E same test (old → `Invalid employee ID or password`, new → DTR); backend `changePassword: new works, old does not` | PASS |
| Rejects: wrong password shows an error | E2E `wrong password shows error` | PASS |
| Rejects: inactive employee can't log in | E2E `inactive employee can't log in` (`Account inactive`); backend `me`/`monthly`/`changePassword` reject inactive | PASS |
| Edge: confirm mismatch, wrong current, short or same new password | E2E `mismatched confirm and wrong current…`; backend `changePassword: wrong current, short or same new rejected…` | PASS |
| Edge: lockout after 10 failures is reported | E2E `lockout after 10 wrong passwords…`; backend `changePassword: too many wrong attempts says so` | PASS |
| Edge: password change ends other sessions | backend `changePassword: signs out other sessions, keeps this one` | PASS (backend) |
| Edge: HR admin in the web app | E2E `HR admin can't use the employee app` | PASS |

## US-8 Employee views their own DTR

| Condition | Test | Result |
|---|---|---|
| Accepts: pick a month, daily rows with all columns | E2E `month shows daily values and totals, read-only` (2026-10-30: `08:20`, `17:00`, `7h 40m`, `20m`, `—`, `20m`, `Late`) | PASS |
| Accepts: monthly totals | same E2E (`7h 40m`, `20m`, `—`, `20m`, `Required 8h · Absences 0`); backend `monthly: own month after change…` | PASS |
| Rejects: another employee's data returns an auth error, enforced in Convex | E2E `employee session can't read another employee or call HR functions` (HTTP client: `attendance.monthly`, `employees.create`, `attendance.punch` → `Not authorized`); backend `HR functions reject an employee session` | PASS |
| Rejects: no create, edit, or delete controls | same E2E: only `Log out` button on the page | PASS |
| Edge: HR-only corrections never reach employees | backend `monthly: own month after change, without corrections` | PASS (backend) |
| Edge: month before hire, cleared month, deactivated mid-session | backend `monthly: month before hire is empty`; E2E `cleared month asks for a month…`, `deactivated while signed in…` | PASS |
