import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { errorText } from "./errors";

export default function Employees() {
  const create = useAction(api.employees.create);
  const setActive = useMutation(api.employees.setActive);
  const [search, setSearch] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.employees.list,
    { search },
    { initialNumItems: 25 },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rowError, setRowError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setPending(true);
    setError("");
    try {
      await create({
        employeeId: form.get("employeeId"),
        name: form.get("name"),
        password: form.get("password"),
      });
      formEl.reset();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function deactivate(userId) {
    setRowError("");
    try {
      await setActive({ userId, active: false });
    } catch (err) {
      setRowError(errorText(err));
    }
  }

  return (
    <>
      <form onSubmit={submit} className="row">
        <label>
          Employee ID
          <input name="employeeId" disabled={pending} />
        </label>
        <label>
          Full name
          <input name="name" disabled={pending} />
        </label>
        <label>
          Temporary password
          <input name="password" type="password" autoComplete="new-password" disabled={pending} />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create employee"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <h2>Employees</h2>
      <label>
        Search employees
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ID or name"
        />
      </label>
      {rowError && (
        <p role="alert" className="error">
          {rowError}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {status === "LoadingFirstPage" ? (
            <tr>
              <td colSpan={4}>Loading…</td>
            </tr>
          ) : results.length === 0 ? (
            <tr>
              <td colSpan={4}>{search.trim() ? "No matching employees" : "No employees yet"}</td>
            </tr>
          ) : (
            results.map((emp) => (
              <tr key={emp._id}>
                <td>{emp.employeeId}</td>
                <td>{emp.name}</td>
                <td>{emp.active ? "Active" : "Inactive"}</td>
                <td>
                  {emp.active && (
                    <button className="secondary" onClick={() => deactivate(emp._id)}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {status === "CanLoadMore" && (
        <button className="secondary" onClick={() => loadMore(25)}>
          Load more
        </button>
      )}
      {status === "LoadingMore" && <p role="status">Loading…</p>}
    </>
  );
}
