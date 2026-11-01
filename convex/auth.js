import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Accounts are created only server-side (admin:create, employees:create).
      profile(params) {
        if (params.flow !== "signIn") throw new ConvexError("Sign-up disabled");
        return { email: String(params.username ?? "") };
      },
    }),
  ],
});
