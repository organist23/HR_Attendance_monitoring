import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/admin";
import { isWorkday, manilaDay } from "./lib/manila";

export const punch = mutation({
  args: { employeeId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const employee = await ctx.db
      .query("users")
      .withIndex("by_employeeId", (q) => q.eq("employeeId", args.employeeId.trim()))
      .first();
    if (employee?.role !== "employee") throw new ConvexError("Employee not found");
    if (!employee.active) throw new ConvexError("Employee inactive");

    const now = Date.now();
    const { date, weekday } = manilaDay(now);
    if (!isWorkday(weekday)) throw new ConvexError("Not a workday");

    const row = await ctx.db
      .query("attendance")
      .withIndex("by_user_date", (q) => q.eq("userId", employee._id).eq("date", date))
      .unique();
    if (!row) {
      await ctx.db.insert("attendance", { userId: employee._id, date, timeIn: now });
      return { action: "in", name: employee.name, at: now };
    }
    if (row.timeOut === undefined) {
      await ctx.db.patch(row._id, { timeOut: now });
      return { action: "out", name: employee.name, at: now };
    }
    throw new ConvexError("Already timed out");
  },
});

export const today = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const { date } = manilaDay(Date.now());
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    const list = await Promise.all(
      rows.map(async ({ userId, timeIn, timeOut }) => {
        const { employeeId, name } = await ctx.db.get(userId);
        return { employeeId, name, timeIn, timeOut, status: timeOut === undefined ? "Timed in" : "Timed out" };
      }),
    );
    return list.sort((a, b) => a.timeIn - b.timeIn);
  },
});
