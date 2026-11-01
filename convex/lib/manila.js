// Asia/Manila is UTC+8 with no DST, so a fixed offset is exact.
const OFFSET_MS = 8 * 60 * 60 * 1000;

export function manilaDay(ms) {
  const d = new Date(ms + OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

export function isWorkday(weekday) {
  return weekday >= 1 && weekday <= 5;
}
