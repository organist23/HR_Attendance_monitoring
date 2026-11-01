import { getAuthUserId, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import { monthFor } from "./attendance";

// Employee-only functions (US-7, US-8). They act on the signed-in user and never take an
// employee ID, so an employee can't ask for anyone else's records.
const isActiveEmployee = (user) => user?.role === "employee" && user.active === true;

async function requireEmployee(ctx) {
  const userId = await getAuthUserId(ctx);
  const user = userId && (await ctx.db.get(userId));
  if (!isActiveEmployee(user)) throw new ConvexError("Not authorized");
  return user;
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId && (await ctx.db.get(userId));
    if (!isActiveEmployee(user)) return null;
    return { employeeId: user.employeeId, name: user.name, mustChangePassword: user.passwordChangedAt === undefined };
  },
});

// Same shape as attendance.monthly, minus corrections, which stay HR-only.
export const monthly = query({
  args: { month: v.string(), today: v.string() },
  handler: async (ctx, { month, today }) => {
    const user = await requireEmployee(ctx);
    if (user.passwordChangedAt === undefined) throw new ConvexError("Password change required");
    const dtr = await monthFor(ctx, user, month, today);
    return { ...dtr, days: dtr.days.map(({ corrections, ...day }) => day) };
  },
});

export const changePassword = action({
  args: { current: v.string(), next: v.string() },
  handler: async (ctx, { current, next }) => {
    const userId = await getAuthUserId(ctx);
    const user = userId && (await ctx.runQuery(internal.admin.getUser, { userId }));
    if (!isActiveEmployee(user)) throw new ConvexError("Not authorized");
    if (next.length < 8) throw new ConvexError("New password must be at least 8 characters");
    if (next === current) throw new ConvexError("New password must be different");
    const account = { id: user.employeeId, secret: current };
    const ok = await retrieveAccount(ctx, { provider: "password", account }).catch(() => null);
    if (!ok) throw new ConvexError("Current password is incorrect");
    await modifyAccountCredentials(ctx, { provider: "password", account: { id: user.employeeId, secret: next } });
    await ctx.runMutation(internal.self.markPasswordChanged, { userId });
    return null;
  },
});

export const markPasswordChanged = internalMutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.patch(userId, { passwordChangedAt: Date.now() }),
});
