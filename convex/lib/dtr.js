import { manilaMinutes } from "./manila";

// Spec computation rules. All values are minutes of a Manila day.
const START = 480; // 8:00
const GRACE_END = 495; // 8:15
const BLOCKS = [
  [480, 720], // 8:00–12:00
  [780, 1020], // 13:00–17:00
];
const END = 1020;
const REQUIRED = 480;

const overlap = (a, b) => BLOCKS.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(b, e) - Math.max(a, s)), 0);

// For a workday that counts toward required hours.
export function computeDay({ timeIn, timeOut }) {
  if (timeIn === undefined) return { rendered: 0, late: 0, undertime: 0, missing: REQUIRED, status: "Absent" };
  const inMin = manilaMinutes(timeIn);
  const late = inMin > GRACE_END ? inMin - START : 0;
  if (timeOut === undefined) return { rendered: 0, late, undertime: 0, missing: REQUIRED, status: "Incomplete" };
  const outMin = manilaMinutes(timeOut);
  const rendered = overlap(late ? inMin : START, outMin);
  const undertime = outMin < END ? overlap(outMin, END) : 0;
  return { rendered, late, undertime, missing: REQUIRED - rendered, status: late ? "Late" : "Present" };
}
