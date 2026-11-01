import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asRole, modules } from "../test/convexHelpers";

async function setup() {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin", { email: "admin" });
  const add = (date, name = "Founding Day") => as.mutation(api.holidays.add, { date, name });
  const list = () => as.query(api.holidays.list, {});
  return { t, as, add, list };
}

const strip = (rows) => rows.map(({ date, name }) => ({ date, name }));

test("add then list, sorted by date, name trimmed", async () => {
  const { add, list } = await setup();
  await add("2026-12-25", "Christmas");
  await add("2026-11-04", "  Founding Day ");
  expect(strip(await list())).toEqual([
    { date: "2026-11-04", name: "Founding Day" },
    { date: "2026-12-25", name: "Christmas" },
  ]);
});

test("duplicate date rejected, still one row", async () => {
  const { add, list } = await setup();
  await add("2026-11-04");
  await expect(add("2026-11-04", "Other")).rejects.toThrow("Date is already a holiday");
  expect(await list()).toHaveLength(1);
});

test("blank name, blank date, or malformed date rejected", async () => {
  const { add, list } = await setup();
  for (const [date, name] of [["2026-11-04", "  "], ["", "X"], ["2026/11/04", "X"], ["2026-02-30", "X"], ["2026-13-01", "X"]]) {
    await expect(add(date, name)).rejects.toThrow("Holiday date and name are required");
  }
  expect(await list()).toHaveLength(0);
});

test("remove makes the date a workday again; second remove is a no-op", async () => {
  const { t, as, add, list } = await setup();
  await t.run((ctx) => ctx.db.insert("users", { role: "employee", employeeId: "E001", name: "Juan", active: true }));
  const holidayId = await add("2026-11-04");
  const monthly = () => as.query(api.attendance.monthly, { employeeId: "E001", month: "2026-11", today: "2026-11-05" });
  const nov4 = async () => (await monthly()).days[3];
  expect((await nov4()).holiday).toBe("Founding Day");
  await as.mutation(api.holidays.remove, { holidayId });
  await as.mutation(api.holidays.remove, { holidayId });
  expect(await list()).toEqual([]);
  expect((await nov4()).holiday).toBeUndefined();
});

test("non-admin rejected by list, add, remove", async () => {
  const { t, add } = await setup();
  const holidayId = await add("2026-11-04");
  const { as } = await asRole(t, "employee", { employeeId: "E002", active: true });
  await expect(as.query(api.holidays.list, {})).rejects.toThrow("Not authorized");
  await expect(as.mutation(api.holidays.add, { date: "2026-11-05", name: "X" })).rejects.toThrow("Not authorized");
  await expect(as.mutation(api.holidays.remove, { holidayId })).rejects.toThrow("Not authorized");
});
