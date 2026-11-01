# Phase 4 — Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR prints one employee's monthly DTR (savable as PDF) and downloads a CSV of every employee's monthly totals.

**Architecture:** US-9 needs no new backend: the existing DTR tab gets a Print button (`window.print()`) and `@media print` rules that hide the app chrome, the form, and the Edit column. US-10 adds one admin query, `attendance.monthlyCsv`, that runs the existing `monthFor` per employee and returns the finished CSV text. The DTR tab gets an Export CSV button that saves it through a Blob link. Electron's default download handling shows the native Save dialog, so `electron/main.cjs` does not change.

**Tech Stack:** Existing only. Convex, React, Vitest + convex-test, Playwright over Electron. No new deps.

**Spec:** `spec.md` US-9, US-10. Roadmap: `roadmap.md`, Phase 4.

## Context

Spiked on 2026-11-01: Playwright's `download` event does not fire in Electron (the native Save dialog opens instead). A test-side `session.defaultSession.once("will-download")` hook with `item.setSavePath(file)` saves the file and works. `webContents.printToPDF({})` from `app.evaluate` returns a PDF. Both are test-only hooks at the native-dialog boundary.

US-9 reject case is already true in `monthFor`: a month before hire or in the future has every date row with blank values and zero totals. Task 1 pins it with a test.

Decision for the user at plan review: CSV durations are whole **minutes** (lossless, matches every DTR value). Alternative is decimal hours.

## Global Constraints

- `monthlyCsv` calls `requireAdmin` first. Totals come only from `monthFor` (Phase 1/3 convention).
- `today` comes from the client (Phase 1 convention). Month is checked with `isMonth` before any read, error `Invalid month`.
- CSV header, exact: `Employee ID,Name,Rendered (min),Required (min),Missing (min),Late (min),Undertime (min),Absences`. Lines end `\r\n`, including the last.
- A row is included when the employee is active, or has at least one attendance row in the month. Admin accounts never appear. Rows sorted by employee ID.
- Text fields: a leading `=`, `+`, `-`, `@`, tab, or CR gets a `'` prefix. Then a field containing `"`, `,`, CR, or LF is wrapped in quotes with `"` doubled.
- File name `attendance-<month>.csv`, written with a UTF-8 BOM so Excel reads `Ñ`.
- UI keeps loading and error states, buttons disabled while pending. Reuse `button.secondary`, `.row`, `.error`, and the `role="status"`/`role="alert"` patterns. No new component files.

## Review Focus

1. **Name with a comma, quote, or newline** (`Dela Cruz, Juan "JJ"`) must stay one CSV field. Test in Task 1 and Task 2 E2E.
2. **Name starting with `=`** must not run as an Excel formula. Test in Task 1.
3. **Invalid month with zero employees** must still throw `Invalid month`. Test in Task 1.
4. **Printing with a correction form open** must not print the form. Test in Task 2 E2E.
5. **Inactive employee with records only in another month** must be left out. Test in Task 1.

---

### Task 1: `attendance.monthlyCsv`

**Files:**
- Modify: `convex/attendance.js` (add after `monthFor`)
- Test: `convex/attendance.test.js` (append, reuse `monthSetup`, `manila`, `at`)

**Interfaces:**
- Consumes: `monthFor(ctx, user, month, today)`, `isMonth`, `requireAdmin`.
- Produces: `api.attendance.monthlyCsv({ month: string, today: string }) → { count: number, csv: string }`. `count` is the number of data rows.

- [ ] **Step 1: Write the failing tests**

Use `monthSetup()` (E001 Juan Dela Cruz, created Nov 1, today Nov 6) and insert more users with `t.run`. Hand-derived values:

```js
const HEADER = "Employee ID,Name,Rendered (min),Required (min),Missing (min),Late (min),Undertime (min),Absences\r\n";
const csv = (args = {}) => as.query(api.attendance.monthlyCsv, { month: "2026-11", today: "2026-11-06", ...args });
```

- `monthlyCsv: one row per employee with monthly totals` — E001 punched Nov 2 08:20–17:00 and Nov 3 08:00–16:00 (same as "monthly: daily rows and totals"). Expect `{ count: 1, csv: HEADER + "E001,Juan Dela Cruz,880,1920,1040,20,60,2\r\n" }`.
- `monthlyCsv: inactive employees only with records in the month` — add E002 inactive with a punch on Nov 2 08:00–17:00, E003 inactive with no rows, E004 inactive with a punch only on `2026-10-30`. Expect rows E001 then E002 only, count 2. E002's row: `E002,<name>,480,480,0,0,0,0`.
- `monthlyCsv: sorted by ID, admin excluded` — insert E010 before E002 (both active, no punches). Expect order E001, E002, E010. The `admin` user from `asRole` never appears.
- `monthlyCsv: quotes and formula guard` — names `Dela Cruz, Juan "JJ"`, `=HYPERLINK("x")`, `Line\nBreak`, `Ñoño`. Expect fields `"Dela Cruz, Juan ""JJ"""`, `"'=HYPERLINK(""x"")"`, `"Line\nBreak"`, `Ñoño`.
- `monthlyCsv: no employees gives header only` — fresh `convexTest` with only an admin: `{ count: 0, csv: HEADER }`.
- `monthlyCsv: invalid month rejected with no employees` — `month: "2026-13"` throws `Invalid month`.
- `monthlyCsv: non-admin rejected` — employee identity throws `Not authorized`.
- `monthly: future month and month before hire are empty` (US-9 reject) — `monthly({ month: "2026-12" })` and `monthly({ month: "2026-10" })`: every day has `status: ""`, totals all zero, `days.length` 31 for both.

- [ ] **Step 2: Run, expect FAIL** — `npm test -- convex/attendance.test.js`. The `monthlyCsv` tests fail with "not a function"-style errors. The `monthly` empty-month test passes, so break `date < today` to `true` and confirm it goes red, then restore.

- [ ] **Step 3: Implement `monthlyCsv`** in `convex/attendance.js`

`query({ args: { month: v.string(), today: v.string() } })`. `requireAdmin`, then `isMonth` check, then employees via `withIndex("by_employeeId")` filtered to `role === "employee"`, `.collect()`. For each, `monthFor`, keep it when `user.active || days.some((d) => d.timeIn !== undefined)`. Build lines with a module-level `cell(text)` helper for the guard and quoting rules in Global Constraints. Numbers are written as-is. Add `// shortcut: one query reads every employee's month (~7k docs at 300 staff); paginate if staff passes ~1,000.`

- [ ] **Step 4: Run, expect PASS** — `npm test`. All tests pass. Mutation check: drop the `'` guard, then the `user.active ||` clause. Each must turn a test red. Restore.

- [ ] **Step 5: Commit** — `git commit -m "feat: monthlyCsv query for US-10"`

---

### Task 2: Print and Export CSV in the DTR tab, with E2E

**Files:**
- Modify: `hr/DTR.jsx`, `hr/styles.css`
- Test: `e2e/hr.spec.js` (new `US-9` and `US-10` describes, reuse `login`, `createEmployee`, `newId`, `viewDtr`, `seedPunch`, `SEED_DATE`)

**Interfaces:**
- Consumes: `api.attendance.monthlyCsv` from Task 1, `useConvex` from `convex/react`, `errorText`.

- [ ] **Step 1: Write the failing E2E tests**

US-9 (`test.describe("US-9 Print DTR")`):
- `Print opens the print dialog and print view shows only the DTR` — seeded employee (08:00–17:00 on `SEED_DATE`), `viewDtr(id, "2026-10")`, click Edit on the `SEED_DATE` row so a correction form is open. Replace `window.print` with a recorder via `page.evaluate`, click `Print`, expect the recorder called once. Then `page.emulateMedia({ media: "print" })`: tablist, `Log out`, the `Employee ID` input, `Print`, `Export CSV`, every `Edit` button, and the `Reason` input are hidden. The heading (`<id> E2E Tester · 2026-10`), the `SEED_DATE` row, and the Totals row are visible. `app.evaluate` → `webContents.printToPDF({})` byte length > 1000.
- `employee hired after the month shows an empty DTR` — new employee, `viewDtr(id, "2026-10")`: no `alert`, 31 data rows, none contains `Absent`, Totals row contains `Required — · Absences 0`.

US-10 (`test.describe("US-10 Export CSV")`), with a helper `saveNextDownload()` that installs the `will-download` hook from Context and resolves `{ name, text }`:
- `Export CSV saves totals for the month` — A: active, name `E2E "Q", Tester`, seeded 08:00–17:00 on `SEED_DATE`. B: seeded 08:00–17:00 then deactivated. C: deactivated, no punches. On the DTR tab set Month `2026-10`, click `Export CSV`. Expect `name` `attendance-2026-10.csv`, `text` starts with `﻿` + the exact header, contains `<A>,"E2E ""Q"", Tester",480,480,0,0,0,0\r\n` and `<B>,E2E Tester,480,480,0,0,0,0\r\n`, does not contain C's ID. Expect `role="status"` text matching `Exported \d+ employees`.
- `Export CSV is disabled with no month` — clear Month, expect `Export CSV` disabled. (An invalid month string is not reachable from `<input type="month">`. Task 1 covers it server-side.)

- [ ] **Step 2: Run, expect FAIL** — `npm run build && npx playwright test --project=hr -g "US-9|US-10"` under the `e2e-testing` skill setup. Fails on missing `Print` / `Export CSV` buttons.

- [ ] **Step 3: Implement**

`hr/DTR.jsx`:
- Form gets `className="row no-print"`. After `View`, add `<button type="button" className="secondary" disabled={!month || exporting} onClick={exportCsv}>{exporting ? "Exporting…" : "Export CSV"}</button>`.
- `exportCsv`: `convex.query(api.attendance.monthlyCsv, { month, today })`, then a Blob `["﻿", csv]` of type `text/csv`, an `<a download="attendance-<month>.csv">` click, `URL.revokeObjectURL`. Success sets status `Exported <count> employees`. Failure sets `errorText(err)`. Render status as `<p role="status">` and error as `<p role="alert" className="error">`, both `no-print`.
- Next to the `<h2>`, `<button className="secondary no-print" onClick={() => window.print()}>Print</button>`.
- Actions `<th>`, each Edit `<td>`, and the `Correction` `<tr>` get `className="no-print"`.

`hr/styles.css`: `@media print { header, .no-print { display: none; } :root, body, table { background: #fff; } .app { max-width: none; padding: 0; } }`.

- [ ] **Step 4: Run, expect PASS** — same command. Mutation check: remove `.no-print` from the print rule (US-9 print test red), and remove the BOM (US-10 test red). Restore.

- [ ] **Step 5: Commit** — `git commit -m "feat: print DTR and export monthly CSV (US-9, US-10)"`
