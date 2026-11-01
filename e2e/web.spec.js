import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { SEED_DATE, seedPunchOn } from "./seed.js";

// Employee web app (US-7, US-8) in system Chrome. Setup goes through the real test deployment:
// an HTTP client signed in as e2e-admin creates the E2E- employees.
process.loadEnvFile(".env.local"); // VITE_CONVEX_URL of the test deployment
const { VITE_CONVEX_URL, E2E_ADMIN_USER, E2E_ADMIN_PASS } = process.env;
if (!E2E_ADMIN_USER || !E2E_ADMIN_PASS) throw new Error("Set E2E_ADMIN_USER and E2E_ADMIN_PASS in .env.e2e");

const TEMP = "temp-pass-1";
const NEW = "new-pass-22";

async function clientAs(username, password) {
  const client = new ConvexHttpClient(VITE_CONVEX_URL);
  const { tokens } = await client.action(api.auth.signIn, {
    provider: "password",
    params: { username, password, flow: "signIn" },
  });
  client.setAuth(tokens.token);
  return client;
}

let admin;
test.beforeAll(async () => {
  admin = await clientAs(E2E_ADMIN_USER, E2E_ADMIN_PASS);
});

let seq = 0;
async function newEmployee() {
  const employeeId = `E2E-W${Date.now()}-${seq++}`;
  const userId = await admin.action(api.employees.create, { employeeId, name: "E2E Web", password: TEMP });
  return { employeeId, userId };
}

async function login(page, id, password) {
  await page.goto("/");
  await page.getByLabel("Employee ID").fill(id);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
}

async function changePassword(page, current, next, confirm = next) {
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(confirm);
  await page.getByRole("button", { name: "Change password" }).click();
}

test.describe("US-7 Employee logs in", () => {
  test("temp password forces a change; then the new password works and the old one doesn't", async ({ page }) => {
    const { employeeId } = await newEmployee();
    await login(page, employeeId, TEMP);
    await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await changePassword(page, TEMP, NEW);
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("banner")).toContainText(`${employeeId} E2E Web`);

    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, employeeId, TEMP);
    await expect(page.getByRole("alert")).toHaveText("Invalid employee ID or password");
    await login(page, employeeId, NEW);
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    const { employeeId } = await newEmployee();
    await login(page, employeeId, "wrong-pass-9");
    await expect(page.getByRole("alert")).toHaveText("Invalid employee ID or password");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("inactive employee can't log in", async ({ page }) => {
    const { employeeId, userId } = await newEmployee();
    await admin.mutation(api.employees.setActive, { userId, active: false });
    await login(page, employeeId, TEMP);
    await expect(page.getByRole("alert")).toHaveText("Account inactive");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("mismatched confirm and wrong current password show errors", async ({ page }) => {
    const { employeeId } = await newEmployee();
    await login(page, employeeId, TEMP);
    await changePassword(page, TEMP, NEW, "different-1");
    await expect(page.getByRole("alert")).toHaveText("Passwords do not match");
    await changePassword(page, "wrong-pass-0", NEW);
    await expect(page.getByRole("alert")).toHaveText("Current password is incorrect");
    await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
  });

  test("HR admin can't use the employee app", async ({ page }) => {
    await login(page, E2E_ADMIN_USER, E2E_ADMIN_PASS);
    await expect(page.getByRole("alert")).toHaveText("This account can't use the employee app.");
  });
});

test.describe("US-8 Employee views own DTR", () => {
  async function readyEmployee() {
    const e = await newEmployee();
    await (await clientAs(e.employeeId, TEMP)).action(api.self.changePassword, { current: TEMP, next: NEW });
    return { ...e, client: await clientAs(e.employeeId, NEW) };
  }

  test("month shows daily values and totals, read-only", async ({ page }) => {
    const { employeeId } = await readyEmployee();
    seedPunchOn(employeeId, SEED_DATE, "08:20", "17:00");
    await login(page, employeeId, NEW);
    await page.getByLabel("Month").fill(SEED_DATE.slice(0, 7));
    const day = page.getByRole("row").filter({ hasText: SEED_DATE });
    // Hand-derived: 08:20–17:00 → rendered 7h 40m, late 20m, no undertime, missing 20m.
    await expect(day.getByRole("cell")).toHaveText([SEED_DATE, "Fri", "08:20", "17:00", "7h 40m", "20m", "—", "20m", "Late"]);
    // Hired after October, so only the punched day counts: required 8h, no absences.
    const totals = page.getByRole("row").filter({ hasText: "Totals" });
    await expect(totals.getByRole("cell")).toHaveText(["7h 40m", "20m", "—", "20m", "Required 8h · Absences 0"]);
    await expect(page.getByRole("button")).toHaveText(["Log out"]); // no create, edit or delete controls
  });

  test("cleared month asks for a month instead of loading forever", async ({ page }) => {
    const { employeeId } = await readyEmployee();
    await login(page, employeeId, NEW);
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByLabel("Month").fill("");
    await expect(page.getByRole("status")).toHaveText("Pick a month.");
  });

  test("deactivated while signed in shows the not-allowed screen", async ({ page }) => {
    const { employeeId, userId } = await readyEmployee();
    await login(page, employeeId, NEW);
    await expect(page.getByRole("table")).toBeVisible();
    await admin.mutation(api.employees.setActive, { userId, active: false });
    await expect(page.getByRole("alert")).toHaveText("This account can't use the employee app.");
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("employee session can't read another employee or call HR functions", async () => {
    const { employeeId, client } = await readyEmployee();
    const other = await newEmployee();
    const month = { month: "2026-10", today: "2026-11-01" };
    expect((await client.query(api.self.monthly, month)).employeeId).toBe(employeeId);
    await expect(client.query(api.attendance.monthly, { employeeId: other.employeeId, ...month })).rejects.toThrow(
      "Not authorized",
    );
    await expect(
      client.action(api.employees.create, { employeeId: `E2E-X${Date.now()}`, name: "X", password: TEMP }),
    ).rejects.toThrow("Not authorized");
    await expect(client.mutation(api.attendance.punch, { employeeId })).rejects.toThrow("Not authorized");
  });
});
