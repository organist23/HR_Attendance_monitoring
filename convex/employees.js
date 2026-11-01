import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/admin";

export const list = query({
  args: { search: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    return ctx.db
      .query("users")
      .withIndex("by_employeeId")
      .filter((q) => q.eq(q.field("role"), "employee"))
      .paginate(paginationOpts);
  },
});
