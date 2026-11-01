import { useMutation, useQuery } from "convex/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import { manilaDay, manilaMinutes } from "../convex/lib/manila";
import { errorText } from "./errors";
import { manilaTime, useManilaDate } from "./Punch";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FIELD = { timeIn: "Time in", timeOut: "Time out" };

// Minutes → "7h 40m", "8h", "20m"; zero shows a dash.
function duration(min) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
}

// <input type="time"> value. Built from minutes, not the locale, so midnight is never "24:00".
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (ms) => (ms === undefined ? "" : `${pad(Math.floor(manilaMinutes(ms) / 60))}:${pad(manilaMinutes(ms) % 60)}`);

// US-6: history plus the edit form for one day, shown under its row.
function Correction({ employeeId, day, onClose }) {
  const correct = useMutation(api.attendance.correct);
  const [timeIn, setTimeIn] = useState(hhmm(day.timeIn));
  const [timeOut, setTimeOut] = useState(hhmm(day.timeOut));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const first = useRef(null);
  const reasonInput = useRef(null);

  useEffect(() => first.current?.focus(), []);
  // Inputs are disabled while saving, which drops focus; bring it back after an error.
  useEffect(() => {
    if (error) reasonInput.current?.focus();
  }, [error]);

  async function submit(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      // The server skips fields in the same minute as the stored value, so send both.
      await correct({ employeeId, date: day.date, reason, timeIn: timeIn || undefined, timeOut: timeOut || undefined });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  return (
    <tr>
      <td colSpan={10}>
        {day.corrections.length > 0 && (
          <ul>
            {day.corrections.map((c, i) => (
              <li key={i}>
                {FIELD[c.field]}: {c.from === undefined ? "—" : manilaTime(c.from)} → {manilaTime(c.to)} · {c.reason} ·{" "}
                {manilaDay(c.at).date} {manilaTime(c.at)}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && !pending && onClose()} className="row">
          <label>
            Time in
            <input ref={first} type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} disabled={pending} />
          </label>
          <label>
            Time out
            <input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} disabled={pending} />
          </label>
          <label>
            Reason
            <input ref={reasonInput} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function DTR() {
  const today = useManilaDate();
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [shown, setShown] = useState(null);
  const [editing, setEditing] = useState(null);
  const editButtons = useRef(new Map());
  const dtr = useQuery(api.attendance.monthly, shown ? { ...shown, today } : "skip");

  function submit(e) {
    e.preventDefault();
    if (!employeeId.trim() || !month) return;
    setEditing(null);
    setShown({ employeeId: employeeId.trim(), month });
  }

  function close() {
    editButtons.current.get(editing)?.focus();
    setEditing(null);
  }

  return (
    <>
      <form onSubmit={submit} className="row">
        <label>
          Employee ID
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
        </label>
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="submit">View</button>
      </form>

      {shown && dtr === undefined && <p role="status">Loading…</p>}
      {dtr === null && (
        <p role="alert" className="error">
          Employee not found
        </p>
      )}
      {dtr && (
        <>
          <h2>
            {dtr.employeeId} {dtr.name} · {shown.month}
          </h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Time in</th>
                <th>Time out</th>
                <th>Rendered</th>
                <th>Late</th>
                <th>Undertime</th>
                <th>Missing</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dtr.days.map((d) => (
                <Fragment key={d.date}>
                  <tr>
                    <td>{d.date}</td>
                    <td>{DAYS[d.weekday]}</td>
                    <td>{d.timeIn === undefined ? "—" : manilaTime(d.timeIn)}</td>
                    <td>{d.timeOut === undefined ? "—" : manilaTime(d.timeOut)}</td>
                    <td>{duration(d.rendered)}</td>
                    <td>{duration(d.late)}</td>
                    <td>{duration(d.undertime)}</td>
                    <td>{duration(d.missing)}</td>
                    <td>
                      {d.holiday ?? d.status}
                      {d.corrections.length > 0 && " · Corrected"}
                    </td>
                    <td>
                      {(d.timeIn !== undefined || d.status === "Absent") && (
                        <button
                          ref={(el) => (el ? editButtons.current.set(d.date, el) : editButtons.current.delete(d.date))}
                          className="secondary"
                          aria-expanded={editing === d.date}
                          onClick={() => setEditing(editing === d.date ? null : d.date)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                  {editing === d.date && <Correction employeeId={dtr.employeeId} day={d} onClose={close} />}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4} scope="row">
                  Totals
                </th>
                <td>{duration(dtr.totals.rendered)}</td>
                <td>{duration(dtr.totals.late)}</td>
                <td>{duration(dtr.totals.undertime)}</td>
                <td>{duration(dtr.totals.missing)}</td>
                <td colSpan={2}>
                  Required {duration(dtr.totals.required)} · Absences {dtr.totals.absences}
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </>
  );
}
