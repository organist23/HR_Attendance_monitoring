import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { asRole, modules, page1 } from "../test/convexHelpers";

test("create admin then second create rejects", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.admin.create, { username: "admin", password: "secret-123" });
  await expect(
    t.action(internal.admin.create, { username: "admin2", password: "secret-456" }),
  ).rejects.toThrow("Admin already exists");
  const admins = await t.run((ctx) => ctx.db.query("users").collect());
  expect(admins.map((u) => u.role)).toEqual(["admin"]);
});

test("requireAdmin rejects unauthenticated", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.employees.list, { search: "", paginationOpts: page1 })).rejects.toThrow(
    "Not authorized",
  );
});

test("requireAdmin rejects role employee", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "employee");
  await expect(as.query(api.employees.list, { search: "", paginationOpts: page1 })).rejects.toThrow(
    "Not authorized",
  );
});

test("requireAdmin accepts role admin", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asRole(t, "admin");
  const result = await as.query(api.employees.list, { search: "", paginationOpts: page1 });
  expect(result.page).toEqual([]);
});

test("sign-up flow rejected", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signUp", username: "intruder", password: "long-password-1" },
    }),
  ).rejects.toThrow("Sign-up disabled");
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
});

test("isAdmin is true for admin, false for employee and anonymous", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.admin.isAdmin, {})).toBe(false);
  expect(await (await asRole(t, "employee")).as.query(api.admin.isAdmin, {})).toBe(false);
  expect(await (await asRole(t, "admin")).as.query(api.admin.isAdmin, {})).toBe(true);
});
