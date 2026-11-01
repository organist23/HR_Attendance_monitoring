# Phase 2 — Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR edits a day's time-in or time-out with a required reason from the DTR tab, the DTR recomputes, and each change is logged and shown on that day.

**Architecture:** One mutation `attendance.correct` validates and writes the new times plus log entries. The log is an array `corrections` on the attendance row (few entries per day, deleted with the row by `e2e.purge`, no new table or index). `attendance.monthly` returns it per day. The DTR tab gets an Edit button per editable day that expands an inline row with the form and history.

**Tech Stack:** Existing only. Convex, React, Vitest + convex-test, Playwright over Electron. No new deps.

**Spec:** `spec.md` US-6. Roadmap: `roadmap.md`, Phase 2.

## Context

Decision taken with the user: corrections may also create a record on an Absent day (forgotten time-in). New records are allowed only on Mon–Fri non-holiday dates. Existing rows (including on a later-added holiday) can always be corrected.

## Global Constraints

- Times cross the wire as Manila `"HH:MM"` strings and are stored as ms: `Date.parse(\`${date}T${hhmm}:00+08:00\`)`.
- Log entry shape, exact: `{ field: "timeIn" | "timeOut", from?: number, to: number, reason: string, at: number }`. `from` absent means there was no value. `at` is server `Date.now()`.
- One entry per field whose stored value actually changes. Reason is stored trimmed.
- Error copy, exact: `Reason is required`, `Reason is too long` (over 500 chars), `Invalid date`, `Invalid time`, `Nothing to change`, `Time-in is required`, `Time-out must be after time-in`, `Time is in the future`, and existing `Employee not found`, `Not a workday`.
- Inactive employees can be corrected (fixing past records).
- `requireAdmin` first. All DTR numbers still come from `computeDay` via `attendance.monthly`.
- UI keeps loading/error states, Enter submits, Escape cancels, focus moves into the form on open and back to the Edit button on close.

## Review Focus

1. **Resubmitting an unchanged time.** Stored punches have seconds, the input has minutes. The UI sends only fields the user changed. The server rejects a call that changes nothing with `Nothing to change`. Test in Task 1 and Task 2.
2. **Time-out equal to time-in** is rejected like earlier. Test in Task 1.
3. **Correcting today into the future** (e.g. time-out 17:00 at 10:00) is rejected `Time is in the future`. This also covers future dates. Test in Task 1.
4. **Only time-out on an Absent day** is rejected `Time-in is required`, nothing written. Test in Task 1.
5. **Impossible date / malformed time** (`2026-02-30`, `25:00`, `8:00`) rejected. Test in Task 1.

---

### Task 1: `attendance.correct` and history in `monthly`

**Files:**
- Modify: `convex/schema.js` (attendance gets `corrections`)
- Modify: `convex/lib/manila.js` (add `isRealDate`), `convex/holidays.js` (use it, same behavior)
- Modify: `convex/attendance.js` (add `correct`, `monthly` days gain `corrections`)
- Test: `convex/attendance.test.js` (`isRealDate` is covered through `holidays.test.js` and the invalid-date test)

**Interfaces:**
- Produces: `api.attendance.correct({ employeeId: string, date: "YYYY-MM-DD", timeIn?: "HH:MM", timeOut?: "HH:MM", reason: string }) → null`.
- Produces: each `monthly` day has `corrections: Entry[]` (`[]` when none).
- Produces: `isRealDate(date: string) → boolean` in `convex/lib/manila.js`.

- [ ] **Step 1: Write failing tests** in `attendance.test.js`, reusing `monthSetup` (today `2026-11-06`), with system time Fri Nov 6 10:00 Manila (`2026-11-06T02:00:00Z`) set after setup. `correct = (args) => as.mutation(api.attendance.correct, { employeeId: "E001", reason: "Forgot", ...args })`.
  - `correct: time-out edit recomputes and logs` — punched Nov 3 08:00–16:00, correct `{ date: "2026-11-03", timeOut: "17:00" }` → `pick(day)` = `[480, 0, 0, 0, "Present"]`, `day.corrections` = `[{ field: "timeOut", from: manila(03,"16:00"), to: manila(03,"17:00"), reason: "Forgot", at: Date.parse("2026-11-06T02:00:00Z") }]`.
  - `correct: time-in edit clears lateness` — 08:20–17:00, timeIn `"08:00"` → `[480, 0, 0, 0, "Present"]`.
  - `correct: adds missing time-out to Incomplete day` — Nov 3 08:00 only, timeOut `"17:00"` → `Present`, one entry `{ field: "timeOut", to: manila(03,"17:00"), ... }` with no `from` key.
  - `correct: Absent day gets a record` — no punches, Nov 4 `{ timeIn: "08:00", timeOut: "17:00" }` → `Present`, two entries (timeIn then timeOut), neither has `from`. Absences go from 4 (Nov 2–5) to 3.
  - `correct: second correction appends` — two calls on Nov 3 → 2 entries in call order.
  - `correct: reason trimmed; blank reason rejected, nothing changes` — reason `"  "` → `Reason is required`, row unchanged; reason `" Typo "` stored `"Typo"`; 501-char reason → `Reason is too long`.
  - `correct: time-out not after time-in rejected` — 08:00–17:00 row, timeOut `"07:59"` and `"08:00"` → `Time-out must be after time-in`, row unchanged. Also timeIn `"17:00"` against out 17:00 → same.
  - `correct: time-out only on Absent day rejected` — `Time-in is required`, no row.
  - `correct: new record on weekend or holiday rejected` — Nov 7 → `Not a workday`; holiday Nov 4 → `Not a workday`; no rows.
  - `correct: future time rejected` — Nov 6 timeIn `"08:00"` ok, timeOut `"17:00"` → `Time is in the future`; Nov 9 → same.
  - `correct: invalid input rejected` — date `"2026-02-30"` → `Invalid date`; timeIn `"25:00"`, `"8:00"` → `Invalid time`.
  - `correct: unchanged or empty call rejected` — no times → `Nothing to change`; row 08:00–17:00 with timeOut `"17:00"` → `Nothing to change`, no entry.
  - `correct: unknown employee and non-admin rejected` — `E999` → `Employee not found`; employee identity → `Not authorized`.
  - `correct: inactive employee can be corrected`.

- [ ] **Step 2: Run** `npm test` — the new tests fail with `correct` / `isRealDate` undefined.

- [ ] **Step 3: Implement.**
  - `isRealDate`: move the round-trip check out of `holidays.add` unchanged, and call it there.
  - Schema: `corrections: v.optional(v.array(v.object({ field: v.union(v.literal("timeIn"), v.literal("timeOut")), from: v.optional(v.number()), to: v.number(), reason: v.string(), at: v.number() })))`.
  - `correct` order of checks: `requireAdmin` → reason → date → times (`/^([01]\d|2[0-3]):[0-5]\d$/`) → none given → employee lookup (same as `punch`, no active check) → row by `by_user_date` → no row: workday + holiday check, timeIn required → any new value `> Date.now()` → out ≤ in → build entries for changed fields → none → `Nothing to change` → patch, or insert `{ userId, date, timeIn, timeOut?, corrections }`.
  - `monthly`: add `corrections: row?.corrections ?? []` to each day.

- [ ] **Step 4: Run** `npm test` — all pass (65 existing + new).

- [ ] **Step 5: Mutation check.** Temporarily drop the out ≤ in check, then the `corrections` write; confirm the matching tests go red. Restore.

- [ ] **Step 6: Commit** `feat: attendance corrections with reason and history (US-6)`.

### Task 2: DTR edit row and history

**Files:**
- Modify: `hr/DTR.jsx`, `hr/styles.css` (only if a layout rule is missing)

**Interfaces:**
- Consumes: `api.attendance.correct`, `monthly` day `corrections`, `manilaTime`, `errorText`.

- [ ] **Step 1: Implement** in `DTR.jsx`, all inside the file (one local `Correction` function):
  - New last column, header `<span className="sr-only">Actions</span>`. Editable day = has `timeIn` or status `Absent`. Its cell has `<button className="secondary">Edit</button>` with `aria-expanded`. A day with corrections shows ` · Corrected` after its status.
  - One open row at a time (`editing` = date). The open row renders a `<tr><td colSpan={10}>` with:
    - history list when `corrections.length`: `Time in|Time out: <from or —> → <to> · <reason> · <manilaDay(at).date> <manilaTime(at)>`.
    - form with labeled inputs `Time in` and `Time out` (`type="time"`, prefilled via `manilaTime`, empty when absent), `Reason`, buttons `Save` (`Saving…` while pending, disabled) and `Cancel`.
  - Submit sends only fields whose input differs from its prefilled value. Success closes the row. Errors show in a `role="alert"` inside the row.
  - Escape in the form cancels. Opening focuses `Time in`. Closing returns focus to that day's Edit button.
- [ ] **Step 2: Check** `npm run build` passes, then drive it in the Electron app (Task 3 commits the spec).
- [ ] **Step 3: Commit** `feat: DTR correction form and history (US-6)`.

### Task 3: US-6 E2E

**Files:**
- Modify: `e2e/hr.spec.js` (new `describe("US-6 Corrections")`)

Run under `.claude/skills/e2e-testing` (throwaway project, `E2E-` IDs, purge). A fresh employee has no past Absent days (creation-day rule), so every scenario corrects today's row after a real punch-in. Skip unless Manila time is a weekday at or after 09:00 (the server rejects future times).

- [ ] **Step 1: Write tests**, one per US-6 condition:
  - Accepts (edit both, Incomplete gains time-out, history shown): punch in, DTR → Edit today → Time in `08:00`, Time out `09:00`, reason `E2E fix` → Save. Row shows `08:00`, `09:00`, rendered `1h`, undertime `7h`, missing `7h`, status `Present · Corrected`. Edit again shows two history lines with `E2E fix`, the time-out line starting `Time out: — → 09:00`.
  - Rejects: blank reason → alert `Reason is required`, row still Incomplete. Time in `09:00`, Time out `08:00` → alert `Time-out must be after time-in`, row unchanged.
- [ ] **Step 2: Mutation check** — break `correct` (skip the patch) on the throwaway deployment, see the accept test go red, restore.
- [ ] **Step 3: Record** `PHASE-2-TEST-RESULTS.md` and commit `test: phase 2 e2e`.
