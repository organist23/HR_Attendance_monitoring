import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Login from "../hr/Login";
import ChangePassword from "./ChangePassword";
import MyDtr from "./MyDtr";

export default function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const me = useQuery(api.self.me, isAuthenticated ? {} : "skip");

  if (isLoading || (isAuthenticated && me === undefined)) {
    return <p className="center" role="status">Loading…</p>;
  }
  if (!isAuthenticated) return <Login title="Employee DTR" userLabel="Employee ID" />;
  const logOut = (
    <button className="secondary" onClick={() => void signOut()}>
      Log out
    </button>
  );
  // The admin, or an employee deactivated while signed in.
  if (me === null) {
    return (
      <main className="login">
        <div className="card">
          <p role="alert" className="error">This account can't use the employee app.</p>
          {logOut}
        </div>
      </main>
    );
  }
  if (me.mustChangePassword) return <ChangePassword logOut={logOut} />;

  return (
    <div className="app">
      <header>
        <h1>Employee DTR</h1>
        <span>
          {me.employeeId} {me.name}
        </span>
        {logOut}
      </header>
      <MyDtr />
    </div>
  );
}
