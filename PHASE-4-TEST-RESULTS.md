# Phase 4 — Test Results

Pass run under `.claude/skills/e2e-testing` (feature-workflow step 8).

- **Date:** 2026-11-01 (Sunday, Asia/Manila)
- **Branch:** `phase-4-reports`
- **Test deployment:** throwaway project `hr-e2e-p4`, deployment `patient-parrot-302`. Admin was `e2e-admin` with a random password.
- **Isolation checks (all passed before the run):**
  - both `dist/hr` and `dist/web` referenced `patient-parrot-302` only, not `woozy-nightingale-996`
  - the deployment held exactly one user, the admin
  - `admin:isAdmin` returned `false` for an anonymous caller
  - `E2E_PURGE_ALLOWED` was set on the test deployment
- **Backend:** `npm test` (Vitest + convex-test). 107/107 pass after the review fixes.
- **E2E drivers:** Playwright over Electron (`hr` project) and Playwright in system Chrome against `vite preview` of `dist/web` (`web` project). Final full run: 36 pass, 4 skipped, 0 fail, exit 0. The 4 skipped tests are the Phase 0/1 weekday-only punch tests and still need a weekday run.
- **Outer-boundary hooks:** the native print dialog and the native Save dialog are outside the app. The print test replaces `window.print` with a recorder, checks the page under print media, and renders a real `webContents.printToPDF`. The CSV test sets the save path in Electron's `will-download` event, reads the file, then deletes it. Past punches are seeded with `e2e:seedPunch`. Nothing between the button and the Convex query is stubbed.
- **Watched fail:**
  - Both Print and both Export CSV tests failed before the buttons existed.
  - Removing `.no-print` from the print rule failed the print test.
  - Removing the UTF-8 BOM failed the CSV test.
  - Deploying a `monthFor` that marks every past weekday Absent failed the empty-DTR test.
  - All passed again after the code was restored.
- **Real bug the E2E found:** the US-10 test seeded a punch before the create action finished (a test race). Fixed by waiting for the row.
- **Purge:** 118 users, 39 sessions, plus their accounts and punches. A second purge returned 0 for every table.
- **Left behind:** nothing. The developer deleted the Convex project `hr-e2e-p4` in the dashboard on 2026-11-01.

## US-9 HR prints an employee DTR

| Condition | Test | Result |
|---|---|---|
| HR picks an employee and month and gets a print view with daily rows and totals, which can be saved as PDF | `Print opens the print dialog and print view shows only the DTR` (Print calls `window.print` once. Under print media the tabs, Log out, form, Print, Export CSV, Edit buttons, and an open correction form are hidden. The heading, the day row, and Totals stay visible. `printToPDF` returns a PDF.) | PASS |
| A month with no workdays yet, or an employee hired after that month, shows an empty DTR | `employee hired after the month shows an empty DTR` (no error, 31 date rows, no Absent, `Required — · Absences 0`). Future months are covered by the backend test `monthly: future month and month before hire are empty`. | PASS |

## US-10 HR exports monthly totals as CSV

| Condition | Test | Result |
|---|---|---|
| One row per employee with ID, name, rendered, required, missing, late, undertime, and absences | `Export CSV saves totals for the month` (file `attendance-2026-10.csv`, BOM plus exact header, active A `480,480,0,0,0,0` with the name quoted, inactive B with a punch included, status `Exported N employees`) | PASS |
| Inactive employees with no records in that month are not included | same test: inactive C with no punches is not in the file | PASS |
| No month selected | `Export CSV is disabled with no month` | PASS |

## Weekday pass (all phases)

Full suite on a Manila weekday, so the 4 weekday-only punch tests ran for the first time. Same skill and isolation as above.

- **Date:** 2026-11-02 (Monday, Asia/Manila, run at 08:43)
- **Branch:** `main` at `4baded3`
- **Test deployment:** throwaway project `hr-e2e-weekday`, deployment `keen-flamingo-154`. Admin was `e2e-admin` with a random password.
- **Isolation checks:** all 4 passed before the run (build referenced `keen-flamingo-154` only, one user, `admin:isAdmin` false, `E2E_PURGE_ALLOWED` set).
- **Full run:** 39 pass, 1 skipped, 0 fail, exit 0. The skip is `weekend punch shows Not a workday`, which runs only on Saturday/Sunday and passed on the 2026-11-01 runs.

| Story | Test | Result | Watched fail |
|---|---|---|---|
| US-3 | `punch in then out shows Timed in then Timed out` | PASS | second punch throws instead of setting `timeOut` |
| US-3 | `third punch shows Already timed out` | PASS | same mutation |
| US-3 | `double Enter sends one punch` | PASS | removed all three guards in `hr/Punch.jsx` (`pending` check, input `disabled`, button `disabled`). With only the first two removed it stayed green, because a disabled submit button blocks implicit Enter submission. |
| US-4 | `time-in only shows Incomplete for today` | PASS | `computeDay` returns `Present` instead of `Incomplete` |

All 4 passed again after the code was restored and redeployed.

- **Purge:** 42 users, 42 accounts, 23 punches, 13 sessions, 18 refresh tokens, 3 rate limits, 1 holiday. Only `e2e-admin` remained.
- **Dev restored:** `.env.local` points at `woozy-nightingale-996`, `.env.e2e` removed, both builds reference `woozy-nightingale-996` and not `keen-flamingo-154`.
- **Left behind:** nothing. The developer deleted the Convex project `hr-e2e-weekday` in the dashboard on 2026-11-02.
