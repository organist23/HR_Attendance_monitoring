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

### Phase 1 — DTR computation and holidays NEXT

Covers US-4, US-5.

- Daily rendered, late, undertime, missing, and status per the spec's computation rules
- HR views any employee's monthly DTR with totals
- HR adds and removes holidays

**Done when:** the US-4 example days produce the exact values in the spec, and a holiday drops out of required hours and absences.

Deliberately not built, and why: corrections (Phase 2 owns it), employee web app (Phase 3 owns it), reports (Phase 4 owns it).

### Phase 2 — Corrections LATER

Covers US-6.

- HR edits time-in or time-out with a required reason, and the correction history shows on the record

### Phase 3 — Employee web app LATER

Covers US-7, US-8.

- Employees log in by ID and password and view their own monthly DTR, read-only

### Phase 4 — Reports LATER

Covers US-9, US-10.

- Printable per-employee DTR and a monthly CSV of all employees
