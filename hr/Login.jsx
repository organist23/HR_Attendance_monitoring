import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export default function Login() {
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
    } catch {
      setError("Invalid username or password");
      setPending(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <h1>HR Attendance</h1>
        <label>
          Username
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
