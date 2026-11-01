import { useAction } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { errorText } from "../hr/errors";

// US-7: shown until the temporary password is changed. Success flips `me.mustChangePassword`,
// and App moves on to the DTR by itself.
export default function ChangePassword({ logOut }) {
  const changePassword = useAction(api.self.changePassword);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    const current = form.get("current");
    const next = form.get("next");
    setError("");
    if (next !== form.get("confirm")) return setError("Passwords do not match");
    setPending(true);
    try {
      await changePassword({ current, next });
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <h1>Change your password</h1>
        <p>Your password is temporary. Choose a new one to continue.</p>
        <label>
          Current password
          <input name="current" type="password" autoComplete="current-password" autoFocus required disabled={pending} />
        </label>
        <label>
          New password
          <input name="next" type="password" autoComplete="new-password" required disabled={pending} />
        </label>
        <label>
          Confirm new password
          <input name="confirm" type="password" autoComplete="new-password" required disabled={pending} />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </button>
        {logOut}
      </form>
    </main>
  );
}
