# Roadmap

## Part one — HR attendance recording and DTR

### Phase 0 — Record punches ✅ DONE (merged `32489ce`, 2026-11-01)

Proves the core loop: Electron + React app → Convex → punch saved and shown live.
Covers US-1, US-2, US-3.

- HR logs in with the shared admin account
- HR creates, searches, and deactivates employees
- Entering an employee ID saves time-in, then time-out, at server time
- Today's list shows each punched employee

**Done when:** the admin logs in, creates an employee, and two punches by employee ID show time-in and time-out in today's list. Unknown, inactive, third-punch, and non-workday punches are rejected. — **Verified** on 2026-11-01 with Playwright over Electron, run in a throwaway Convex project under the `e2e-testing` skill. 12 pass and 3 skipped. The punch-in/out, third-punch, and double-Enter tests only run on weekdays and still need one. Backend `npm test` 36/36. Results: `PHASE-0-TEST-RESULTS.md`.

Shipped as:
- `convex/auth.js`: Password sign-in only, sign-up disabled.
- `convex/lib/admin.js`: `requireAdmin`.
- `convex/admin.js`: `create` (CLI only), `isAdmin`.
- `convex/employees.js`: `create`, `list`, `setActive`.
- `convex/attendance.js`: `punch`, `today({ date })`.
- `convex/lib/manila.js`: `manilaDay`, `isWorkday`.
- `convex/e2e.js`: `purge`.
- `hr/` with `electron/main.cjs`: `Login`, `Punch`, `Employees`.

Deliberately not built, and why: lateness, undertime, and hours computation (Phase 1 owns it). Phase 0 only checks Saturdays and Sundays as non-workdays, and holiday management is also Phase 1. Corrections (Phase 2 owns it). Employee web app (Phase 3 owns it). Reports (Phase 4 owns it).

Conventions later phases inherit:
- Every public HR function calls `requireAdmin` first.
- Server rules throw `ConvexError` with user-facing text, and the UI shows it through `hr/errors.js`.
- All dates and workdays come from `convex/lib/manila.js`, and punch time is always server time.
- Employees are `users` rows with `role: "employee"`, and accounts are created only server-side through `createAccount`.
- Backend tests use `convex-test` with `test/convexHelpers.js`.
- E2E passes follow `.claude/skills/e2e-testing`, using a throwaway project and `E2E-` IDs, then purge.

### Phase 1 — DTR computation and holidays ✅ DONE (merged `7024b53`, 2026-11-01)

Covers US-4, US-5.

- Daily rendered, late, undertime, missing, and status per the spec's computation rules
- HR views any employee's monthly DTR with totals
- HR adds and removes holidays

**Done when:** the US-4 example days produce the exact values in the spec, and a holiday drops out of required hours and absences. — **Verified** on 2026-11-01. Backend `npm test` 65/65, with all US-4 example days as hand-derived cases. Playwright over Electron ran in throwaway Convex projects under the `e2e-testing` skill: 17 pass and 4 skipped. The 4 skipped tests (3 Phase 0 punch tests and the US-4 Incomplete test) only run on weekdays and still need one. Results: `PHASE-1-TEST-RESULTS.md`.

Shipped as:
- `convex/lib/dtr.js`: `computeDay({ timeIn, timeOut })`, all values in minutes.
- `convex/lib/manila.js`: adds `manilaMinutes`.
- `convex/holidays.js`: `list`, `add`, `remove`. Schema adds the `holidays` table.
- `convex/attendance.js`: `monthly({ employeeId, month, today })`, and `punch` rejects holidays.
- `convex/employees.js`: `setActive` stores `deactivatedOn`.
- `hr/` adds the `DTR` and `Holidays` tabs.

Picked up from Phase 0: the punch flow now rejects holidays (US-3).

Decisions made with the user: an on-time time-in with an early time-out (e.g. 8:00–16:00) is Present, with undertime shown. The Punch tab's Today list keeps "Timed in" and "Timed out".

Conventions later phases inherit:
- Every DTR number comes from `computeDay`, and every month comes from `attendance.monthly`. Phases 3 and 4 reuse them rather than recompute.
- A day counts toward required hours only if it is a non-holiday weekday and either has a time-in, or is after the creation day, before today, and before `deactivatedOn`.
- Queries that depend on "today" take the Manila date from the client.

Deliberately not built, and why: corrections (Phase 2 owns it), employee web app (Phase 3 owns it), reports (Phase 4 owns it).

### Phase 2 — Corrections ✅ DONE (merged `33d24bd`, 2026-11-01)

Covers US-6.

- HR edits time-in or time-out with a required reason, and the correction history shows on the record

**Verified** on 2026-11-01. Backend `npm test` 84/84. Playwright over Electron ran in a throwaway Convex project under the `e2e-testing` skill: 21 pass and 4 skipped. All 5 US-6 tests run on any day because they seed a past punch. The 4 skipped tests are the Phase 0/1 weekday-only punch tests and still need a weekday run. Results: `PHASE-2-TEST-RESULTS.md`.

Shipped as:
- `convex/attendance.js`: `correct({ employeeId, date, timeIn?, timeOut?, reason })` with Manila `"HH:MM"` times. `monthly` days add `corrections`.
- Schema: attendance rows add `corrections: [{ field, from?, to, reason, at }]`, oldest first.
- `convex/lib/manila.js`: adds `isRealDate`, which `holidays.add` also uses.
- `convex/e2e.js`: adds internal `seedPunch`, gated like `purge`.
- `hr/DTR.jsx`: an Edit button per day with a time-in or Absent status opens the form and history. Corrected days show "· Corrected".

Decisions made with the user: a correction can create a record on an Absent day. New records are allowed only on non-holiday weekdays.

Conventions later phases inherit:
- Attendance times change only through `punch` or `correct`, and every `correct` change appends to `corrections`.
- A change within the same minute as the stored value is not a change.
- `monthly` returns each day's `corrections`, including reasons. Phase 3 decides whether employees see them.
- E2E tests that need past punches use `e2e:seedPunch` with `E2E_DEPLOYMENT` from `.env.e2e`.

Deliberately not built, and why: removing a punch (US-6 asks only to edit or add), recording which admin made a change (there is one shared admin account).

### Phase 3 — Employee web app ✅ DONE (merged `7b33524`, 2026-11-01)

Covers US-7, US-8.

- Employees log in by ID and password and view their own monthly DTR, read-only

**Verified** on 2026-11-01. Backend `npm test` 96/96. Playwright over Electron and in system Chrome, against `vite preview` of `dist/web`, ran in a throwaway Convex project under the `e2e-testing` skill: 32 pass and 4 skipped. The 4 skipped tests are the Phase 0/1 weekday-only punch tests and still need a weekday run. Results: `PHASE-3-TEST-RESULTS.md`.

Shipped as:
- `convex/self.js`: `me`, `monthly({ month, today })`, `changePassword({ current, next })`. All act on the signed-in employee only.
- `convex/auth.js`: sign-in rejects inactive employees (`Account inactive`) and reports lockout (`Too many attempts. Try again later.`).
- `convex/attendance.js`: `monthFor(ctx, user, month, today)`, shared by `attendance.monthly` and `self.monthly`.
- `convex/lib/manila.js`: adds `isMonth`.
- Schema: users add `passwordChangedAt`. While it is unset, the employee must change the password.
- `convex/e2e.js`: `purge` also deletes `authRateLimits`.
- `web/` (built by `vite.web.config.js` to `dist/web`, run with `npm run web`): Login, Change password, My DTR.
- `hr/Login.jsx` takes `title` and `userLabel` and shows server error text. `hr/DTR.jsx` exports `DayHeaders`, `DayCells`, `TotalCells`.

Decisions made with the user: employees see only the US-8 columns. Correction details stay HR-only.

Conventions later phases inherit:
- Employee-facing functions live in `convex/self.js`, take no employee ID, and re-check active employee status on every call.
- Every month, HR or employee, comes from `monthFor`. Month strings are checked with `isMonth`.
- A password change signs out the employee's other sessions.
- `npm run build` builds both apps. E2E has two Playwright projects, `hr` (Electron) and `web` (Chrome, `vite preview` on port 4174). Web setup uses a `ConvexHttpClient` signed in as `e2e-admin`, and `e2e/seed.js` seeds past punches.

Deliberately not built, and why: hosting the web build (not in the spec, only `vite preview` locally), employee self-service password reset (not in the spec), signing out a deactivated employee's sessions (they reach no data).

### Phase 4 — Reports ✅ DONE (merged `957bd25`, 2026-11-01)

Covers US-9, US-10.

- Printable per-employee DTR and a monthly CSV of all employees

**Verified** on 2026-11-01. Backend `npm test` 107/107. Playwright over Electron and in system Chrome ran in a throwaway Convex project under the `e2e-testing` skill: 36 pass and 4 skipped. The 4 skipped tests are the Phase 0/1 weekday-only punch tests. A weekday pass on 2026-11-02 ran them: 39 pass, 1 skipped (the weekend-only test), each of the 4 watched fail. Results: `PHASE-4-TEST-RESULTS.md`.

Shipped as:
- `convex/attendance.js`: `monthlyCsv({ month, today })` returns `{ count, csv }`, one row per employee from `monthFor`, durations in minutes, with a formula-injection guard and CSV quoting.
- `hr/DTR.jsx`: a Print button (`window.print()`) and an Export CSV button that saves `attendance-<month>.csv` with a UTF-8 BOM through Electron's native Save dialog.
- `hr/styles.css`: `@media print` hides `header` and `.no-print`.

Picked up from Phase 1 and Phase 3: CSV totals come from `monthFor`, and the month is checked with `isMonth`.

Decisions made with the user: CSV durations are whole minutes.

Deliberately not built, and why: a separate print layout or signature block (the US-9 print view is the DTR table itself), changes to `electron/main.cjs` (Electron's default download handling shows the Save dialog).
