import { createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

export const getUser = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.get(userId),
});

export const findAdmin = internalQuery({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first(),
});

// Run once from the CLI: npx convex run admin:create '{"username":"...","password":"..."}'
export const create = internalAction({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    if (await ctx.runQuery(internal.admin.findAdmin)) throw new ConvexError("Admin already exists");
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: username, secret: password },
      profile: { name: "HR Admin", role: "admin" },
    });
    return user._id;
  },
});
