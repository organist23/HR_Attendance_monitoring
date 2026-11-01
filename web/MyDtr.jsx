import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { DayCells, DayHeaders, TotalCells } from "../hr/DTR";
import { useManilaDate } from "../hr/Punch";

// US-8: the signed-in employee's own month, read-only.
export default function MyDtr() {
  const today = useManilaDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const dtr = useQuery(api.self.monthly, month ? { month, today } : "skip");

  return (
    <>
      <div className="row">
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {dtr === undefined ? (
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
