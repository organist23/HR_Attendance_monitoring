import { expect, test } from "vitest";
import { isWorkday, manilaDay } from "./manila.js";

test("Monday 07:30 Manila is Monday", () => {
  expect(manilaDay(Date.parse("2026-11-01T23:30:00Z"))).toEqual({ date: "2026-11-02", weekday: 1 });
});

test("Saturday 10:00 Manila", () => {
  expect(manilaDay(Date.parse("2026-11-07T02:00:00Z"))).toEqual({ date: "2026-11-07", weekday: 6 });
});

test("isWorkday", () => {
  expect([0, 1, 2, 3, 4, 5, 6].map(isWorkday)).toEqual([false, true, true, true, true, true, false]);
});
