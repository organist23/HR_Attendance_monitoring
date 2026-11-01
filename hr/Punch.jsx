import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import { manilaDay } from "../convex/lib/manila";
import { errorText } from "./errors";

// Re-checks every minute so the Today list rolls over at Manila midnight.
export function useManilaDate() {
  const [date, setDate] = useState(() => manilaDay(Date.now()).date);
  useEffect(() => {
    const id = setInterval(() => setDate(manilaDay(Date.now()).date), 60_000);
    return () => clearInterval(id);
  }, []);
  return date;
}

export const manilaTime = (ms) =>
  new Date(ms).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export default function Punch() {
  const punch = useMutation(api.attendance.punch);
  const date = useManilaDate();
  const today = useQuery(api.attendance.today, { date });
  const [employeeId, setEmployeeId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (!pending) input.current?.focus();
  }, [pending]);

  async function submit(e) {
    e.preventDefault();
    if (pending || !employeeId.trim()) return;
    setPending(true);
    setResult("");
    setError("");
    try {
      const r = await punch({ employeeId });
      setResult(`${r.action === "in" ? "Timed in" : "Timed out"}: ${r.name} ${manilaTime(r.at)}`);
      setEmployeeId("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="row">
        <label>
          Employee ID
          <input
            ref={input}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={pending}
            autoFocus
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Punch"}
        </button>
      </form>
      {result && (
        <p role="status" className="ok">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <h2>Today</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Time in</th>
            <th>Time out</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {today === undefined ? (
            <tr>
              <td colSpan={5}>Loading…</td>
            </tr>
          ) : today.length === 0 ? (
            <tr>
              <td colSpan={5}>No punches yet today</td>
            </tr>
          ) : (
            today.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.employeeId}</td>
                <td>{r.name}</td>
                <td>{manilaTime(r.timeIn)}</td>
                <td>{r.timeOut === undefined ? "—" : manilaTime(r.timeOut)}</td>
                <td>{r.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
