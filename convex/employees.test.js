import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { asRole, modules, page1 } from "../test/convexHelpers";

const juan = { employeeId: "E001", name: "Juan Dela Cruz", password: "temp-pass-1" };
const list = (as, search = "", paginationOpts = page1) =>
  as.query(api.employees.list, { search, paginationOpts });
const employeeRows = (t) =>
  t.run((ctx) =>
    ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "employee"))
      .collect(),
  );

async function setup() {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin");
  return { t, as };
}

test("create then list shows E001 Juan Dela Cruz active", async () => {
  const { as } = await setup();
  await as.action(api.employees.create, juan);
  const { page } = await list(as);
  expect(page.map(({ employeeId, name, active }) => ({ employeeId, name, active }))).toEqual([
    { employeeId: "E001", name: "Juan Dela Cruz", active: true },
  ]);
});

test("create trims ID and name", async () => {
  const { as } = await setup();
  await as.action(api.employees.create, { ...juan, employeeId: " E001 ", name: " Juan Dela Cruz " });
  const { page } = await list(as);
  expect([page[0].employeeId, page[0].name]).toEqual(["E001", "Juan Dela Cruz"]);
});

test("duplicate ID rejected and only one row exists", async () => {
  const { t, as } = await setup();
  await as.action(api.employees.create, juan);
  await expect(
    as.action(api.employees.create, { ...juan, name: "Someone Else", password: "other-pass" }),
  ).rejects.toThrow("Employee ID already exists");
  expect(await employeeRows(t)).toHaveLength(1);
});

test("blank fields rejected, nothing created", async () => {
  const { t, as } = await setup();
  for (const bad of [{ ...juan, name: "" }, { ...juan, employeeId: "   " }, { ...juan, password: "" }]) {
    await expect(as.action(api.employees.create, bad)).rejects.toThrow(
      "Employee ID, name, and password are required",
    );
  }
  expect(await employeeRows(t)).toHaveLength(0);
});

test("setActive false shows inactive", async () => {
  const { as } = await setup();
  const userId = await as.action(api.employees.create, juan);
  await as.mutation(api.employees.setActive, { userId, active: false });
  const { page } = await list(as);
  expect(page[0].active).toBe(false);
});

test("setActive refuses the admin account", async () => {
  const t = convexTest(schema, modules);
  const { userId, as } = await asRole(t, "admin");
  await expect(as.mutation(api.employees.setActive, { userId, active: false })).rejects.toThrow(
    "Employee not found",
  );
});

test("search Juan returns only matching", async () => {
  const { as } = await setup();
  await as.action(api.employees.create, juan);
  await as.action(api.employees.create, { employeeId: "E002", name: "Maria Santos", password: "p" });
  expect((await list(as, "Juan")).page.map((e) => e.employeeId)).toEqual(["E001"]);
  expect((await list(as, "E002")).page.map((e) => e.employeeId)).toEqual(["E002"]);
});

test("list paginates 25 then 5", async () => {
  const { t, as } = await setup();
  await t.run(async (ctx) => {
    for (let i = 1; i <= 30; i++) {
      const employeeId = `E${String(i).padStart(3, "0")}`;
      await ctx.db.insert("users", {
        role: "employee", employeeId, name: `Emp ${i}`, active: true, searchText: `${employeeId} Emp ${i}`,
      });
    }
  });
  const first = await list(as);
  expect([first.page.length, first.isDone, first.page[0].employeeId]).toEqual([25, false, "E001"]);
  const second = await list(as, "", { numItems: 25, cursor: first.continueCursor });
  expect(second.page.length).toBe(5);
});

test("non-admin is rejected by create, list, setActive", async () => {
  const t = convexTest(schema, modules);
  const { userId, as } = await asRole(t, "employee", { employeeId: "E009", active: true });
  await expect(as.action(api.employees.create, juan)).rejects.toThrow("Not authorized");
  await expect(list(as)).rejects.toThrow("Not authorized");
  await expect(as.mutation(api.employees.setActive, { userId, active: false })).rejects.toThrow(
    "Not authorized",
  );
});

test("employee ID equal to the admin username is rejected (same or different password)", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.admin.create, { username: "boss", password: "admin-pass" });
  const { as } = await asRole(t, "admin");
  for (const password of ["admin-pass", "other-pass"]) {
    await expect(
      as.action(api.employees.create, { employeeId: "boss", name: "Fake", password }),
    ).rejects.toThrow("Employee ID already exists");
  }
  expect(await employeeRows(t)).toHaveLength(0);
});
