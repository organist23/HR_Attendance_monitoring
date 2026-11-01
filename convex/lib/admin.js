import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";

// Works in queries, mutations, and actions (actions have no ctx.db).
export async function requireAdmin(ctx) {
  const userId = await getAuthUserId(ctx);
  const user =
    userId &&
    (ctx.db ? await ctx.db.get(userId) : await ctx.runQuery(internal.admin.getUser, { userId }));
  if (user?.role !== "admin") throw new ConvexError("Not authorized");
  return userId;
}
