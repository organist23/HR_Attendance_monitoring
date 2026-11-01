// Asia/Manila is UTC+8 with no DST, so a fixed offset is exact.
const OFFSET_MS = 8 * 60 * 60 * 1000;

export function manilaDay(ms) {
  const d = new Date(ms + OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

export function manilaMinutes(ms) {
  return Math.floor(((ms + OFFSET_MS) % 86_400_000) / 60_000);
}

export function isWorkday(weekday) {
  return weekday >= 1 && weekday <= 5;
}

// "YYYY-MM". Shared by the server's month builder and the web app's month guard.
export const isMonth = (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

// Round-trip through Date rejects impossible dates like 2026-02-30.
export function isRealDate(date) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(date);
}
