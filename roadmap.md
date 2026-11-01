# Roadmap

## Part one — HR attendance recording and DTR

### Phase 0 — Record punches NEXT

Proves the core loop: Electron + React app → Convex → punch saved and shown live.
Covers US-1, US-2, US-3.

- HR logs in with the shared admin account
- HR creates, searches, and deactivates employees
- Entering an employee ID saves time-in, then time-out, at server time
- Today's list shows each punched employee

**Done when:** the admin logs in, creates an employee, and two punches by employee ID show time-in and time-out in today's list. Unknown, inactive, third-punch, and non-workday punches are rejected.

Deliberately not built, and why: lateness, undertime, and hours computation (Phase 1 owns it). Phase 0 only checks Saturdays and Sundays as non-workdays, and holiday management is also Phase 1. Corrections (Phase 2 owns it). Employee web app (Phase 3 owns it). Reports (Phase 4 owns it).

### Phase 1 — DTR computation and holidays LATER

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
