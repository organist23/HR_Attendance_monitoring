import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asRole, modules } from "../test/convexHelpers";

const MON_0805 = "2026-11-02T00:05:00Z"; // Monday 08:05 Manila
const MON_1700 = "2026-11-02T09:00:00Z"; // Monday 17:00 Manila

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const at = (iso) => vi.setSystemTime(new Date(iso));

async function setup(employee = {}) {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin", { email: "admin" });
  await t.run((ctx) =>
    ctx.db.insert("users", {
      role: "employee", employeeId: "E001", name: "Juan Dela Cruz", active: true,
      searchText: "E001 Juan Dela Cruz", ...employee,
    }),
  );
  const punch = (employeeId = "E001") => as.mutation(api.attendance.punch, { employeeId });
  const today = (date = "2026-11-02") => as.query(api.attendance.today, { date });
  const rows = () => t.run((ctx) => ctx.db.query("attendance").collect());
  return { t, punch, today, rows };
}

test("first punch saves time-in at server time", async () => {
  const { punch, today } = await setup();
  at(MON_0805);
  expect(await punch()).toEqual({ action: "in", name: "Juan Dela Cruz", at: Date.parse(MON_0805) });
  expect(await today()).toEqual([
    { employeeId: "E001", name: "Juan Dela Cruz", timeIn: Date.parse(MON_0805), status: "Timed in" },
  ]);
});

test("second punch saves time-out", async () => {
  const { punch, today } = await setup();
  at(MON_0805);
  await punch();
  at(MON_1700);
  expect((await punch()).action).toBe("out");
  const [row] = await today();
  expect([row.timeOut, row.status]).toEqual([Date.parse(MON_1700), "Timed out"]);
});

test("third punch rejected, still one row", async () => {
  const { punch, rows } = await setup();
  at(MON_0805);
  await punch();
  await punch();
  await expect(punch()).rejects.toThrow("Already timed out");
  expect(await rows()).toHaveLength(1);
});

test("employee ID with surrounding spaces matches", async () => {
  const { punch } = await setup();
  at(MON_0805);
  expect((await punch(" E001 ")).action).toBe("in");
});

test("unknown ID rejected", async () => {
  const { punch, rows } = await setup();
  at(MON_0805);
  await expect(punch("E999")).rejects.toThrow("Employee not found");
  expect(await rows()).toHaveLength(0);
});

test("admin username is not an employee", async () => {
  const { punch } = await setup();
  at(MON_0805);
  await expect(punch("admin")).rejects.toThrow("Employee not found");
});

test("inactive employee rejected, no row", async () => {
  const { punch, rows } = await setup({ active: false });
  at(MON_0805);
  await expect(punch()).rejects.toThrow("Employee inactive");
  expect(await rows()).toHaveLength(0);
});

test("Saturday rejected", async () => {
  const { punch, rows } = await setup();
  at("2026-11-07T02:00:00Z");
  await expect(punch()).rejects.toThrow("Not a workday");
  expect(await rows()).toHaveLength(0);
});

test("Monday 07:30 Manila (Sunday UTC) is dated Monday", async () => {
  const { punch, rows } = await setup();
  at("2026-11-01T23:30:00Z");
  await punch();
  expect((await rows())[0].date).toBe("2026-11-02");
});

test("today returns only the requested date", async () => {
  const { punch, today } = await setup();
  at(MON_0805);
  await punch();
  expect(await today("2026-11-03")).toEqual([]);
});

test("non-admin rejected by punch and today", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "employee", { employeeId: "E002", active: true });
  at(MON_0805);
  await expect(as.mutation(api.attendance.punch, { employeeId: "E002" })).rejects.toThrow("Not authorized");
  await expect(as.query(api.attendance.today, { date: "2026-11-02" })).rejects.toThrow("Not authorized");
});

test("today skips a row whose employee was deleted", async () => {
  const { t, punch, today } = await setup();
  at(MON_0805);
  await punch();
  await t.run(async (ctx) => {
    const ghost = await ctx.db.insert("users", { role: "employee", employeeId: "E404", name: "Gone", active: true });
    await ctx.db.insert("attendance", { userId: ghost, date: "2026-11-02", timeIn: 1 });
    await ctx.db.delete(ghost);
  });
  expect((await today()).map((r) => r.employeeId)).toEqual(["E001"]);
});
