import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { asRole, modules } from "../test/convexHelpers";

afterEach(() => {
  delete process.env.E2E_PURGE_ALLOWED;
});

async function seed() {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin");
  const testId = await as.action(api.employees.create, { employeeId: "E2E-1", name: "Test", password: "pass-0001" });
  const realId = await as.action(api.employees.create, { employeeId: "E001", name: "Real", password: "pass-0002" });
  await t.run(async (ctx) => {
    for (const userId of [testId, realId]) {
      await ctx.db.insert("attendance", { userId, date: "2026-11-02", timeIn: 1 });
      const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: 9e15 });
      await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: 9e15 });
    }
    await ctx.db.insert("holidays", { date: "2026-11-04", name: "E2E-Holiday" });
    await ctx.db.insert("holidays", { date: "2026-12-25", name: "Christmas" });
  });
  return { t, testId, realId };
}

const count = (t, table) => t.run(async (ctx) => (await ctx.db.query(table).collect()).length);

test("purge refuses when E2E_PURGE_ALLOWED is not set", async () => {
  const { t } = await seed();
  await expect(t.mutation(internal.e2e.purge, { prefix: "E2E-" })).rejects.toThrow(
    "E2E purge disabled on this deployment",
  );
  expect(await count(t, "attendance")).toBe(2);
});

test("purge refuses a prefix that does not start with E2E-", async () => {
  process.env.E2E_PURGE_ALLOWED = "true";
  const { t } = await seed();
  for (const prefix of ["", "E", "E0"]) {
    await expect(t.mutation(internal.e2e.purge, { prefix })).rejects.toThrow("Prefix must start with E2E-");
  }
  expect(await count(t, "attendance")).toBe(2);
});

test("purge deletes only E2E- employees and everything tied to them", async () => {
  process.env.E2E_PURGE_ALLOWED = "true";
  const { t, testId, realId } = await seed();
  expect(await t.mutation(internal.e2e.purge, { prefix: "E2E-" })).toEqual({
    users: 1, attendance: 1, accounts: 1, sessions: 1, refreshTokens: 1, holidays: 1,
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(testId)).toBeNull();
    expect(await ctx.db.get(realId)).not.toBeNull();
    const left = await ctx.db.query("attendance").collect();
    expect(left.map((r) => r.userId)).toEqual([realId]);
    const accounts = await ctx.db.query("authAccounts").collect();
    expect(accounts.map((a) => a.providerAccountId)).toEqual(["E001"]);
  });
  expect([await count(t, "authSessions"), await count(t, "authRefreshTokens")]).toEqual([1, 1]);
  expect(await count(t, "users")).toBe(2); // admin + E001
  const holidays = await t.run((ctx) => ctx.db.query("holidays").collect());
  expect(holidays.map((h) => h.name)).toEqual(["Christmas"]);
});

const seedArgs = (employeeId) => ({ employeeId, date: "2026-10-30", timeIn: 111 });

test("seedPunch refuses when E2E_PURGE_ALLOWED is not set", async () => {
  const { t } = await seed();
  await expect(t.mutation(internal.e2e.seedPunch, seedArgs("E2E-1"))).rejects.toThrow(
    "E2E purge disabled on this deployment",
  );
  expect(await count(t, "attendance")).toBe(2);
});

test("seedPunch refuses non-E2E employees", async () => {
  process.env.E2E_PURGE_ALLOWED = "true";
  const { t } = await seed();
  await expect(t.mutation(internal.e2e.seedPunch, seedArgs("E001"))).rejects.toThrow("Employee must start with E2E-");
  await expect(t.mutation(internal.e2e.seedPunch, seedArgs("E2E-404"))).rejects.toThrow("Employee not found");
  expect(await count(t, "attendance")).toBe(2);
});

test("seedPunch inserts a row for an E2E employee", async () => {
  process.env.E2E_PURGE_ALLOWED = "true";
  const { t, testId } = await seed();
  await t.mutation(internal.e2e.seedPunch, { ...seedArgs("E2E-1"), timeOut: 222 });
  const rows = await t.run((ctx) => ctx.db.query("attendance").withIndex("by_date", (q) => q.eq("date", "2026-10-30")).collect());
  expect(rows.map(({ userId, timeIn, timeOut }) => ({ userId, timeIn, timeOut }))).toEqual([
    { userId: testId, timeIn: 111, timeOut: 222 },
  ]);
});
