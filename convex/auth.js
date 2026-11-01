import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";

const password = Password({
  // Accounts are created only server-side (admin:create, employees:create).
  profile(params) {
    if (params.flow !== "signIn") throw new ConvexError("Sign-up disabled");
    return { email: String(params.username ?? "").trim() };
  },
});

// US-7: an inactive employee can't sign in. Runs after the password check, so it reveals nothing
// to someone without the password.
const checkPassword = password.authorize;
password.authorize = async (params, ctx) => {
  const result = await checkPassword(params, ctx);
  const user = await ctx.runQuery(internal.admin.getUser, { userId: result.userId });
  if (user?.role === "employee" && user.active !== true) throw new ConvexError("Account inactive");
  return result;
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({ providers: [password] });
