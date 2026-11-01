import { createAccount } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/admin";

export const byEmployeeId = internalQuery({
  args: { employeeId: v.string() },
  handler: (ctx, { employeeId }) =>
    ctx.db
      .query("users")
      .withIndex("by_employeeId", (q) => q.eq("employeeId", employeeId))
      .first(),
});

export const create = action({
  args: { employeeId: v.string(), name: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const employeeId = args.employeeId.trim();
    const name = args.name.trim();
    const { password } = args;
    if (!employeeId || !name || !password.trim()) {
      throw new ConvexError("Employee ID, name, and password are required");
    }
    // shortcut: concurrent create of the same ID gets createAccount's raw error, not the friendly one; fine with one HR user
    if (await ctx.runQuery(internal.employees.byEmployeeId, { employeeId })) {
      throw new ConvexError("Employee ID already exists");
    }
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: employeeId, secret: password },
      profile: { name, role: "employee", employeeId, active: true, searchText: `${employeeId} ${name}` },
    });
    return user._id;
  },
});

export const list = query({
  args: { search: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { search, paginationOpts }) => {
    await requireAdmin(ctx);
    const term = search.trim();
    const result = term
      ? await ctx.db
          .query("users")
          .withSearchIndex("search", (q) => q.search("searchText", term).eq("role", "employee"))
          .paginate(paginationOpts)
      : await ctx.db
          .query("users")
          .withIndex("by_employeeId")
          .filter((q) => q.eq(q.field("role"), "employee"))
          .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map(({ _id, employeeId, name, active }) => ({ _id, employeeId, name, active })),
    };
  },
});

export const setActive = mutation({
  args: { userId: v.id("users"), active: v.boolean() },
  handler: async (ctx, { userId, active }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (user?.role !== "employee") throw new ConvexError("Employee not found");
    await ctx.db.patch(userId, { active });
  },
});
