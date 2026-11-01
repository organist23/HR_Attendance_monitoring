# Phase 1 — DTR Computation and Holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR views any employee's monthly DTR (daily rendered, late, undertime, missing, status, plus totals) computed in Convex, and manages holidays that drop out of required hours, absences, and punching.

**Architecture:** One pure function `computeDay` in `convex/lib/dtr.js` holds every US-4 rule (Phase 3 and 4 reuse it). `attendance.monthly` builds a month from attendance rows, holidays, and the employee's creation date. A new `holidays` table with `convex/holidays.js` (list/add/remove). HR app gets two tabs, `DTR` and `Holidays`, reusing existing table/form/error patterns.

**Tech Stack:** Existing only. Convex, React, Vitest + convex-test, Playwright over Electron. No new deps.

**Spec:** `spec.md` (US-4, US-5, and the holiday rejection in US-3). Roadmap: `roadmap.md`, Phase 1.

## Context

Phase 0 records punches but computes nothing, and only rejects weekends. Phase 1 makes the computation rules real and adds holidays. Decisions taken with the user:
- On-time in, early out (e.g. 8:00–16:00) → status **Present**, with undertime and missing shown.
- Punch tab Today list keeps Phase 0's `Timed in` / `Timed out`. Unchanged.

## Global Constraints

- All values are **minutes** server-side. UI formats as `7h 40m`.
- Manila minutes-of-day come from `convex/lib/manila.js`. Schedule 480–720 and 780–1020. Grace: time-in ≤ 495 counts as 480.
- Status values, exact: `Present`, `Late`, `Incomplete`, `Absent`. Uncounted days have status `""`.
- A workday counts toward required (480 min) only when it is a Mon–Fri non-holiday on or after the employee's Manila creation date, and either has a time-in, or is before `today` and the employee is active (→ Absent).
- Holiday dates are `YYYY-MM-DD`. One holiday per date.
- Error copy, exact: `Date is already a holiday`, `Holiday date and name are required`, `Invalid month`, and the existing `Not a workday` for holiday punches.
- Every public function calls `requireAdmin` first (Phase 0 convention).
- UI keeps loading, empty, and error states, Enter-to-submit, arrow-key tabs.

## Review Focus

1. **Employee created mid-month** must not show Absent for days before creation. Test in Task 2.
2. **Holiday added after a punch on that date** → day not counted (no required, no status), times still shown. Test in Task 2.
3. **Time-in during lunch or after 17:00** (12:30–17:00 → rendered 240, late 270, Late; 17:30–18:00 → rendered 0). Test in Task 1.
4. **Unknown employee ID in DTR** → query returns `null`, UI shows "Employee not found" (a throwing `useQuery` would crash the screen). Test in Task 2 and Task 5.
5. **Inactive employee** → past days without time-in are not Absent (spec: Absent is "for an active employee"). Test in Task 2.

---

### Task 1: `computeDay` rules

**Files:**
- Modify: `convex/lib/manila.js` (add `manilaMinutes`)
- Create: `convex/lib/dtr.js`
- Test: `convex/lib/dtr.test.js`

**Interfaces:**
- Produces: `manilaMinutes(ms: number) -> number` (0–1439, Manila minute of day).
- Produces: `computeDay({ timeIn?: number, timeOut?: number }) -> { rendered, late, undertime, missing, status }` for a counted workday. No `timeIn` → `{ rendered: 0, late: 0, undertime: 0, missing: 480, status: "Absent" }`. Time-in only → `Incomplete`, rendered 0, missing 480, late computed, undertime 0.

- [ ] **Step 1: Write failing tests.** Helper `t = (hhmm) => Date.parse(\`2026-11-02T${hhmm}:00+08:00\`)`. Hand-derived expectations `[rendered, late, undertime, missing, status]`:
  - 08:10–17:00 → `[480, 0, 0, 0, "Present"]`
  - 08:20–17:00 → `[460, 20, 0, 20, "Late"]`
  - 08:00–16:00 → `[420, 0, 60, 60, "Present"]`
  - 08:00–11:00 → `[180, 0, 300, 300, "Present"]`
  - 08:15–17:00 → `[480, 0, 0, 0, "Present"]` (grace edge)
  - 08:16–17:00 → `[464, 16, 0, 16, "Late"]`
  - 07:30–18:00 → `[480, 0, 0, 0, "Present"]` (cap)
  - 12:30–17:00 → `[240, 270, 0, 240, "Late"]`
  - 17:30–18:00 → `[0, 570, 0, 480, "Late"]`
  - 08:00–12:30 → `[240, 0, 240, 240, "Present"]` (out during lunch)
  - in 08:20, no out → `[0, 20, 0, 480, "Incomplete"]`
  - no in → `[0, 0, 0, 480, "Absent"]`
  - `manilaMinutes(Date.parse("2026-11-01T23:30:00Z"))` → `450`
- [ ] **Step 2: Run `npx vitest run convex/lib/dtr.test.js`.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** `overlap(a, b, start, end) = max(0, min(b, end) - max(a, start))`. Rendered = overlap of [effIn, out] with both blocks. Undertime = overlap of [out, 1020] with both blocks when out < 1020.
- [ ] **Step 4: Run tests.** Expected: PASS. Mutation check: flip the grace bound to `<` and confirm the 08:15 case goes red.
- [ ] **Step 5: Commit** `feat: DTR day computation rules`.

### Task 2: Holidays table, holiday punch rejection, `attendance.monthly`

**Files:**
- Modify: `convex/schema.js` (add `holidays: { date: string, name: string }`, index `by_date`)
- Modify: `convex/attendance.js` (holiday check in `punch`, new `monthly`)
- Test: `convex/attendance.test.js` (extend, reuse `setup`/`at`)

**Interfaces:**
- Consumes: `computeDay`, `manilaDay`, `isWorkday`.
- Produces: `api.attendance.monthly({ employeeId: string, month: "YYYY-MM", today: "YYYY-MM-DD" }) -> null | { employeeId, name, days: Day[], totals }`
  - `Day = { date, weekday, holiday?: string, timeIn?, timeOut?, rendered, late, undertime, missing, status }`, one per calendar date.
  - `totals = { rendered, required, missing, late, undertime, absences }`, summed over counted days. `required = 480 × counted days`.
  - `null` when the ID is not an employee. `month` failing `/^\d{4}-(0[1-9]|1[0-2])$/` throws `Invalid month`.
  - `today` comes from the client, same reason as `today` query (queries reading `Date.now()` don't re-run).

- [ ] **Step 1: Write failing tests.** Employee E001 inserted with fake time set to `2026-10-31T16:00:00Z` (Nov 1 Manila) unless noted. Month `2026-11`, today `2026-11-06` unless noted.
  - Mon Nov 2 08:20–17:00 and Tue Nov 3 08:00–16:00 punched. Expect Nov 2 `Late` 460/20, Nov 3 `Present` undertime 60, Nov 4 and Nov 5 `Absent`, Nov 6 (today, no punch) status `""`, Sat Nov 7 `""`. Totals `{ rendered: 880, required: 1920, missing: 1040, late: 20, undertime: 60, absences: 2 }`.
  - Holiday on Wed Nov 4: Nov 4 has `holiday` name, status `""`. Totals required 1440, absences 1.
  - Holiday added on Nov 2 after its punch: Nov 2 keeps `timeIn`/`timeOut`, status `""`, not in required.
  - Employee created at `2026-11-04T01:00:00Z` (Nov 4 Manila): Nov 2–3 status `""`, absences 1 (Nov 5).
  - Inactive employee: absences 0, required 0.
  - Unknown ID → `null`. Month `2026-13` → throws `Invalid month`. Non-admin → `Not authorized`.
  - Punch at a holiday's 08:05 → throws `Not a workday`, no row saved.
- [ ] **Step 2: Run `npm test`.** Expected: new tests FAIL.
- [ ] **Step 3: Implement.** Attendance and holidays read by range `gte(date, "YYYY-MM-01").lte(date, "YYYY-MM-31")`. Weekday per date from `new Date(Date.UTC(y, m-1, d)).getUTCDay()`. Days in month `new Date(Date.UTC(y, m, 0)).getUTCDate()`. Creation date `manilaDay(user._creationTime).date`.
- [ ] **Step 4: Run `npm test`.** Expected: all PASS. Mutation check: drop the holiday filter in `monthly`, confirm the holiday test goes red.
- [ ] **Step 5: Commit** `feat: monthly DTR query and holiday punch rejection`.

### Task 3: `convex/holidays.js`

**Files:**
- Create: `convex/holidays.js`
- Modify: `convex/e2e.js` (`purge` also deletes holidays whose name starts with `prefix`, adds `holidays` to counts)
- Test: `convex/holidays.test.js`, `convex/e2e.test.js` (extend)

**Interfaces:**
- Produces: `api.holidays.list({}) -> { _id, date, name }[]` sorted by date asc. `api.holidays.add({ date, name }) -> Id`. `api.holidays.remove({ holidayId })`.

- [ ] **Step 1: Write failing tests.** Add then list returns it. Second add on same date throws `Date is already a holiday`, still one row. Blank name, blank date, or date `2026/11/04` throws `Holiday date and name are required`. Remove deletes it, and Task 2's monthly then counts the date again (US-5 "becomes a workday again"). Remove of an already-deleted id is a no-op (double-click on Remove). Non-admin on all three → `Not authorized`. Purge removes `E2E-` holidays only.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Trim name and date. Validate date with `/^\d{4}-\d{2}-\d{2}$/`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS. Mutation check: remove the duplicate check, confirm red.
- [ ] **Step 5: Commit** `feat: holiday management functions`.

### Task 4: Holidays tab

**Files:**
- Create: `hr/Holidays.jsx`
- Modify: `hr/App.jsx` (`TABS = ["Punch", "Employees", "DTR", "Holidays"]`, render by tab)

**Interfaces:**
- Consumes: `api.holidays.*`, `errorText` from `hr/errors.js`.

- [ ] **Step 1: Build.** Form with `Date` (`type="date"`), `Holiday name`, button `Add holiday` (disabled + `Saving…` while pending, Enter submits). Error in `role="alert"`. Table `Date | Name | ` with a `Remove` button per row. Loading row `Loading…`, empty row `No holidays`. Same markup/classes as `Punch.jsx`.
- [ ] **Step 2: Run `npm run build`.** Expected: succeeds.
- [ ] **Step 3: Commit** `feat: holidays tab`.

### Task 5: DTR tab

**Files:**
- Create: `hr/DTR.jsx`
- Modify: `hr/Punch.jsx` (export `manilaTime` and `useManilaDate` for reuse, no behavior change)

**Interfaces:**
- Consumes: `api.attendance.monthly`, `manilaDay`.

- [ ] **Step 1: Build.** Form with `Employee ID` and `Month` (`type="month"`, default current Manila month), button `View`. Query runs on submit (`"skip"` before). States: `Loading…`, `null` → `role="alert"` "Employee not found". Header shows ID and name. Table columns `Date | Day | Time in | Time out | Rendered | Late | Undertime | Missing | Status`. Weekend/holiday rows show `Sat`/`Sun`/holiday name in Status. Footer row with totals plus `Required` and `Absences`. Durations as `Xh Ym` (`0` shows `—`).
- [ ] **Step 2: Run `npm run build`.** Expected: succeeds.
- [ ] **Step 3: Commit** `feat: monthly DTR tab`.

### Task 6: E2E (feature-workflow step 8)

**Files:**
- Modify: `e2e/hr.spec.js`
- Create: `PHASE-1-TEST-RESULTS.md`

- [ ] **Step 1: Read `.claude/skills/e2e-testing/SKILL.md`** and follow its isolation and teardown.
- [ ] **Step 2: Add scenarios.** US-5: add `E2E-` holiday, appears in list. Duplicate date shows `Date is already a holiday`. Remove drops it. US-4: create employee, view DTR for current month, row for today visible, unknown ID shows "Employee not found". Server time can't be faked in E2E, so exact US-4 values stay in Task 1–2 unit tests. Each scenario watched failing once (break the code, see red).
- [ ] **Step 3: Run `npm run build && npm run e2e`, purge, record results.** Commit `test: phase 1 e2e`.

## Verification

- `npm test`: all backend tests green, including the 12 `computeDay` cases and monthly totals.
- `npm run build && npm run e2e` in a throwaway Convex project, results in `PHASE-1-TEST-RESULTS.md`.
- Manual: `npm run hr`, view a DTR month and add/remove a holiday.

## Execution notes

- First step of execution: branch `phase-1-dtr-holidays`, copy this plan to `docs/superpowers/plans/2026-11-01-phase-1-dtr-holidays.md`.
- Not built: Today list status change (user chose to keep it), corrections (Phase 2), employee app (Phase 3), print/CSV (Phase 4).
