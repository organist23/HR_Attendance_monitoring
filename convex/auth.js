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
// shortcut: the real authorize lives on `options` (internal in @convex-dev/auth 0.0.96); the E2E
// "inactive employee can't log in" test catches it if an upgrade moves it.
const checkPassword = password.options.authorize;
password.options.authorize = async (params, ctx) => {
  // The library locks an account after 10 failed attempts an hour; say so instead of "invalid".
  const result = await checkPassword(params, ctx).catch((err) => {
    throw /TooManyFailedAttempts/.test(err.message) ? new ConvexError("Too many attempts. Try again later.") : err;
  });
  const user = await ctx.runQuery(internal.admin.getUser, { userId: result.userId });
  if (user?.role === "employee" && user.active !== true) throw new ConvexError("Account inactive");
  return result;
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({ providers: [password] });
