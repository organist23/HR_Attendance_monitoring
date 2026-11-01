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

test("punch on a holiday rejected, no row", async () => {
  const { t, punch, rows } = await setup();
  await t.run((ctx) => ctx.db.insert("holidays", { date: "2026-11-02", name: "Test Day" }));
  at(MON_0805);
  await expect(punch()).rejects.toThrow("Not a workday");
  expect(await rows()).toHaveLength(0);
});

// Monthly DTR. Employee created Nov 1 Manila unless noted; month 2026-11, today Nov 6 (Fri).
const NOV1 = "2026-10-31T16:00:00Z";
const manila = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`);

async function monthSetup({ createdAt = NOV1, active = true } = {}) {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin", { email: "admin" });
  at(createdAt);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { role: "employee", employeeId: "E001", name: "Juan Dela Cruz", active }),
  );
  const punched = (date, inAt, outAt) =>
    t.run((ctx) =>
      ctx.db.insert("attendance", {
        userId, date, timeIn: manila(date, inAt), ...(outAt && { timeOut: manila(date, outAt) }),
      }),
    );
  const holiday = (date, name = "Holiday") => t.run((ctx) => ctx.db.insert("holidays", { date, name }));
  const monthly = (args = {}) =>
    as.query(api.attendance.monthly, { employeeId: "E001", month: "2026-11", today: "2026-11-06", ...args });
  return { t, punched, holiday, monthly };
}

const byDate = (dtr) => Object.fromEntries(dtr.days.map((d) => [d.date, d]));
const pick = (d) => [d.rendered, d.late, d.undertime, d.missing, d.status];

test("monthly: daily rows and totals", async () => {
  const { punched, monthly } = await monthSetup();
  await punched("2026-11-02", "08:20", "17:00");
  await punched("2026-11-03", "08:00", "16:00");
  const dtr = await monthly();
  expect([dtr.employeeId, dtr.name, dtr.days.length]).toEqual(["E001", "Juan Dela Cruz", 30]);
  const d = byDate(dtr);
  expect(pick(d["2026-11-02"])).toEqual([460, 20, 0, 20, "Late"]);
  expect(d["2026-11-02"].timeIn).toBe(manila("2026-11-02", "08:20"));
  expect(pick(d["2026-11-03"])).toEqual([420, 0, 60, 60, "Present"]);
  expect(pick(d["2026-11-04"])).toEqual([0, 0, 0, 480, "Absent"]);
  expect(pick(d["2026-11-05"])).toEqual([0, 0, 0, 480, "Absent"]);
  expect(pick(d["2026-11-06"])).toEqual([0, 0, 0, 0, ""]); // today, no punch yet
  expect(pick(d["2026-11-07"])).toEqual([0, 0, 0, 0, ""]); // Saturday
  expect(d["2026-11-07"].weekday).toBe(6);
  expect(pick(d["2026-11-09"])).toEqual([0, 0, 0, 0, ""]); // future
  expect(dtr.totals).toEqual({ rendered: 880, required: 1920, missing: 1040, late: 20, undertime: 60, absences: 2 });
});

test("monthly: holiday is not absent and adds no required hours", async () => {
  const { punched, holiday, monthly } = await monthSetup();
  await punched("2026-11-02", "08:20", "17:00");
  await punched("2026-11-03", "08:00", "16:00");
  await holiday("2026-11-04", "Founding Day");
  const dtr = await monthly();
  const d = byDate(dtr);
  expect([d["2026-11-04"].holiday, d["2026-11-04"].status]).toEqual(["Founding Day", ""]);
  expect([dtr.totals.required, dtr.totals.absences]).toEqual([1440, 1]);
});

test("monthly: holiday added after a punch keeps times but is not counted", async () => {
  const { punched, holiday, monthly } = await monthSetup();
  await punched("2026-11-02", "08:00", "17:00");
  await holiday("2026-11-02");
  const d = byDate(await monthly({ today: "2026-11-03" }));
  expect(d["2026-11-02"].timeIn).toBe(manila("2026-11-02", "08:00"));
  expect(d["2026-11-02"].timeOut).toBe(manila("2026-11-02", "17:00"));
  expect(pick(d["2026-11-02"])).toEqual([0, 0, 0, 0, ""]);
  expect((await monthly({ today: "2026-11-03" })).totals.required).toBe(0);
});

test("monthly: no absences before the employee was created", async () => {
  const { monthly } = await monthSetup({ createdAt: "2026-11-04T01:00:00Z" });
  const dtr = await monthly();
  const d = byDate(dtr);
  expect([d["2026-11-02"].status, d["2026-11-03"].status, d["2026-11-04"].status]).toEqual(["", "", "Absent"]);
  expect(dtr.totals.absences).toBe(2); // Nov 4 and Nov 5
});

test("monthly: inactive employee has no absences", async () => {
  const { monthly } = await monthSetup({ active: false });
  expect((await monthly()).totals).toEqual({ rendered: 0, required: 0, missing: 0, late: 0, undertime: 0, absences: 0 });
});

test("monthly: unknown employee returns null, admin username too", async () => {
  const { monthly } = await monthSetup();
  expect(await monthly({ employeeId: "E999" })).toBeNull();
  expect(await monthly({ employeeId: "admin" })).toBeNull();
});

test("monthly: invalid month rejected", async () => {
  const { monthly } = await monthSetup();
  await expect(monthly({ month: "2026-13" })).rejects.toThrow("Invalid month");
});

test("monthly: non-admin rejected", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "employee", { employeeId: "E002", active: true });
  await expect(
    as.query(api.attendance.monthly, { employeeId: "E002", month: "2026-11", today: "2026-11-06" }),
  ).rejects.toThrow("Not authorized");
});
