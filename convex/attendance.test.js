import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asRole, modules } from "../test/convexHelpers";

const MON_0805 = "2026-11-02T00:05:00Z"; // Monday 08:05 Manila
const MON_1700 = "2026-11-02T09:00:00Z"; // Monday 17:00 Manila

// Fixtures are created before at(), so pin the clock before every test date. On the real clock they broke once today reached 2026-11-02.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
});
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
  return { t, as, userId, punched, holiday, monthly };
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
  // Creation day has no punch: not Absent, the employee may not have started yet.
  expect([d["2026-11-03"].status, d["2026-11-04"].status, d["2026-11-05"].status]).toEqual(["", "", "Absent"]);
  expect(dtr.totals.absences).toBe(1);
});

test("monthly: creation day with a punch counts", async () => {
  const { punched, monthly } = await monthSetup({ createdAt: "2026-11-04T01:00:00Z" });
  await punched("2026-11-04", "09:30", "17:00");
  const d = byDate(await monthly());
  expect(pick(d["2026-11-04"])).toEqual([390, 90, 0, 90, "Late"]);
});

test("monthly: deactivation keeps absences before it, none after", async () => {
  const { as, userId, monthly } = await monthSetup();
  at("2026-11-05T02:00:00Z"); // Thu Nov 5 10:00 Manila
  await as.mutation(api.employees.setActive, { userId, active: false });
  const dtr = await monthly({ today: "2026-11-10" });
  const d = byDate(dtr);
  expect(["02", "03", "04", "05", "06", "09"].map((n) => d[`2026-11-${n}`].status)).toEqual([
    "Absent", "Absent", "Absent", "", "", "",
  ]);
  expect([dtr.totals.absences, dtr.totals.required]).toEqual([3, 1440]);
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

// Corrections (US-6). Same month setup; now is Fri Nov 6 10:00 Manila.
const NOW = "2026-11-06T02:00:00Z";

async function correctSetup(opts) {
  const s = await monthSetup(opts);
  at(NOW);
  const correct = (args) => s.as.mutation(api.attendance.correct, { employeeId: "E001", reason: "Forgot", ...args });
  const day = async (date) => byDate(await s.monthly())[date];
  const rows = () => s.t.run((ctx) => ctx.db.query("attendance").collect());
  return { ...s, correct, day, rows };
}

test("correct: time-out edit recomputes and logs", async () => {
  const { punched, correct, day } = await correctSetup();
  await punched("2026-11-03", "08:00", "16:00");
  await correct({ date: "2026-11-03", timeOut: "17:00" });
  const d = await day("2026-11-03");
  expect(pick(d)).toEqual([480, 0, 0, 0, "Present"]);
  expect(d.timeOut).toBe(manila("2026-11-03", "17:00"));
  expect(d.corrections).toEqual([
    { field: "timeOut", from: manila("2026-11-03", "16:00"), to: manila("2026-11-03", "17:00"), reason: "Forgot", at: Date.parse(NOW) },
  ]);
});

test("correct: time-in edit clears lateness", async () => {
  const { punched, correct, day } = await correctSetup();
  await punched("2026-11-03", "08:20", "17:00");
  await correct({ date: "2026-11-03", timeIn: "08:00" });
  expect(pick(await day("2026-11-03"))).toEqual([480, 0, 0, 0, "Present"]);
});

test("correct: adds missing time-out to Incomplete day", async () => {
  const { punched, correct, day } = await correctSetup();
  await punched("2026-11-03", "08:00");
  expect((await day("2026-11-03")).status).toBe("Incomplete");
  await correct({ date: "2026-11-03", timeOut: "17:00" });
  const d = await day("2026-11-03");
  expect(pick(d)).toEqual([480, 0, 0, 0, "Present"]);
  expect(d.corrections).toEqual([{ field: "timeOut", to: manila("2026-11-03", "17:00"), reason: "Forgot", at: Date.parse(NOW) }]);
});

test("correct: Absent day gets a record", async () => {
  const { correct, monthly } = await correctSetup();
  expect((await monthly()).totals.absences).toBe(4); // Nov 2 to 5
  await correct({ date: "2026-11-04", timeIn: "08:00", timeOut: "17:00" });
  const dtr = await monthly();
  const d = byDate(dtr)["2026-11-04"];
  expect(pick(d)).toEqual([480, 0, 0, 0, "Present"]);
  expect(d.corrections).toEqual([
    { field: "timeIn", to: manila("2026-11-04", "08:00"), reason: "Forgot", at: Date.parse(NOW) },
    { field: "timeOut", to: manila("2026-11-04", "17:00"), reason: "Forgot", at: Date.parse(NOW) },
  ]);
  expect(dtr.totals.absences).toBe(3);
});

test("correct: second correction appends", async () => {
  const { punched, correct, day } = await correctSetup();
  await punched("2026-11-03", "08:00", "16:00");
  await correct({ date: "2026-11-03", timeOut: "16:30", reason: "First" });
  await correct({ date: "2026-11-03", timeOut: "17:00", reason: "Second" });
  const d = await day("2026-11-03");
  expect(d.corrections.map((c) => [c.reason, c.from, c.to])).toEqual([
    ["First", manila("2026-11-03", "16:00"), manila("2026-11-03", "16:30")],
    ["Second", manila("2026-11-03", "16:30"), manila("2026-11-03", "17:00")],
  ]);
});

test("correct: reason trimmed; blank or too long rejected, nothing changes", async () => {
  const { punched, correct, day } = await correctSetup();
  await punched("2026-11-03", "08:00", "16:00");
  await expect(correct({ date: "2026-11-03", timeOut: "17:00", reason: "  " })).rejects.toThrow("Reason is required");
  await expect(correct({ date: "2026-11-03", timeOut: "17:00", reason: "x".repeat(501) })).rejects.toThrow("Reason is too long");
  let d = await day("2026-11-03");
  expect([d.timeOut, d.corrections]).toEqual([manila("2026-11-03", "16:00"), []]);
  await correct({ date: "2026-11-03", timeOut: "17:00", reason: " Typo " });
  d = await day("2026-11-03");
  expect(d.corrections[0].reason).toBe("Typo");
});

test("correct: time-out not after time-in rejected, row unchanged", async () => {
  const { punched, correct, rows } = await correctSetup();
  await punched("2026-11-03", "08:00", "17:00");
  const before = await rows();
  for (const args of [{ timeOut: "07:59" }, { timeOut: "08:00" }, { timeIn: "17:00" }]) {
    await expect(correct({ date: "2026-11-03", ...args })).rejects.toThrow("Time-out must be after time-in");
  }
  expect(await rows()).toEqual(before);
});

test("correct: time-out only on Absent day rejected, no row", async () => {
  const { correct, rows } = await correctSetup();
  await expect(correct({ date: "2026-11-04", timeOut: "17:00" })).rejects.toThrow("Time-in is required");
  expect(await rows()).toHaveLength(0);
});

test("correct: new record on weekend or holiday rejected", async () => {
  const { holiday, correct, rows } = await correctSetup();
  await holiday("2026-11-04");
  await expect(correct({ date: "2026-10-31", timeIn: "08:00" })).rejects.toThrow("Not a workday"); // Saturday
  await expect(correct({ date: "2026-11-04", timeIn: "08:00" })).rejects.toThrow("Not a workday");
  expect(await rows()).toHaveLength(0);
});

test("correct: existing row on a later holiday can be corrected", async () => {
  const { punched, holiday, correct, rows } = await correctSetup();
  await punched("2026-11-04", "08:00", "16:00");
  await holiday("2026-11-04");
  await correct({ date: "2026-11-04", timeOut: "17:00" });
  expect((await rows())[0].timeOut).toBe(manila("2026-11-04", "17:00"));
});

test("correct: future time rejected", async () => {
  const { correct, rows } = await correctSetup();
  await expect(correct({ date: "2026-11-06", timeIn: "08:00", timeOut: "17:00" })).rejects.toThrow("Time is in the future");
  await expect(correct({ date: "2026-11-09", timeIn: "08:00" })).rejects.toThrow("Time is in the future");
  expect(await rows()).toHaveLength(0);
  await correct({ date: "2026-11-06", timeIn: "08:00" }); // 08:00 today is past at 10:00
  expect(await rows()).toHaveLength(1);
});

test("correct: invalid date or time rejected", async () => {
  const { correct, rows } = await correctSetup();
  await expect(correct({ date: "2026-02-30", timeIn: "08:00" })).rejects.toThrow("Invalid date");
  await expect(correct({ date: "2026-11-3", timeIn: "08:00" })).rejects.toThrow("Invalid date");
  for (const timeIn of ["25:00", "8:00", "08:60", ""]) {
    await expect(correct({ date: "2026-11-03", timeIn })).rejects.toThrow("Invalid time");
  }
  expect(await rows()).toHaveLength(0);
});

test("correct: unchanged or empty call rejected", async () => {
  const { punched, correct, day } = await correctSetup();
  await punched("2026-11-03", "08:00", "17:00");
  await expect(correct({ date: "2026-11-03" })).rejects.toThrow("Nothing to change");
  await expect(correct({ date: "2026-11-03", timeOut: "17:00" })).rejects.toThrow("Nothing to change");
  expect((await day("2026-11-03")).corrections).toEqual([]);
});

test("correct: same minute as a punch with seconds is unchanged", async () => {
  const { t, userId, correct, rows } = await correctSetup();
  const timeIn = manila("2026-11-03", "08:00") + 45_000; // 08:00:45
  await t.run((ctx) => ctx.db.insert("attendance", { userId, date: "2026-11-03", timeIn }));
  await expect(correct({ date: "2026-11-03", timeIn: "08:00" })).rejects.toThrow("Nothing to change");
  await correct({ date: "2026-11-03", timeIn: "08:00", timeOut: "17:00" });
  const [row] = await rows();
  expect([row.timeIn, row.corrections.map((c) => c.field)]).toEqual([timeIn, ["timeOut"]]);
});

test("correct: unknown employee and non-admin rejected", async () => {
  const { correct } = await correctSetup();
  await expect(correct({ employeeId: "E999", date: "2026-11-03", timeIn: "08:00" })).rejects.toThrow("Employee not found");
  await expect(correct({ employeeId: "admin", date: "2026-11-03", timeIn: "08:00" })).rejects.toThrow("Employee not found");
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "employee", { employeeId: "E002", active: true });
  await expect(
    as.mutation(api.attendance.correct, { employeeId: "E002", date: "2026-11-03", timeIn: "08:00", reason: "x" }),
  ).rejects.toThrow("Not authorized");
});

test("correct: inactive employee can be corrected", async () => {
  const { punched, correct, rows } = await correctSetup({ active: false });
  await punched("2026-11-03", "08:00", "16:00");
  await correct({ date: "2026-11-03", timeOut: "17:00" });
  expect((await rows())[0].timeOut).toBe(manila("2026-11-03", "17:00"));
});

// US-9: a month with nothing counted yet is empty, not an error or made-up rows.
test("monthly: future month and month before hire are empty", async () => {
  const { monthly } = await monthSetup();
  for (const month of ["2026-12", "2026-10"]) {
    const dtr = await monthly({ month });
    expect(dtr.days).toHaveLength(31);
    expect(dtr.days.every((d) => d.status === "")).toBe(true);
    expect(dtr.totals).toEqual({ rendered: 0, required: 0, missing: 0, late: 0, undertime: 0, absences: 0 });
  }
});

// US-10. Same employee and month as "monthly: daily rows and totals".
const HEADER = "Employee ID,Name,Rendered (min),Required (min),Missing (min),Late (min),Undertime (min),Absences\r\n";

async function csvSetup() {
  const s = await monthSetup();
  const employee = (employeeId, fields = {}) =>
    s.t.run((ctx) => ctx.db.insert("users", { role: "employee", employeeId, name: `Name ${employeeId}`, active: true, ...fields }));
  const punchedBy = (userId, date, inAt, outAt) =>
    s.t.run((ctx) => ctx.db.insert("attendance", { userId, date, timeIn: manila(date, inAt), timeOut: manila(date, outAt) }));
  const csv = (args = {}) => s.as.query(api.attendance.monthlyCsv, { month: "2026-11", today: "2026-11-06", ...args });
  return { ...s, employee, punchedBy, csv };
}

test("monthlyCsv: one row per employee with monthly totals", async () => {
  const { punched, csv } = await csvSetup();
  await punched("2026-11-02", "08:20", "17:00");
  await punched("2026-11-03", "08:00", "16:00");
  expect(await csv()).toEqual({ count: 1, csv: HEADER + "E001,Juan Dela Cruz,880,1920,1040,20,60,2\r\n" });
});

test("monthlyCsv: inactive employees only with records in the month", async () => {
  const { employee, punchedBy, csv } = await csvSetup();
  const e2 = await employee("E002", { active: false });
  await punchedBy(e2, "2026-11-02", "08:00", "17:00");
  await employee("E003", { active: false });
  const e4 = await employee("E004", { active: false });
  await punchedBy(e4, "2026-10-30", "08:00", "17:00");
  const { count, csv: text } = await csv();
  expect(count).toBe(2);
  expect(text.split("\r\n").slice(1, 3)).toEqual(["E001,Juan Dela Cruz,0,1920,1920,0,0,4", "E002,Name E002,480,480,0,0,0,0"]);
});

test("monthlyCsv: sorted by ID, admin excluded", async () => {
  const { employee, csv } = await csvSetup();
  await employee("E010");
  await employee("E002");
  const ids = (await csv()).csv.split("\r\n").slice(1, -1).map((line) => line.split(",")[0]);
  expect(ids).toEqual(["E001", "E002", "E010"]);
});

test("monthlyCsv: quotes and formula guard", async () => {
  const { employee, csv } = await csvSetup();
  await employee("E002", { name: 'Dela Cruz, Juan "JJ"' });
  await employee("E003", { name: '=HYPERLINK("x")' });
  await employee("E004", { name: "Line\nBreak" });
  await employee("E005", { name: "Ñoño" });
  await employee("-E006", { name: "+1" });
  const text = (await csv()).csv;
  expect(text).toContain('\r\nE002,"Dela Cruz, Juan ""JJ""",');
  expect(text).toContain(`\r\nE003,"'=HYPERLINK(""x"")",`);
  expect(text).toContain('\r\nE004,"Line\nBreak",');
  expect(text).toContain("\r\nE005,Ñoño,");
  expect(text).toContain("\r\n'-E006,'+1,");
});

test("monthlyCsv: no employees gives header only", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin", { email: "admin" });
  expect(await as.query(api.attendance.monthlyCsv, { month: "2026-11", today: "2026-11-06" })).toEqual({ count: 0, csv: HEADER });
});

test("monthlyCsv: invalid month rejected with no employees", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin", { email: "admin" });
  await expect(as.query(api.attendance.monthlyCsv, { month: "2026-13", today: "2026-11-06" })).rejects.toThrow("Invalid month");
});

test("monthlyCsv: non-admin rejected", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "employee", { employeeId: "E002", active: true });
  await expect(as.query(api.attendance.monthlyCsv, { month: "2026-11", today: "2026-11-06" })).rejects.toThrow("Not authorized");
});

test("monthlyCsv: deactivated mid-month with only absences is included", async () => {
  const { employee, csv } = await csvSetup();
  await employee("E002", { active: false, deactivatedOn: "2026-11-05" });
  // Counted Nov 2-4 (created Nov 1, deactivated Nov 5): 3 absences, 1440 required.
  expect((await csv()).csv).toContain("\r\nE002,Name E002,0,1440,1440,0,0,3\r\n");
});
