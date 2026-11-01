import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { useState } from "react";

// Shared by the HR app and the employee web app (web/).
export default function Login({ title = "HR Attendance", userLabel = "Username" }) {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      await signIn("password", {
        username: form.get("username"),
        password: form.get("password"),
        flow: "signIn",
      });
    } catch (err) {
      // Server rules (e.g. "Account inactive") come as ConvexError; a wrong password does not.
      setError(err instanceof ConvexError ? err.data : `Invalid ${userLabel.toLowerCase()} or password`);
      setPending(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <h1>{title}</h1>
        <label>
          {userLabel}
          <input name="username" autoComplete="username" autoFocus required disabled={pending} />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required disabled={pending} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
