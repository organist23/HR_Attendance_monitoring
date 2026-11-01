import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { isMonth } from "../convex/lib/manila";
import { DayCells, DayHeaders, TotalCells } from "../hr/DTR";
import { useManilaDate } from "../hr/Punch";

// US-8: the signed-in employee's own month, read-only.
export default function MyDtr() {
  const today = useManilaDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  // Only months the server accepts: an "Invalid month" thrown from useQuery would blank the app.
  const valid = isMonth(month);
  const dtr = useQuery(api.self.monthly, valid ? { month, today } : "skip");

  return (
    <>
      <div className="row">
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {!valid ? (
        <p role="status">Pick a month.</p>
      ) : dtr === undefined ? (
        <p role="status">Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <DayHeaders />
            </tr>
          </thead>
          <tbody>
            {dtr.days.map((d) => (
              <tr key={d.date}>
                <DayCells d={d} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <TotalCells totals={dtr.totals} />
            </tr>
          </tfoot>
        </table>
      )}
    </>
  );
}
