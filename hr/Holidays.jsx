import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { errorText } from "./errors";

export default function Holidays() {
  const holidays = useQuery(api.holidays.list, {});
  const add = useMutation(api.holidays.add);
  const remove = useMutation(api.holidays.remove);
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
      await add({ date: form.get("date"), name: form.get("name") });
      formEl.reset();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function onRemove(holidayId) {
    setRowError("");
    try {
      await remove({ holidayId });
    } catch (err) {
      setRowError(errorText(err));
    }
  }

  return (
    <>
      <form onSubmit={submit} className="row">
        <label>
          Date
          <input name="date" type="date" disabled={pending} />
        </label>
        <label>
          Holiday name
          <input name="name" disabled={pending} />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add holiday"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <h2>Holidays</h2>
      {rowError && (
        <p role="alert" className="error">
          {rowError}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Name</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {holidays === undefined ? (
            <tr>
              <td colSpan={3}>Loading…</td>
            </tr>
          ) : holidays.length === 0 ? (
            <tr>
              <td colSpan={3}>No holidays</td>
            </tr>
          ) : (
            holidays.map((h) => (
              <tr key={h._id}>
                <td>{h.date}</td>
                <td>{h.name}</td>
                <td>
                  <button className="secondary" onClick={() => onRemove(h._id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
