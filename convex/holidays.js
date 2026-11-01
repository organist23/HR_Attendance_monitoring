import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/admin";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("holidays").withIndex("by_date").collect();
    return rows.map(({ _id, date, name }) => ({ _id, date, name }));
  },
});

export const add = mutation({
  args: { date: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const date = args.date.trim();
    const name = args.name.trim();
    // Round-trip through Date rejects impossible dates like 2026-02-30.
    const ms = Date.parse(`${date}T00:00:00Z`);
    const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(date);
    if (!real || !name) throw new ConvexError("Holiday date and name are required");
    const existing = await ctx.db
      .query("holidays")
      .withIndex("by_date", (q) => q.eq("date", date))
      .first();
    if (existing) throw new ConvexError("Date is already a holiday");
    return await ctx.db.insert("holidays", { date, name });
  },
});

export const remove = mutation({
  args: { holidayId: v.id("holidays") },
  handler: async (ctx, { holidayId }) => {
    await requireAdmin(ctx);
    // Already gone (double-click on Remove) is fine.
    if (await ctx.db.get(holidayId)) await ctx.db.delete(holidayId);
  },
});
