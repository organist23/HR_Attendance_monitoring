# Phase 3 — Employee Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees log in to a React web app with their employee ID and password, must change the temporary password first, then view their own monthly DTR read-only.

**Architecture:** Same Convex backend and auth. The Password provider's `authorize` is wrapped so inactive employees cannot sign in. A new `convex/self.js` holds the employee-only functions (`me`, `monthly`, `changePassword`), all scoped to the caller's own user. `self.monthly` reuses the month builder extracted from `attendance.monthly`, so no DTR math is duplicated. A second Vite root `web/` builds to `dist/web` and reuses `hr/Login.jsx`, `hr/styles.css`, `hr/errors.js`, and the DTR cells from `hr/DTR.jsx`.

**Tech Stack:** Existing only. Convex + @convex-dev/auth 0.0.96, React, Vite, Vitest + convex-test, Playwright (Electron for HR, system Chrome via `channel: "chrome"` for web). No new deps.

**Spec:** `spec.md` US-7, US-8. Roadmap: `roadmap.md`, Phase 3.

## Context

Decision taken with the user: employees see only the US-8 columns. `self.monthly` never returns `corrections`.

A user must change password while `passwordChangedAt` is unset. That field is new, so every existing employee is forced to change their temporary password on first web login. No migration is needed.

## Global Constraints

- Every `self.*` function reads the caller from `getAuthUserId` and takes no employee ID. Callers must be `role: "employee"` and `active`. Otherwise: `Not authorized`.
- `self.monthly` throws `Password change required` until `passwordChangedAt` is set.
- Error copy, exact: `Not authorized`, `Password change required`, `Current password is incorrect`, `New password must be at least 8 characters`, `New password must be different`, `Account inactive` (sign-in), and client-only `Passwords do not match`, `Invalid employee ID or password`, `This account can't use the employee app.`
- DTR numbers come only from `computeDay` through the shared month builder (Phase 1 convention). `today` comes from the client.
- HR functions keep `requireAdmin` first. Employee sessions get `Not authorized` from all of them (already true).
- UI keeps loading, error and empty states, Enter submits, focus goes to the first field. Reuse `hr/styles.css` tokens, with no new design.

## Review Focus

1. **Deactivated while signed in.** An existing session must stop at the next `self.*` call (`Not authorized`), and the web app shows the not-allowed screen. Test in Task 2.
2. **Admin signs in to the web app.** `me` returns `null`, and the app shows `This account can't use the employee app.` with Log out. Test in Task 2 and Task 4.
3. **Password change on another device.** The old password is rejected on the next sign-in. Test in Task 2 (via `changePassword` with the old password) and Task 4.
4. **Wrong current password repeated.** No credential change, flag unchanged. Test in Task 2.
5. **Month with no counted days** (a month before hire) shows rows and zero totals, not an error. Test in Task 2.

---

### Task 1: Block inactive sign-in, share the month builder

**Files:**
- Modify: `convex/auth.js`, `convex/attendance.js`
- Test: `convex/attendance.test.js` (existing `monthly:` tests must stay green unchanged)

**Interfaces:**
- Produces: `export async function monthFor(ctx, user, month, today) → { employeeId, name, days, totals }` in `convex/attendance.js`. It validates `month` (`Invalid month`). `attendance.monthly` becomes lookup + `requireAdmin` + `monthFor`.
- Produces: the sign-in for a `role: "employee"` user with `active !== true` throws `ConvexError("Account inactive")` after the password check.

- [ ] **Step 1:** Extract `monthFor` with no behavior change. Run `npm test`. Expected: 84/84 (refactor guarded by the existing `monthly:` tests).
- [ ] **Step 2:** Wrap the provider: `const password = Password({ profile })`, keep the original `password.authorize`, and replace it with one that awaits the original, loads the user via `ctx.runQuery(internal.admin.getUser, { userId })`, and throws `Account inactive` for an inactive employee. convex-test cannot run the sign-in action without JWT keys, so Task 4's E2E `inactive employee can't log in` is this step's test (ledger it).
- [ ] **Step 3: Commit** `refactor: share month builder; block inactive employee sign-in (US-7)`.

### Task 2: `convex/self.js`

**Files:**
- Create: `convex/self.js`, `convex/self.test.js`
- Modify: `convex/schema.js` (users add `passwordChangedAt: v.optional(v.number())`)

**Interfaces:**
- Consumes: `monthFor`, `internal.admin.getUser`.
- Produces: `api.self.me() → { employeeId, name, mustChangePassword } | null` (null when signed out, not an employee, or inactive).
- Produces: `api.self.monthly({ month, today }) → { employeeId, name, days, totals }` with each day lacking `corrections`.
- Produces: `api.self.changePassword({ current, next }) → null` (action). It verifies with `retrieveAccount` (any throw or null → `Current password is incorrect`), then `modifyAccountCredentials`, then `internal.self.markPasswordChanged({ userId })` sets `passwordChangedAt: Date.now()`.

- [ ] **Step 1: Write failing tests** in `convex/self.test.js`. Employees are created through `api.employees.create` as admin (real auth account, `temp-pass-1`), and the employee identity is `t.withIdentity({ subject: \`${userId}|session\` })`. Use fake timers as `attendance.test.js` does. Employee is created Nov 1 Manila, and the month is `2026-11` with today `2026-11-06`.
  - `me: new employee must change password` → `{ employeeId: "E001", name: "Juan Dela Cruz", mustChangePassword: true }`.
  - `me: null for signed out, admin, inactive`.
  - `monthly: blocked until password changed` → `Password change required`.
  - `monthly: own month after change` — after `changePassword`, with Nov 2 08:20–17:00 inserted → that day `[460, 20, 0, 20, "Late"]`, `totals` `{ rendered: 460, required: 1920, missing: 1460, late: 20, undertime: 0, absences: 3 }`, and no day has a `corrections` key even when the row has one.
  - `monthly: month before hire is empty` — `2026-10` → 31 days, all status `""`, totals all 0.
  - `monthly: inactive, admin, signed out rejected` → `Not authorized`. Inactive includes deactivating after the change (Review Focus 1).
  - `changePassword: new works, old does not` → `me().mustChangePassword` false. A second `changePassword({ current: "temp-pass-1", ... })` → `Current password is incorrect`. `changePassword({ current: "new-pass-22", next: "new-pass-33" })` succeeds.
  - `changePassword: wrong current, short or same new rejected, flag unchanged` → `Current password is incorrect`, `New password must be at least 8 characters` (7 chars), `New password must be different`. `me().mustChangePassword` stays true.
  - `changePassword: admin and inactive rejected` → `Not authorized`.
  - `HR functions reject an employee session` — `attendance.monthly` for another employee ID and `employees.create` → `Not authorized` (US-8).
- [ ] **Step 2: Run** `npx vitest run convex/self.test.js`. Expected: FAIL, `self` module missing.
- [ ] **Step 3: Implement** `self.js`: a local `requireEmployee(ctx, { allowPending })` for queries, and the same checks via `runQuery(getUser)` in the action. Strip `corrections` from days with destructuring.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Mutation check.** Drop the `Password change required` check, then the `retrieveAccount` verify. Matching tests go red. Restore.
- [ ] **Step 6: Commit** `feat: employee self functions: me, monthly, changePassword (US-7, US-8)`.

### Task 3: Web app

**Files:**
- Create: `vite.web.config.js` (root `web`, `envDir: ".."`, outDir `../dist/web`), `web/index.html`, `web/main.jsx`, `web/App.jsx`, `web/ChangePassword.jsx`, `web/MyDtr.jsx`
- Modify: `hr/Login.jsx` (props `title = "HR Attendance"`, `userLabel = "Username"`; ConvexError text shown via `errorText`, otherwise `Invalid ${userLabel.toLowerCase()} or password`). The HR copy stays exactly as before.
- Modify: `hr/DTR.jsx` (export `DayCells({ d })`: the 9 day `<td>`s, status uses `d.corrections?.length`. Export `TotalCells({ totals })`. HR table uses both, same output.)
- Modify: `package.json` (`"build": "vite build && vite build --config vite.web.config.js"`, `"web": "vite --config vite.web.config.js"`)

**Interfaces:**
- Consumes: `api.self.*`.

- [ ] **Step 1: Implement.**
  - `App`: auth loading or `me` loading → `Loading…`. Signed out → `<Login title="Employee DTR" userLabel="Employee ID" />`. `me === null` → card with the not-allowed alert + Log out. `mustChangePassword` → `ChangePassword`. Otherwise a header (`Employee DTR`, `{employeeId} {name}`, Log out) + `MyDtr`.
  - `ChangePassword`: labeled `Current password`, `New password`, `Confirm new password`, and a `Change password` button (`Saving…` while pending). A mismatch is caught client-side before calling. Server errors go in `role="alert"`. Log out is available.
  - `MyDtr`: `Month` input defaulting to the current Manila month, a table with the same columns as HR without Actions, `Loading…`, totals footer. No edit controls.
- [ ] **Step 2: Check** `npm run build` builds both apps, and the HR E2E login copy test still passes in Task 4's run.
- [ ] **Step 3: Commit** `feat: employee web app (US-7, US-8)`.

### Task 4: E2E for US-7 and US-8

**Files:**
- Create: `e2e/web.spec.js`
- Modify: `playwright.config.js` (projects `hr` → `hr.spec.js`, `web` → `web.spec.js` with `channel: "chrome"` and `baseURL: "http://localhost:4174"`; `webServer` runs `npx vite preview --config vite.web.config.js --port 4174 --strictPort`)
- Modify: `.claude/skills/e2e-testing/SKILL.md` (isolation check 1 also greps `dist/web/assets`, teardown rebuild covers both)

Setup in the spec goes through the real deployment: a `ConvexHttpClient` on `VITE_CONVEX_URL` (loaded from `.env.local`) signs in as `e2e-admin` via `api.auth.signIn` and creates `E2E-` employees via `api.employees.create` (`temp-pass-1`), deactivates via `api.employees.setActive`, and seeds a punch with the Phase 2 `e2e:seedPunch` CLI helper. Write the tests first and run them against the build from before Task 3 where possible (RED).

- [ ] **Step 1: Write tests**, one per US-7/US-8 condition:
  - US-7 accepts: temp password → `Change your password` screen, DTR table absent. Change → DTR shown. Log out. Old password → `Invalid employee ID or password`. New password → DTR shown.
  - US-7 rejects: wrong password → `Invalid employee ID or password`. Inactive employee → `Account inactive`, no DTR. Confirm mismatch → `Passwords do not match`. Wrong current → `Current password is incorrect`.
  - US-8 accepts: seeded Fri 2026-10-30 08:20–17:00, month `2026-10` → row `08:20`, `17:00`, `7h 40m`, `20m`, `—`, `20m`, `Late`. Totals rendered `7h 40m`, late `20m`, missing `20m`, `Required 8h · Absences 0`.
  - US-8 rejects: no `Edit`, `Save`, `Delete`, `Create` buttons on the page. Through the HTTP client signed in as the employee, `attendance.monthly` for another ID and `employees.create` reject with `Not authorized`.
  - Admin signs in to the web app → `This account can't use the employee app.`
- [ ] **Step 2: Run** the pass under `.claude/skills/e2e-testing`. Expected: hr + web all pass except the known weekday skips.
- [ ] **Step 3: Mutation check.** Remove the inactive wrapper on the test deployment → the inactive test goes red. Restore.
- [ ] **Step 4: Record** `PHASE-3-TEST-RESULTS.md`. Commit `test: phase 3 e2e`.

Deliberately not built: hosting the web build (only `vite preview` locally), signing out other sessions after a password change, employee self-service password reset.
