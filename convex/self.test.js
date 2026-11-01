import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asRole, modules } from "../test/convexHelpers";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const at = (iso) => vi.setSystemTime(new Date(iso));

const NOV1 = "2026-10-31T16:00:00Z"; // Sun Nov 1 00:00 Manila: employee created
const NOW = "2026-11-06T02:00:00Z"; // Fri Nov 6 10:00 Manila
const manila = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`);
const NOV = { month: "2026-11", today: "2026-11-06" };

async function setup() {
  const t = convexTest(schema, modules);
  const { as: admin } = await asRole(t, "admin", { email: "admin" });
  at(NOV1);
  const userId = await admin.action(api.employees.create, {
    employeeId: "E001", name: "Juan Dela Cruz", password: "temp-pass-1",
  });
  at(NOW);
  const emp = t.withIdentity({ subject: `${userId}|session` });
  const change = (current, next) => emp.action(api.self.changePassword, { current, next });
  const deactivate = () => admin.mutation(api.employees.setActive, { userId, active: false });
  return { t, admin, emp, userId, change, deactivate };
}

test("me: new employee must change password", async () => {
  const { emp } = await setup();
  expect(await emp.query(api.self.me, {})).toEqual({ employeeId: "E001", name: "Juan Dela Cruz", mustChangePassword: true });
});

test("me: null for signed out, admin, inactive", async () => {
  const { t, admin, emp, deactivate } = await setup();
  expect(await t.query(api.self.me, {})).toBeNull();
  expect(await admin.query(api.self.me, {})).toBeNull();
  await deactivate();
  expect(await emp.query(api.self.me, {})).toBeNull();
});

test("monthly: blocked until password changed", async () => {
  const { emp } = await setup();
  await expect(emp.query(api.self.monthly, NOV)).rejects.toThrow("Password change required");
});

test("monthly: own month after change, without corrections", async () => {
  const { t, emp, userId, change } = await setup();
  await change("temp-pass-1", "new-pass-22");
  await t.run((ctx) =>
    ctx.db.insert("attendance", {
      userId, date: "2026-11-02", timeIn: manila("2026-11-02", "08:20"), timeOut: manila("2026-11-02", "17:00"),
      corrections: [{ field: "timeIn", from: 1, to: manila("2026-11-02", "08:20"), reason: "HR only", at: 2 }],
    }),
  );
  const dtr = await emp.query(api.self.monthly, NOV);
  const d = dtr.days.find((x) => x.date === "2026-11-02");
  expect([d.rendered, d.late, d.undertime, d.missing, d.status]).toEqual([460, 20, 0, 20, "Late"]);
  expect(dtr.totals).toEqual({ rendered: 460, required: 1920, missing: 1460, late: 20, undertime: 0, absences: 3 });
  expect(dtr.days.some((x) => "corrections" in x)).toBe(false);
  expect([dtr.employeeId, dtr.name]).toEqual(["E001", "Juan Dela Cruz"]);
});

test("monthly: month before hire is empty", async () => {
  const { emp, change } = await setup();
  await change("temp-pass-1", "new-pass-22");
  const dtr = await emp.query(api.self.monthly, { month: "2026-10", today: "2026-11-06" });
  expect(dtr.days).toHaveLength(31);
  expect(dtr.days.every((d) => d.status === "")).toBe(true);
  expect(dtr.totals).toEqual({ rendered: 0, required: 0, missing: 0, late: 0, undertime: 0, absences: 0 });
});

test("monthly: inactive, admin, signed out rejected", async () => {
  const { t, admin, emp, change, deactivate } = await setup();
  await change("temp-pass-1", "new-pass-22");
  await expect(t.query(api.self.monthly, NOV)).rejects.toThrow("Not authorized");
  await expect(admin.query(api.self.monthly, NOV)).rejects.toThrow("Not authorized");
  await deactivate(); // already signed in, then deactivated
  await expect(emp.query(api.self.monthly, NOV)).rejects.toThrow("Not authorized");
});

test("changePassword: new works, old does not", async () => {
  const { emp, change } = await setup();
  await change("temp-pass-1", "new-pass-22");
  expect((await emp.query(api.self.me, {})).mustChangePassword).toBe(false);
  await expect(change("temp-pass-1", "other-pass-1")).rejects.toThrow("Current password is incorrect");
  await change("new-pass-22", "new-pass-33");
});

test("changePassword: wrong current, short or same new rejected, flag unchanged", async () => {
  const { emp, change } = await setup();
  await expect(change("wrong-pass-0", "new-pass-22")).rejects.toThrow("Current password is incorrect");
  await expect(change("temp-pass-1", "short77")).rejects.toThrow("New password must be at least 8 characters");
  await expect(change("temp-pass-1", "temp-pass-1")).rejects.toThrow("New password must be different");
  expect((await emp.query(api.self.me, {})).mustChangePassword).toBe(true);
  await change("temp-pass-1", "new-pass-22"); // temp password still valid after the rejections
});

test("changePassword: admin and inactive rejected", async () => {
  const { admin, change, deactivate } = await setup();
  await expect(admin.action(api.self.changePassword, { current: "x", next: "new-pass-22" })).rejects.toThrow("Not authorized");
  await deactivate();
  await expect(change("temp-pass-1", "new-pass-22")).rejects.toThrow("Not authorized");
});

test("HR functions reject an employee session", async () => {
  const { emp, change } = await setup();
  await change("temp-pass-1", "new-pass-22");
  await expect(emp.query(api.attendance.monthly, { employeeId: "E002", ...NOV })).rejects.toThrow("Not authorized");
  await expect(
    emp.action(api.employees.create, { employeeId: "E003", name: "X", password: "temp-pass-1" }),
  ).rejects.toThrow("Not authorized");
});
