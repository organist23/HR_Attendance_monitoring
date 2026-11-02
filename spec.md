# Spec: HR Employee Attendance Monitoring System

## Goal
HR records each employee's time-in and time-out by employee ID in an Electron desktop app, the system computes lateness, undertime, rendered hours, missing hours, and absences against a fixed 8:00–17:00 weekday schedule, and employees view their own DTR read-only in a web app.

## Assumptions
- Stack: React + Electron for the HR desktop app, React for the employee web app, and Convex cloud for backend, database, and auth. Language is JavaScript. Express and MySQL are not used.
- Both apps need internet access to reach Convex.
- There is one shared HR admin account.
- The timezone is Asia/Manila. All dates and times are computed in it.
- Workdays are Monday to Friday, excluding holidays HR marks.
- The schedule is 8:00–12:00 and 13:00–17:00, so 8 required hours per workday.
- The grace period is 15 minutes.
- Each day has two punches. The first is time-in and the second is time-out. Both use the current server time.
- The system tracks about 300+ employees.

### Computation rules
All rules are implemented once, in Convex.
- **Effective time-in:** if time-in is between 8:00 and 8:15, it counts as 8:00. Otherwise it is the actual time.
- **Rendered hours:** overlap of [effective time-in, time-out] with 8:00–12:00 and 13:00–17:00. The maximum is 8h.
- **Late minutes:** time-in minus 8:00 when time-in is after 8:15, otherwise 0. For example, a time-in of 8:20 is 20 minutes late.
- **Undertime minutes:** scheduled minutes after time-out, when time-out is before 17:00. The lunch hour is excluded.
- **Missing hours:** 8h minus rendered hours.
- **Status per workday:**
  - Present: in on time and out at or after 17:00, or within grace
  - Late: time-in after 8:15
  - Incomplete: time-in with no time-out, counted as 0h
  - Absent: no time-in on a past workday for an active employee

## User Stories

### US-1: HR admin logs in to the desktop app
**As** HR, **I want** the Electron app to require the admin password, **so that** only HR can record and change attendance.

**Accepts when:**
- [ ] The correct admin credentials open the HR main screen.
- [ ] Logging out returns to the login screen.

**Rejects when:**
- [ ] A wrong password shows an error and the HR screen stays closed.
- [ ] Any HR Convex function called without an admin session returns an auth error and changes nothing.

### US-2: HR manages employees
**As** HR, **I want** to create and deactivate employees, **so that** only current staff can be punched in.

**Accepts when:**
- [ ] HR creates an employee with employee ID, full name, and temporary password, and the employee appears in the list.
- [ ] HR deactivates an employee, and the list shows them as inactive.
- [ ] Searching by ID or name filters the list.
- [ ] The list is paginated and loads with 300+ employees.

**Rejects when:**
- [ ] A duplicate employee ID shows an error and creates nothing.
- [ ] An empty ID, name, or password shows an error and creates nothing.

### US-3: HR records a punch by employee ID
**As** HR, **I want** to enter an employee ID and have the current time saved, **so that** recording attendance is fast and the time can't be typed in.

**Accepts when:**
- [ ] The first punch of the day saves time-in at the current server time.
- [ ] The second punch saves time-out at the current server time.
- [ ] Today's list shows each punched employee's time-in, time-out, and status.

**Rejects when:**
- [ ] An unknown employee ID shows "employee not found" and saves nothing.
- [ ] An inactive employee ID shows "employee inactive" and saves nothing.
- [ ] A third punch on the same day shows "already timed out" and saves nothing.
- [ ] A punch on a Saturday, Sunday, or holiday shows "not a workday" and saves nothing.

### US-4: System computes daily attendance
**As** HR, **I want** each workday computed by the rules above, **so that** lateness, undertime, and missing hours are consistent.

**Accepts when:**
- [ ] 8:10–17:00 gives rendered 8h, late 0, undertime 0, missing 0, status Present.
- [ ] 8:20–17:00 gives rendered 7h40m, late 20m, missing 20m, status Late.
- [ ] 8:00–16:00 gives rendered 7h, undertime 60m, missing 1h.
- [ ] 8:00–11:00 gives rendered 3h, undertime 300m, missing 5h.
- [ ] Time-in with no time-out gives status Incomplete, rendered 0h, missing 8h.
- [ ] A past workday with no time-in gives status Absent, missing 8h.
- [ ] HR views any employee's monthly DTR: daily rows plus totals.

**Rejects when:**
- [ ] 7:30–18:00 does not give more than 8h rendered.
- [ ] Saturdays, Sundays, and holidays are not counted as Absent and add no required hours.
- [ ] Today and future days are not marked Absent.

### US-5: HR manages holidays
**As** HR, **I want** to mark holiday dates, **so that** they are not counted as workdays.

**Accepts when:**
- [ ] HR adds a holiday date with a name, and that date drops out of required hours and absences.
- [ ] HR removes a holiday, and the date becomes a workday again.

**Rejects when:**
- [ ] Adding a date that is already a holiday shows an error and adds nothing.

### US-6: HR corrects an attendance record
**As** HR, **I want** to edit time-in or time-out with a reason, **so that** mistakes and forgotten punches are fixed and the fix is traceable.

**Accepts when:**
- [ ] HR edits time-in or time-out and enters a reason, and the computed values update.
- [ ] Each correction stores the old value, new value, timestamp, and reason.
- [ ] The correction history is shown on the record.
- [ ] HR can add a missing time-out to an Incomplete day.

**Rejects when:**
- [ ] An empty reason shows an error and changes nothing.
- [ ] A time-out earlier than time-in shows an error and changes nothing.

### US-7: Employee logs in to the web app
**As** an employee, **I want** to log in with my employee ID and password, **so that** I can see my own attendance.

**Accepts when:**
- [ ] A valid ID and temporary password log in, then force a password change before anything else.
- [ ] After the change, the new password works and the old one doesn't.

**Rejects when:**
- [ ] A wrong password shows an error.
- [ ] An inactive employee can't log in.

### US-8: Employee views their own DTR
**As** an employee, **I want** to see my monthly DTR, **so that** I can track my hours, lateness, and undertime.

**Accepts when:**
- [ ] The employee picks a month and sees daily rows with time-in, time-out, rendered, late, undertime, missing, and status.
- [ ] Monthly totals show rendered, required, missing, late, undertime, and absences.

**Rejects when:**
- [ ] Requesting another employee's data returns an auth error. This is enforced in Convex, not just the UI.
- [ ] No create, edit, or delete controls are shown, and the employee session can't call HR functions.

### US-9: HR prints an employee DTR
**As** HR, **I want** a printable DTR per employee per month, **so that** it can be signed or filed.

**Accepts when:**
- [ ] HR picks an employee and month and gets a print view with daily rows and totals, which can be saved as PDF.

**Rejects when:**
- [ ] A month with no workdays yet, or an employee hired after that month, shows an empty DTR rather than an error or made-up rows.

### US-10: HR exports monthly totals as CSV
**As** HR, **I want** a CSV of all employees' monthly totals, **so that** it can be used in Excel or payroll.

**Accepts when:**
- [ ] HR picks a month and downloads a CSV with one row per employee: ID, name, rendered, required, missing, late, undertime, and absences.

**Rejects when:**
- [ ] Inactive employees with no records in that month are not included.

## Out of Scope
- Leave and overtime, because the user excluded them from the first version.
- Multiple HR accounts and roles, because one shared admin login was chosen.
- Rotating or night shifts and per-employee schedules, because there is one fixed schedule.
- Biometric or RFID import, and employee self clock-in, because HR records all punches.
- Express and MySQL, because Convex replaces them.

## Open Questions
- None.

---

# Part two: Going live

## Goal
HR installs the desktop app on Windows from a GitHub Release, imports the existing employees from a CSV, and employees log in to the web app on Vercel, all against a production Convex deployment that a push to `main` releases.

## Assumptions
- Prod starts empty. Dev data on `woozy-nightingale-996` is not copied.
- Prod gets its own auth keys and its own HR admin, created with the internal `admin:create` from the CLI. `E2E_PURGE_ALLOWED` is never set on prod.
- Vercel is connected to the GitHub repo. Its build runs `npx convex deploy` with a prod deploy key, then builds the web app. A push to `main` releases backend and web together.
- The web app uses the default `*.vercel.app` address. Prod's `SITE_URL` is that address.
- The HR installer is Windows only and unsigned, so SmartScreen warns once on install. Updates mean installing a newer `.exe`. It is built locally against prod and uploaded to a GitHub Release.
- An installed HR app keeps working against the newest prod backend until a change breaks compatibility. Such a change ships with a new installer.
- The import CSV has a header row with columns for employee ID and full name. HR exports it from Excel, so it may start with a UTF-8 BOM.
- Every row is validated before any employee is created.
- E2E passes never run against prod (`e2e-testing` skill). Prod is checked only with steps that create no employees or punches.

## User Stories

### US-11: Production backend
**As** the developer, **I want** a production Convex deployment separate from dev, **so that** real attendance data never mixes with test data.

**Accepts when:**
- [ ] A prod deployment exists with its own `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` set to the Vercel address.
- [ ] Prod has exactly one HR admin, and the HR app built against prod logs in with it.
- [ ] A push to `main` deploys the current functions and schema to prod.
- [ ] Dev (`woozy-nightingale-996`) keeps working as before.

**Rejects when:**
- [ ] `e2e:purge` and `e2e:seedPunch` on prod fail with "E2E purge disabled on this deployment".
- [ ] Running `admin:create` a second time on prod fails with "Admin already exists".
- [ ] A Vercel build without the prod deploy key fails instead of deploying anywhere else.

### US-12: Employee web app on Vercel
**As** an employee, **I want** to open the attendance site from any browser, **so that** I can check my DTR without HR.

**Accepts when:**
- [ ] `https://<name>.vercel.app` shows the employee login.
- [ ] An employee logs in, is forced to change the temp password, and sees their own DTR (US-7, US-8).
- [ ] A push to `main` redeploys the site.

**Rejects when:**
- [ ] The deployed bundle references only the prod deployment, never dev or a test project.
- [ ] A failed backend deploy fails the Vercel build, and the previous site stays live.
- [ ] A wrong password on the live site shows the same error as US-7.

### US-13: Windows installer for the HR app
**As** HR, **I want** to install the desktop app like any Windows program, **so that** I don't need Node or the source code.

**Accepts when:**
- [ ] One command builds a Windows `.exe` installer against prod.
- [ ] Installing on a Windows PC without Node adds a Start menu shortcut, and the app opens to the HR login and logs in with the prod admin.
- [ ] The installer is attached to a GitHub Release tagged with the app version.
- [ ] Installing a newer version upgrades in place, and uninstalling removes the app.

**Rejects when:**
- [ ] The build command refuses to run when the Convex URL is missing, dev, or a test project.
- [ ] The installed app does not open DevTools or load anything except its own bundled files.

### US-14: HR bulk-imports employees from CSV
**As** HR, **I want** to import the existing employee list from a CSV, **so that** I don't type in 300+ employees one by one.

**Accepts when:**
- [ ] The Employees tab has an Import CSV button that opens a file picker.
- [ ] A valid file creates every row as an active employee, each with a random temporary password.
- [ ] HR then saves a CSV of employee ID, name, and temp password through the native Save dialog.
- [ ] An imported employee logs in with that temp password and is forced to change it (US-7).
- [ ] A 300+ row file imports, and names with accents like "Ñ" are preserved.
- [ ] If HR cancels the Save dialog, the result stays on screen with a Save button until HR dismisses it.

**Rejects when:**
- [ ] Any bad row creates nothing, and every error is listed with its line number: a blank ID or name, an ID repeated in the file, or an ID that already exists.
- [ ] A file with a missing ID or name column, no data rows, or that is not CSV creates nothing and says why.
- [ ] Temp passwords are shown only in that result. They are not stored in plain text and cannot be fetched again later.

## Out of Scope
- Code signing and auto-update, because the user chose an unsigned manual installer.
- macOS and Linux builds, because HR uses Windows.
- A custom domain, because the default `*.vercel.app` was chosen.
- Copying dev data to prod, because prod starts fresh.
- Reading `.xlsx` directly, and importing punches or history, because the import takes a CSV of employees only.
- Emailing or texting temp passwords, because HR hands them out from the saved file.
- A staging deployment, because throwaway E2E projects cover pre-release testing.

## Open Questions
- None.
