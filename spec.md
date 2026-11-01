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
