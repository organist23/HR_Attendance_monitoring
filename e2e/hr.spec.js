import { _electron as electron, expect, test } from "@playwright/test";

const USER = process.env.E2E_ADMIN_USER;
const PASS = process.env.E2E_ADMIN_PASS;
if (!USER || !PASS) throw new Error("Set E2E_ADMIN_USER and E2E_ADMIN_PASS in .env.e2e");

// Server time decides workdays, so punch-flow tests can only run Monday-Friday (Manila).
const manilaWeekday = new Date(Date.now() + 8 * 3600_000).getUTCDay();
const isWorkday = manilaWeekday >= 1 && manilaWeekday <= 5;

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
