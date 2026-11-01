import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useRef, useState } from "react";
import Employees from "./Employees";
import Login from "./Login";
import Punch from "./Punch";

const TABS = ["Punch", "Employees"];

export default function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [tab, setTab] = useState("Punch");
  const tabRefs = useRef({});

  const isAdmin = useQuery(api.admin.isAdmin, isAuthenticated ? {} : "skip");

  if (isLoading || (isAuthenticated && isAdmin === undefined)) {
    return <p className="center" role="status">Loading…</p>;
  }
  if (!isAuthenticated) return <Login />;
  // Employees also have accounts; without this they'd hit "Not authorized" on every HR query.
  if (!isAdmin) {
    return (
      <main className="login">
        <div className="card">
          <p role="alert" className="error">This account is not an HR admin.</p>
          <button onClick={() => void signOut()}>Log out</button>
        </div>
      </main>
    );
  }

  // Left/Right arrows move between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = TABS[(TABS.indexOf(tab) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="app">
      <header>
        <h1>HR Attendance</h1>
        <div role="tablist" aria-label="Sections" onKeyDown={onTabKey}>
          {TABS.map((name) => (
            <button
              key={name}
              role="tab"
              id={`tab-${name}`}
              aria-selected={tab === name}
              aria-controls="panel"
              tabIndex={tab === name ? 0 : -1}
              ref={(el) => (tabRefs.current[name] = el)}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={() => void signOut()}>
          Log out
        </button>
      </header>
      <section role="tabpanel" id="panel" aria-labelledby={`tab-${tab}`}>
        {tab === "Punch" ? <Punch /> : <Employees />}
      </section>
    </div>
  );
}
