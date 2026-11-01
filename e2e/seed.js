import { execFileSync } from "node:child_process";

// A past Friday. The apps only punch today, so specs seed punches through e2e:seedPunch
// (gated like purge), which lets them run on any day of the week.
export const SEED_DATE = "2026-10-30";

// Times are Manila "HH:MM" or "HH:MM:SS".
export function seedPunchOn(employeeId, date, timeIn, timeOut) {
  const deployment = process.env.E2E_DEPLOYMENT;
  if (!deployment) throw new Error("Set E2E_DEPLOYMENT in .env.e2e");
  const at = (time) => Date.parse(`${date}T${time.padEnd(8, ":00")}+08:00`);
  const args = { employeeId, date, timeIn: at(timeIn), ...(timeOut && { timeOut: at(timeOut) }) };
  execFileSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", "run", "--deployment", deployment, "e2e:seedPunch", JSON.stringify(args)],
    { stdio: "pipe" },
  );
}
