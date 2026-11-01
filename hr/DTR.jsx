import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { manilaTime, useManilaDate } from "./Punch";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Minutes → "7h 40m", "8h", "20m"; zero shows a dash.
function duration(min) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
}

export default function DTR() {
  const today = useManilaDate();
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [shown, setShown] = useState(null);
  const dtr = useQuery(api.attendance.monthly, shown ? { ...shown, today } : "skip");

  function submit(e) {
    e.preventDefault();
    if (!employeeId.trim() || !month) return;
    setShown({ employeeId: employeeId.trim(), month });
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
              </tr>
            </thead>
            <tbody>
              {dtr.days.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{DAYS[d.weekday]}</td>
                  <td>{d.timeIn === undefined ? "—" : manilaTime(d.timeIn)}</td>
                  <td>{d.timeOut === undefined ? "—" : manilaTime(d.timeOut)}</td>
                  <td>{duration(d.rendered)}</td>
                  <td>{duration(d.late)}</td>
                  <td>{duration(d.undertime)}</td>
                  <td>{duration(d.missing)}</td>
                  <td>{d.holiday ?? d.status}</td>
                </tr>
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
                <td>
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
