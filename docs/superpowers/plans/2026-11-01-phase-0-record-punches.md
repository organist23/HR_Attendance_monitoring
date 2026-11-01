# Phase 0 — Record Punches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR logs in to an Electron app with the shared admin account, manages employees, and records time-in and time-out by employee ID at server time, all backed by Convex.

**Architecture:** One npm package at the repo root.
- `convex/` holds schema, auth, and functions. Every rule lives server-side.
- `hr/` is the React renderer, built by Vite.
- `electron/main.cjs` opens a window that loads the Vite dev server (`VITE_DEV_URL`) or the built `dist/hr/index.html`.
- Auth is Convex Auth with the Password provider and sign-up disabled. Accounts are created only server-side with `createAccount`.
- Employees are rows in the auth `users` table with `role: "employee"`. Phase 3 logs them in with no new table.

**Tech Stack:** JavaScript, React, Vite, `@vitejs/plugin-react`, Electron, `convex`, `@convex-dev/auth`, Vitest + `convex-test` + `@edge-runtime/vm` (backend tests), `@playwright/test` (Electron UI tests).

**Spec:** `spec.md` (US-1, US-2, US-3). Roadmap: `roadmap.md`, Phase 0.

## Global Constraints

- Timezone is Asia/Manila (UTC+8, no DST). The "day" is the Manila calendar date.
- Workdays are Monday to Friday. Holidays are Phase 1, so Phase 0 rejects Saturday and Sunday only.
- Punch time is always `Date.now()` on the server. The client never sends a time.
- Error copy, exact text:
  - `Employee not found`
  - `Employee inactive`
  - `Already timed out`
  - `Not a workday`
  - `Employee ID already exists`
  - `Employee ID, name, and password are required`
  - `Not authorized`
- Every HR function begins with `requireAdmin(ctx)`.
- UI must keep loading, empty, and error states, Enter-to-submit, and visible focus (feature-workflow UI scope).
- Phase 0 status values are only `Timed in` and `Timed out`. Late, undertime, and hours belong to Phase 1.
- Employee list page size is 25.

## Review Focus

1. **Whitespace around an employee ID** (pasted or scanned `" E001 "`) should match `E001`. Trim on create and on punch. Test in Task 4.
2. **Early-morning Manila punch.** Monday 07:30 Manila is Sunday 23:30 UTC and must count as a workday dated Monday. Tests in Task 1 and Task 4.
3. **Admin username typed as an employee ID** must give `Employee not found`, never a punch for the admin. Test in Task 4.
4. **A logged-in non-admin** (Phase 3 employee accounts) calling HR functions must get `Not authorized`. Test in Task 2.
5. **Double-press Enter or double-click Punch** must send one punch. Button disabled while the mutation is pending. Playwright test in Task 6.

---

### Task 1: Scaffold, Manila date helper, test command

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore` (node_modules, dist, .env.local), `convex/lib/manila.js`
- Test: `convex/lib/manila.test.js`
- Modify: `CLAUDE.md` Section 3, test-command line only. Set it to `npm test`, which runs the backend tests.

**Interfaces:**
- Produces: `manilaDay(ms: number) -> { date: "YYYY-MM-DD", weekday: 0-6 }` (0 = Sunday) and `isWorkday(weekday: number) -> boolean`

- [ ] **Step 1: Commit the project docs on the feature branch.** This covers `spec.md`, `roadmap.md`, the `CLAUDE.md` Section 3 edit, the `guide.md` removal, and this plan.
- [ ] **Step 2: Initialize.** Run `npm init -y`, install the deps from Tech Stack, and add these scripts:
  - `"test": "vitest run"`
  - `"dev": "vite"`
  - `"build": "vite build"`
  - `"hr": "electron ."`
  - `"e2e": "playwright test"`

  Set `"main": "electron/main.cjs"`. In `vitest.config.js`, use `environment: "edge-runtime"`, `server.deps.inline: ["convex-test"]`, and `include: ["convex/**/*.test.js"]`. Without that include, Vitest would pick up `e2e/*.spec.js`.
- [ ] **Step 3: User step (login wall).** The user runs `npx convex dev` (Convex login, creates the dev deployment) and then `npx @convex-dev/auth` (sets the JWT keys). Claude does not run either. Wait for "done".
- [ ] **Step 4: Write the failing test.**

```js
test("Monday 07:30 Manila is Monday", () => {
  expect(manilaDay(Date.parse("2026-11-01T23:30:00Z"))).toEqual({ date: "2026-11-02", weekday: 1 });
});
test("Saturday 10:00 Manila", () => {
  expect(manilaDay(Date.parse("2026-11-07T02:00:00Z"))).toEqual({ date: "2026-11-07", weekday: 6 });
});
test("isWorkday", () => {
  expect([0,1,2,3,4,5,6].map(isWorkday)).toEqual([false,true,true,true,true,true,false]);
});
```

- [ ] **Step 5:** Run `npm test` and expect FAIL (module not found).
- [ ] **Step 6: Implement.** Shift `ms` by +8h, then read `toISOString().slice(0,10)` and `getUTCDay()`.
- [ ] **Step 7:** Run `npm test` and expect PASS. Do the mutation check: drop the +8h and confirm the first test goes red.
- [ ] **Step 8:** Commit `feat: scaffold project and Manila date helper`.

### Task 2: Schema, auth, admin account, `requireAdmin` (US-1)

**Files:**
- Create: `convex/schema.js`, `convex/auth.js`, `convex/auth.config.js`, `convex/http.js`, `convex/lib/admin.js`, `convex/admin.js`
- Test: `convex/admin.test.js`

**Interfaces:**
- Produces:
  - Schema: `...authTables`, with `users` overridden to keep all authTables user fields and the `email` and `phone` indexes, plus these optional fields:
    - `role: "admin" | "employee"`
    - `employeeId: string`
    - `active: boolean`
    - `searchText: string`

    No `mustChangePassword` field: Phase 3 treats a missing value as "must change".
  - Users indexes: index `by_employeeId` on `["employeeId"]`, and search index `search` on `searchText` with `filterFields: ["role"]`.
  - `attendance` table: `{ userId: Id<"users">, date: string, timeIn: number, timeOut?: number }`, with indexes `by_user_date ["userId","date"]` and `by_date ["date"]`.
  - `requireAdmin(ctx) -> Promise<Id<"users">>` in `convex/lib/admin.js`. Works in query, mutation, and action ctx (actions read the user via an internal query). Throws `ConvexError("Not authorized")` if there's no session or `role !== "admin"`.
  - `internal.admin.create({ username, password })`, an internal action. Uses `createAccount(ctx, { provider: "password", account: { id: username, secret: password }, profile: { name: "HR Admin", role: "admin" } })`. Throws `ConvexError("Admin already exists")` if any user has `role: "admin"`.
  - `auth.js`: `convexAuth({ providers: [Password({ profile(params) { ... } })] })`. The profile returns `{ email: params.username }` and throws `ConvexError("Sign-up disabled")` when `params.flow !== "signIn"`.

- [ ] **Step 1: Write the failing tests.**
  - `create admin then second create rejects "Admin already exists"`
  - `requireAdmin rejects unauthenticated` (call `api.employees.list` with no identity, expect `Not authorized`). Add a stub `list` query in this task if needed. Task 3 replaces it.
  - `requireAdmin rejects role employee` (insert a user `{ role: "employee" }`, use `t.withIdentity({ subject: userId + "|session" })`, expect `Not authorized`)
  - `requireAdmin accepts role admin`
  - `sign-up flow rejected` (`api.auth.signIn` with `flow: "signUp"` throws)
- [ ] **Step 2:** Run `npm test` and expect FAIL.
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** Run `npm test` and expect PASS. Do the mutation check: make `requireAdmin` return without the role check and confirm the employee-role test goes red.
- [ ] **Step 5: User step.** The user creates the real admin with `npx convex run admin:create '{"username":"…","password":"…"}'`. Claude never types these credentials.
- [ ] **Step 6:** Commit `feat: admin auth and requireAdmin`.

### Task 3: Employees backend (US-2)

**Files:**
- Create: `convex/employees.js`
- Test: `convex/employees.test.js`

**Interfaces:**
- Consumes: `requireAdmin`, schema from Task 2.
- Produces:
  - `api.employees.create({ employeeId, name, password }) -> Id<"users">`, an action.
    - Trims all three. If any is empty, throws `Employee ID, name, and password are required`.
    - Checks `by_employeeId` and throws `Employee ID already exists` on a match.
    - Then calls `createAccount` with:
      - `account: { id: employeeId, secret: password }`
      - `profile: { name, role: "employee", employeeId, active: true, searchText: employeeId + " " + name }`
    - Add the code comment `// shortcut: concurrent create of the same ID gets createAccount's raw error, not the friendly one; fine with one HR user`.
  - `api.employees.list({ search: string, paginationOpts }) -> PaginationResult<{ _id, employeeId, name, active }>`, a query.
    - Empty `search` returns all users with `role: "employee"`, ordered by `employeeId`. Use the `by_employeeId` index and filter `role`.
    - Otherwise uses search index `search` with `.eq("role","employee")`.
  - `api.employees.setActive({ userId, active: boolean })`, a mutation. Only patches users with `role: "employee"`.

- [ ] **Step 1: Write the failing tests** (all as admin identity).
  - `create then list shows E001 Juan Dela Cruz active`
  - `duplicate ID rejected and only one row exists`
  - `blank name rejected, nothing created` (also `"   "` ID)
  - `setActive false shows inactive`
  - `search "Juan" returns only matching`
  - `list paginates`: insert 30, first page has 25 and `isDone: false`, second page has 5
  - Each of `create`, `list`, and `setActive` called as non-admin rejects `Not authorized`
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run and expect PASS. Do the mutation check: remove the duplicate check and confirm the duplicate test goes red.
- [ ] **Step 5:** Commit `feat: employee create, list, deactivate`.

### Task 4: Punch backend (US-3)

**Files:**
- Create: `convex/attendance.js`
- Test: `convex/attendance.test.js`

**Interfaces:**
- Consumes: `requireAdmin`, `manilaDay`, `isWorkday`, Task 2 schema.
- Produces:
  - `api.attendance.punch({ employeeId }) -> { action: "in" | "out", name: string, at: number }`, a mutation.
    - Trims the ID, looks it up with `by_employeeId`, and requires `role: "employee"`. On a miss, throws `Employee not found`.
    - If `!active`, throws `Employee inactive`.
    - If `!isWorkday`, throws `Not a workday`.
    - If there is no row for `(userId, date)`, inserts `timeIn`.
    - If the row has no `timeOut`, patches `timeOut`.
    - Otherwise throws `Already timed out`.
  - `api.attendance.today() -> Array<{ employeeId, name, timeIn, timeOut?, status: "Timed in" | "Timed out" }>`, a query. Today's Manila date is computed from `Date.now()` and rows are sorted by `timeIn`.

- [ ] **Step 1: Write the failing tests.** Use `vi.useFakeTimers()` and `vi.setSystemTime`. Expected values are derived by hand.
  - At `2026-11-02T00:05:00Z` (Mon 08:05 Manila), punch `E001` returns `action: "in"`, and `today()` gives `timeIn = Date.parse("2026-11-02T00:05:00Z")` and status `Timed in`.
  - At `2026-11-02T09:00:00Z` (17:00), a second punch returns `out` and status is `Timed out`.
  - A third punch rejects `Already timed out`, and there's still one row.
  - Punch `" E001 "` succeeds (trim).
  - Unknown `E999` rejects `Employee not found`.
  - Punch with the admin's username rejects `Employee not found`.
  - Inactive employee rejects `Employee inactive`, and no row is created.
  - At `2026-11-07T02:00:00Z` (Saturday), rejects `Not a workday`.
  - At `2026-11-01T23:30:00Z` (Mon 07:30 Manila), succeeds with date `2026-11-02`.
  - `punch` and `today` as non-admin reject `Not authorized`.
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run and expect PASS. Do the mutation check: swap the in/out branch order and confirm the tests go red.
- [ ] **Step 5:** Commit `feat: punch by employee ID`.

### Task 5: Electron shell + login screen (US-1 UI)

**Files:**
- Create: `vite.config.js` (`root: "hr"`, `base: "./"`, `build.outDir: "../dist/hr"`, react plugin), `electron/main.cjs`, `hr/index.html`, `hr/main.jsx`, `hr/App.jsx`, `hr/Login.jsx`, `hr/styles.css`, `playwright.config.js` (only `testDir: "e2e"`, so Playwright skips the Vitest files)
- Test: `e2e/hr.spec.js`

**Interfaces:**
- Consumes: `useAuthActions().signIn("password", { username, password, flow: "signIn" })`, `useConvexAuth()`, `signOut`.
- Produces:
  - `App` renders `Login` when unauthenticated. When authenticated, it renders a header with a Logout button and two tabs, `Punch` and `Employees` (Task 6 fills them).
  - Electron uses default `contextIsolation`, no `nodeIntegration`, and no preload. It loads `process.env.VITE_DEV_URL` if set, otherwise `dist/hr/index.html`.
  - `VITE_CONVEX_URL` comes from `.env.local`, which `npx convex dev` writes.

- [ ] **Step 1: Ask first.** Before the first login attempt, ask the user for throwaway test-admin credentials. They set `E2E_ADMIN_USER` and `E2E_ADMIN_PASS` in their own shell. This must be a separate dev deployment account, never typed by Claude.
- [ ] **Step 2: Write the failing Playwright tests.** They launch with `_electron.launch({ args: ["."] })` after `npm run build`.
  - `wrong password shows error and stays on login`
  - `correct login shows Punch tab`
  - `logout returns to login`
- [ ] **Step 3:** Run `npm run build && npm run e2e` and expect FAIL.
- [ ] **Step 4: Implement.** Login has a username field, a password field, and a submit button. Enter submits. The button is disabled with "Signing in…" while pending. A failed sign-in shows `Invalid username or password` in an `role="alert"` element.
- [ ] **Step 5:** Run and expect PASS. Do the mutation check: skip the auth gate in `App` and confirm the wrong-password test goes red.
- [ ] **Step 6:** Commit `feat: Electron HR shell and login`.

### Task 6: Punch and Employees screens (US-2, US-3 UI)

**Files:**
- Create: `hr/Punch.jsx`, `hr/Employees.jsx`
- Modify: `hr/App.jsx` (mount the tabs)
- Test: `e2e/hr.spec.js` (extend)

**Interfaces:**
- Consumes: `api.attendance.punch`, `api.attendance.today`, `api.employees.create`, `api.employees.list` (via `usePaginatedQuery`, `initialNumItems: 25`), `api.employees.setActive`.

- [ ] **Step 1: Write the failing Playwright tests.** Use a unique ID per run, `E2E-<timestamp>`. These run on a weekday. If run on a weekend, assert `Not a workday` instead.
  - `create employee appears in list`
  - `duplicate ID shows "Employee ID already exists"`
  - `blank fields show required error`
  - `search filters list`
  - `deactivate shows inactive`
  - `punch in then out shows Timed in then Timed out in today list`
  - `third punch shows "Already timed out"`
  - `unknown ID shows "Employee not found"`
  - `inactive ID shows "Employee inactive"`
  - `double Enter sends one punch`: press Enter twice quickly, and today shows `Timed in`, not `Timed out`
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3: Implement.**
  - **Punch tab:** an autofocused ID input. Enter submits. The input and button are disabled while pending. On success, show the result line ("Timed in: Juan Dela Cruz 08:05"), clear the input, and refocus. A server `ConvexError` message goes in `role="alert"`. The today table shows a loading row while `undefined` and "No punches yet today" when empty. Times are shown as Manila `HH:mm`.
  - **Employees tab:** a create form with ID, name, and temporary password. Enter submits, the button is disabled while pending, and errors go in `role="alert"`. Below it, a search box and a table (ID, name, Active/Inactive, Deactivate button) with "Load more" while `status === "CanLoadMore"`, plus loading and empty states.
- [ ] **Step 4:** Run and expect PASS. Do the mutation check: remove the pending-disable and confirm the double-Enter test goes red.
- [ ] **Step 5: Teardown.** The test data stays in the dev deployment. List the created `E2E-*` IDs in `PHASE-0-TEST-RESULTS.md` at step 8. Phase 0 has no delete function, so these rows are left behind.
- [ ] **Step 6:** Commit `feat: punch and employee screens`.
