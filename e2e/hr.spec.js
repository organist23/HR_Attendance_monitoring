import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { isWorkday as isWorkdayRule, manilaDay } from "../convex/lib/manila.js";

const USER = process.env.E2E_ADMIN_USER;
const PASS = process.env.E2E_ADMIN_PASS;
if (!USER || !PASS) throw new Error("Set E2E_ADMIN_USER and E2E_ADMIN_PASS in .env.e2e");

// Server time decides workdays, so punch-flow tests can only run on a Manila workday.
const isWorkday = isWorkdayRule(manilaDay(Date.now()).weekday);

let app;
let page;

test.beforeEach(async () => {
  // VS Code terminals set ELECTRON_RUN_AS_NODE=1, which makes Electron run as plain Node.
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  await page.evaluate(() => localStorage.clear()); // start every test logged out
  await page.reload();
});

test.afterEach(async () => {
  // app.close() occasionally hangs on Windows; exit the app hard so Playwright sees the process end.
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  await app.close().catch(() => {});
});

async function login(user = USER, pass = PASS) {
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(pass);
  await page.getByLabel("Password").press("Enter");
}

async function createEmployee(employeeId, name = "E2E Tester", password = "temp-pass-1") {
  await page.getByRole("tab", { name: "Employees" }).click();
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Temporary password").fill(password);
  await page.getByRole("button", { name: "Create employee" }).click();
  // Earlier runs leave E2E rows behind, so a new one may sort past page 1: search for it.
  await page.getByLabel("Search employees").fill(employeeId);
}

const newId = () => `E2E-${Date.now()}`;
const rowFor = (id) => page.getByRole("row").filter({ hasText: id });

async function punch(employeeId) {
  await page.getByRole("tab", { name: "Punch" }).click();
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Employee ID").press("Enter");
}

// US-1
test.describe("US-1 HR login", () => {
  test("wrong password shows error and stays on login", async () => {
    await login(USER, "definitely-wrong-password");
    await expect(page.getByRole("alert")).toHaveText("Invalid username or password");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("correct login shows Punch tab", async () => {
    await login();
    await expect(page.getByRole("tab", { name: "Punch" })).toBeVisible();
  });

  test("employee account sees Not authorized and can log out", async () => {
    await login();
    const id = newId();
    await createEmployee(id, "E2E Employee", "emp-pass-123");
    await expect(rowFor(id)).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await login(id, "emp-pass-123");
    await expect(page.getByRole("alert")).toHaveText("This account is not an HR admin.");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("logout returns to login", async () => {
    await login();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

// US-2
test.describe("US-2 Manage employees", () => {
  test.beforeEach(() => login());

  test("create employee appears in list as Active", async () => {
    const id = newId();
    await createEmployee(id);
    await expect(rowFor(id)).toContainText("Active");
  });

  test("duplicate ID shows error", async () => {
    const id = newId();
    await createEmployee(id);
    await expect(rowFor(id)).toBeVisible();
    await createEmployee(id, "Someone Else");
    await expect(page.getByRole("alert")).toHaveText("Employee ID already exists");
  });

  test("blank fields show required error", async () => {
    await createEmployee(newId(), "   ");
    await expect(page.getByRole("alert")).toHaveText("Employee ID, name, and password are required");
  });

  test("search filters list", async () => {
    const id = newId();
    await createEmployee(id, "Zyx Searchable");
    await page.getByLabel("Search employees").fill("Zyx");
    await expect(rowFor(id)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "E2E Tester" })).toHaveCount(0);
  });

  test("deactivate shows Inactive", async () => {
    const id = newId();
    await createEmployee(id);
    await rowFor(id).getByRole("button", { name: "Deactivate" }).click();
    await expect(rowFor(id)).toContainText("Inactive");
  });
});

// US-3
test.describe("US-3 Record punch", () => {
  test.beforeEach(() => login());

  test("unknown ID shows Employee not found", async () => {
    await punch("NOPE-000");
    await expect(page.getByRole("alert")).toHaveText("Employee not found");
  });

  test("inactive ID shows Employee inactive", async () => {
    const id = newId();
    await createEmployee(id);
    await rowFor(id).getByRole("button", { name: "Deactivate" }).click();
    await expect(rowFor(id)).toContainText("Inactive");
    await punch(id);
    await expect(page.getByRole("alert")).toHaveText("Employee inactive");
  });

  test("weekend punch shows Not a workday", async () => {
    test.skip(isWorkday, "only runs on Saturday/Sunday Manila time");
    const id = newId();
    await createEmployee(id);
    await expect(rowFor(id)).toBeVisible();
    await punch(id);
    await expect(page.getByRole("alert")).toHaveText("Not a workday");
  });

  test.describe("workday flow", () => {
    test.skip(!isWorkday, "server rejects weekend punches; run Monday-Friday Manila time");

    test("punch in then out shows Timed in then Timed out", async () => {
      const id = newId();
      await createEmployee(id);
      await expect(rowFor(id)).toBeVisible();
      await punch(id);
      await expect(rowFor(id)).toContainText("Timed in");
      await punch(id);
      await expect(rowFor(id)).toContainText("Timed out");
    });

    test("third punch shows Already timed out", async () => {
      const id = newId();
      await createEmployee(id);
      await expect(rowFor(id)).toBeVisible();
      for (const status of ["Timed in", "Timed out"]) {
        await punch(id);
        await expect(rowFor(id)).toContainText(status);
      }
      await punch(id);
      await expect(page.getByRole("alert")).toHaveText("Already timed out");
    });

    test("double Enter sends one punch", async () => {
      const id = newId();
      await createEmployee(id);
      await expect(rowFor(id)).toBeVisible();
      await page.getByRole("tab", { name: "Punch" }).click();
      await page.getByLabel("Employee ID").fill(id);
      await page.getByLabel("Employee ID").press("Enter");
      await page.getByLabel("Employee ID").press("Enter");
      await expect(rowFor(id)).toContainText("Timed in");
      await page.waitForTimeout(1500); // give a second punch time to land if one was sent
      await expect(rowFor(id)).toContainText("Timed in");
    });
  });
});

// Holiday helpers. Dates are in the current Manila month (so the DTR shows them) and never today.
const today = () => manilaDay(Date.now()).date;
const dateInMonth = (day) => `${today().slice(0, 8)}${String(day).padStart(2, "0")}`;
const notToday = (day) => (dateInMonth(day) === today() ? dateInMonth(day - 1) : dateInMonth(day));
// A date no earlier run used, so leftovers from an unpurged run can't collide.
const uniqueDate = () => `${2100 + Math.floor(Math.random() * 7000)}-01-15`;

async function addHoliday(date, name) {
  await page.getByRole("tab", { name: "Holidays" }).click();
  await page.getByLabel("Date").fill(date);
  await page.getByLabel("Holiday name").fill(name);
  await page.getByRole("button", { name: "Add holiday" }).click();
}

async function viewDtr(employeeId, month) {
  await page.getByRole("tab", { name: "DTR" }).click();
  if (month) await page.getByLabel("Month").fill(month);
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Employee ID").press("Enter");
}

// US-5
test.describe("US-5 Manage holidays", () => {
  test.beforeEach(() => login());

  test("added holiday appears in list and drops out of the DTR", async () => {
    const name = `E2E-Holiday-${Date.now()}`;
    const date = notToday(28);
    await addHoliday(date, name);
    await expect(rowFor(name)).toContainText(date);
    const id = newId();
    await createEmployee(id);
    await expect(rowFor(id)).toBeVisible();
    await viewDtr(id);
    await expect(page.getByRole("row").filter({ hasText: date })).toContainText(name);
    // Fixed date in this month: remove it so a re-run before purge doesn't hit a duplicate.
    await page.getByRole("tab", { name: "Holidays" }).click();
    await rowFor(name).getByRole("button", { name: "Remove" }).click();
    await expect(rowFor(name)).toHaveCount(0);
  });

  test("duplicate date shows error", async () => {
    const date = uniqueDate();
    await addHoliday(date, `E2E-First-${Date.now()}`);
    await expect(rowFor(date)).toBeVisible();
    await addHoliday(date, `E2E-Second-${Date.now()}`);
    await expect(page.getByRole("alert")).toHaveText("Date is already a holiday");
    await expect(rowFor(date)).toHaveCount(1);
  });

  test("remove drops the holiday", async () => {
    const name = `E2E-Remove-${Date.now()}`;
    await addHoliday(uniqueDate(), name);
    await expect(rowFor(name)).toBeVisible();
    await rowFor(name).getByRole("button", { name: "Remove" }).click();
    await expect(rowFor(name)).toHaveCount(0);
  });
});

// US-4
test.describe("US-4 Monthly DTR", () => {
  test.beforeEach(() => login());

  test("DTR shows the employee's month with today's row and totals", async () => {
    const id = newId();
    await createEmployee(id, "E2E Dtr");
    await expect(rowFor(id)).toBeVisible();
    await viewDtr(id);
    await expect(page.getByRole("heading", { level: 2 })).toContainText(`${id} E2E Dtr`);
    await expect(page.getByRole("row").filter({ hasText: today() })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Totals" })).toContainText("Absences 0");
  });

  test("unknown ID shows Employee not found", async () => {
    await viewDtr("NOPE-000");
    await expect(page.getByRole("alert")).toHaveText("Employee not found");
  });

  test("time-in only shows Incomplete for today", async () => {
    test.skip(!isWorkday, "server rejects weekend punches; run Monday-Friday Manila time");
    const id = newId();
    await createEmployee(id);
    await expect(rowFor(id)).toBeVisible();
    await punch(id);
    await expect(rowFor(id)).toContainText("Timed in");
    await viewDtr(id);
    await expect(page.getByRole("row").filter({ hasText: today() })).toContainText("Incomplete");
  });
});

// US-6. The UI only punches today, so each test seeds a past Friday through e2e:seedPunch
// (gated like purge) and runs on any day of the week.
const SEED_DATE = "2026-10-30";
const atManila = (hhmm) => Date.parse(`${SEED_DATE}T${hhmm}:00+08:00`);

function seedPunch(employeeId, timeIn, timeOut) {
  const deployment = process.env.E2E_DEPLOYMENT;
  if (!deployment) throw new Error("Set E2E_DEPLOYMENT in .env.e2e");
  const args = { employeeId, date: SEED_DATE, timeIn: atManila(timeIn), ...(timeOut && { timeOut: atManila(timeOut) }) };
  execFileSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", "run", "--deployment", deployment, "e2e:seedPunch", JSON.stringify(args)],
    { stdio: "pipe" },
  );
}

test.describe("US-6 Corrections", () => {
  test.beforeEach(() => login());

  const day = () => page.getByRole("row").filter({ hasText: SEED_DATE });
  const cell = (n) => day().getByRole("cell").nth(n); // 4 rendered, 5 late, 7 missing

  async function seededDtr() {
    const id = newId();
    await createEmployee(id);
    await expect(rowFor(id)).toBeVisible();
    seedPunch(id, "08:00");
    await viewDtr(id, SEED_DATE.slice(0, 7));
    await expect(day()).toContainText("Incomplete");
  }

  async function submitCorrection({ timeIn, timeOut, reason }) {
    await day().getByRole("button", { name: "Edit" }).click();
    if (timeIn) await page.getByLabel("Time in").fill(timeIn);
    if (timeOut) await page.getByLabel("Time out").fill(timeOut);
    await page.getByLabel("Reason").fill(reason);
    await page.getByRole("button", { name: "Save" }).click();
  }

  test("adding a time-out and fixing time-in recompute the day and show history", async () => {
    await seededDtr();
    await day().getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Time in")).toHaveValue("08:00");
    await expect(page.getByLabel("Time in")).toBeFocused();
    await page.getByRole("button", { name: "Cancel" }).click();

    await submitCorrection({ timeOut: "17:00", reason: "E2E forgot out" });
    await expect(day()).toContainText("Present · Corrected");
    await expect(cell(3)).toHaveText("17:00");
    await expect(cell(4)).toHaveText("8h");
    await expect(cell(7)).toHaveText("—");

    await submitCorrection({ timeIn: "08:20", reason: "E2E late" });
    await expect(day()).toContainText("Late · Corrected");
    await expect(cell(4)).toHaveText("7h 40m");
    await expect(cell(5)).toHaveText("20m");

    await day().getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText(/^Time out: — → 17:00 · E2E forgot out · /)).toBeVisible();
    await expect(page.getByText(/^Time in: 08:00 → 08:20 · E2E late · /)).toBeVisible();
  });

  test("blank reason shows error and changes nothing", async () => {
    await seededDtr();
    await submitCorrection({ timeOut: "17:00", reason: "" });
    await expect(page.getByRole("alert")).toHaveText("Reason is required");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(day()).toContainText("Incomplete");
    await expect(cell(3)).toHaveText("—");
  });

  test("time-out before time-in shows error and changes nothing", async () => {
    await seededDtr();
    await submitCorrection({ timeOut: "07:00", reason: "E2E wrong" });
    await expect(page.getByRole("alert")).toHaveText("Time-out must be after time-in");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(day()).toContainText("Incomplete");
    await expect(cell(3)).toHaveText("—");
  });

  test("Escape closes the form and returns focus to Edit", async () => {
    await seededDtr();
    await day().getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Reason").press("Escape");
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(day().getByRole("button", { name: "Edit" })).toBeFocused();
  });
});
