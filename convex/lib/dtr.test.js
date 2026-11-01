import { expect, test } from "vitest";
import { computeDay } from "./dtr.js";
import { manilaMinutes } from "./manila.js";

const t = (hhmm) => Date.parse(`2026-11-02T${hhmm}:00+08:00`);
const day = (timeIn, timeOut) => {
  const r = computeDay({ timeIn: timeIn && t(timeIn), timeOut: timeOut && t(timeOut) });
  return [r.rendered, r.late, r.undertime, r.missing, r.status];
};

// [in, out] → [rendered, late, undertime, missing, status], all minutes, hand-derived from spec US-4.
test.each([
  ["08:10", "17:00", [480, 0, 0, 0, "Present"]],
  ["08:20", "17:00", [460, 20, 0, 20, "Late"]],
  ["08:00", "16:00", [420, 0, 60, 60, "Present"]],
  ["08:00", "11:00", [180, 0, 300, 300, "Present"]],
  ["08:15", "17:00", [480, 0, 0, 0, "Present"]],
  ["08:16", "17:00", [464, 16, 0, 16, "Late"]],
  ["07:30", "18:00", [480, 0, 0, 0, "Present"]],
  ["12:30", "17:00", [240, 270, 0, 240, "Late"]],
  ["17:30", "18:00", [0, 570, 0, 480, "Late"]],
  ["08:00", "12:30", [240, 0, 240, 240, "Present"]],
  ["08:20", undefined, [0, 20, 0, 480, "Incomplete"]],
  [undefined, undefined, [0, 0, 0, 480, "Absent"]],
])("%s–%s", (timeIn, timeOut, expected) => {
  expect(day(timeIn, timeOut)).toEqual(expected);
});

test("manilaMinutes: Monday 07:30 Manila", () => {
  expect(manilaMinutes(Date.parse("2026-11-01T23:30:00Z"))).toBe(450);
});
