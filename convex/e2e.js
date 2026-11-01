import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// E2E setup: a punch on a past date, which the UI cannot make. Same gate as purge.
export const seedPunch = internalMutation({
  args: { employeeId: v.string(), date: v.string(), timeIn: v.number(), timeOut: v.optional(v.number()) },
  handler: async (ctx, { employeeId, ...row }) => {
    if (process.env.E2E_PURGE_ALLOWED !== "true") throw new Error("E2E purge disabled on this deployment");
    if (!employeeId.startsWith("E2E-")) throw new Error("Employee must start with E2E-");
    const user = await ctx.db
      .query("users")
      .withIndex("by_employeeId", (q) => q.eq("employeeId", employeeId))
      .first();
    if (user?.role !== "employee") throw new Error("Employee not found");
    await ctx.db.insert("attendance", { userId: user._id, ...row });
  },
});

// Teardown for E2E passes (see .claude/skills/e2e-testing). Internal only, and refuses to run
// unless the deployment has E2E_PURGE_ALLOWED=true, which only throwaway test projects set.
export const purge = internalMutation({
  args: { prefix: v.string() },
  handler: async (ctx, { prefix }) => {
    if (process.env.E2E_PURGE_ALLOWED !== "true") throw new Error("E2E purge disabled on this deployment");
    if (!prefix.startsWith("E2E-")) throw new Error("Prefix must start with E2E-");

    const counts = { users: 0, attendance: 0, accounts: 0, sessions: 0, refreshTokens: 0, holidays: 0 };
    const users = await ctx.db
      .query("users")
      .withIndex("by_employeeId", (q) => q.gte("employeeId", prefix).lt("employeeId", `${prefix}￿`))
      .collect();
    for (const user of users) {
      if (user.role !== "employee") continue;
      const del = async (rows, key) => {
        for (const row of rows) await ctx.db.delete(row._id);
        counts[key] += rows.length;
      };
      const byUser = (table, index) =>
        ctx.db
          .query(table)
          .withIndex(index, (q) => q.eq("userId", user._id))
          .collect();
      await del(await byUser("attendance", "by_user_date"), "attendance");
      await del(await byUser("authAccounts", "userIdAndProvider"), "accounts");
      const sessions = await byUser("authSessions", "userId");
      for (const session of sessions) {
        await del(
          await ctx.db
            .query("authRefreshTokens")
            .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
            .collect(),
          "refreshTokens",
        );
      }
      await del(sessions, "sessions");
      await ctx.db.delete(user._id);
      counts.users += 1;
    }
    for (const holiday of await ctx.db.query("holidays").collect()) {
      if (!holiday.name.startsWith(prefix)) continue;
      await ctx.db.delete(holiday._id);
      counts.holidays += 1;
    }
    return counts;
  },
});
