import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/admin";
import { computeDay } from "./lib/dtr";
import { isRealDate, isWorkday, manilaDay } from "./lib/manila";

export const punch = mutation({
  args: { employeeId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const employee = await ctx.db
      .query("users")
      .withIndex("by_employeeId", (q) => q.eq("employeeId", args.employeeId.trim()))
      .first();
    if (employee?.role !== "employee") throw new ConvexError("Employee not found");
    if (!employee.active) throw new ConvexError("Employee inactive");

    const now = Date.now();
    const { date, weekday } = manilaDay(now);
    const holiday = await ctx.db
      .query("holidays")
      .withIndex("by_date", (q) => q.eq("date", date))
      .first();
    if (!isWorkday(weekday) || holiday) throw new ConvexError("Not a workday");

    const row = await ctx.db
      .query("attendance")
      .withIndex("by_user_date", (q) => q.eq("userId", employee._id).eq("date", date))
      .unique();
    if (!row) {
      await ctx.db.insert("attendance", { userId: employee._id, date, timeIn: now });
      return { action: "in", name: employee.name, at: now };
    }
    if (row.timeOut === undefined) {
      await ctx.db.patch(row._id, { timeOut: now });
      return { action: "out", name: employee.name, at: now };
    }
    throw new ConvexError("Already timed out");
  },
});

// The client passes its Manila date: a query reading Date.now() would not re-run at midnight.
export const today = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    const list = await Promise.all(
      rows.map(async ({ userId, timeIn, timeOut }) => {
        const user = await ctx.db.get(userId);
        if (!user) return null; // employee deleted outside the app; skip rather than fail the list
        const { employeeId, name } = user;
        return { employeeId, name, timeIn, timeOut, status: timeOut === undefined ? "Timed in" : "Timed out" };
      }),
    );
    return list.filter(Boolean).sort((a, b) => a.timeIn - b.timeIn);
  },
});

const NOT_COUNTED = { rendered: 0, late: 0, undertime: 0, missing: 0, status: "" };

// One employee's month. `today` comes from the client for the same reason as in `today`.
// Returns null for an unknown ID so the UI can show it without an error boundary.
export const monthly = query({
  args: { employeeId: v.string(), month: v.string(), today: v.string() },
  handler: async (ctx, { employeeId, month, today }) => {
    await requireAdmin(ctx);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ConvexError("Invalid month");
    const user = await ctx.db
      .query("users")
      .withIndex("by_employeeId", (q) => q.eq("employeeId", employeeId.trim()))
      .first();
    if (user?.role !== "employee") return null;

    const inMonth = (q) => q.gte("date", `${month}-01`).lte("date", `${month}-31`);
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_user_date", (q) => inMonth(q.eq("userId", user._id)))
      .collect();
    const holidays = await ctx.db.query("holidays").withIndex("by_date", inMonth).collect();
    const rowOn = new Map(rows.map((r) => [r.date, r]));
    const holidayOn = new Map(holidays.map((h) => [h.date, h.name]));
    const created = manilaDay(user._creationTime).date;

    const [y, m] = month.split("-").map(Number);
    const totals = { rendered: 0, required: 0, missing: 0, late: 0, undertime: 0, absences: 0 };
    const days = [];
    for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const row = rowOn.get(date);
      const holiday = holidayOn.get(date);
      // Absent only between creation and deactivation (exclusive), and never today or later.
      const activeThen = user.active || (user.deactivatedOn !== undefined && date < user.deactivatedOn);
      const counts = isWorkday(weekday) && !holiday && (row || (date > created && date < today && activeThen));
      const computed = counts ? computeDay({ timeIn: row?.timeIn, timeOut: row?.timeOut }) : NOT_COUNTED;
      if (counts) {
        totals.required += 480;
        for (const k of ["rendered", "missing", "late", "undertime"]) totals[k] += computed[k];
        if (computed.status === "Absent") totals.absences += 1;
      }
      days.push({
        date, weekday, holiday, timeIn: row?.timeIn, timeOut: row?.timeOut, corrections: row?.corrections ?? [], ...computed,
      });
    }
    return { employeeId: user.employeeId, name: user.name, days, totals };
  },
});

// US-6. Times are Manila "HH:MM" on `date`; only the fields given are changed.
export const correct = mutation({
  args: {
    employeeId: v.string(),
    date: v.string(),
    timeIn: v.optional(v.string()),
    timeOut: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("Reason is required");
    if (reason.length > 500) throw new ConvexError("Reason is too long");
    const { date } = args;
    if (!isRealDate(date)) throw new ConvexError("Invalid date");
    const toMs = (hhmm) => {
      if (hhmm === undefined) return undefined;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) throw new ConvexError("Invalid time");
      return Date.parse(`${date}T${hhmm}:00+08:00`);
    };
    const changes = { timeIn: toMs(args.timeIn), timeOut: toMs(args.timeOut) };
    if (changes.timeIn === undefined && changes.timeOut === undefined) throw new ConvexError("Nothing to change");

    const employee = await ctx.db
      .query("users")
      .withIndex("by_employeeId", (q) => q.eq("employeeId", args.employeeId.trim()))
      .first();
    if (employee?.role !== "employee") throw new ConvexError("Employee not found");

    const row = await ctx.db
      .query("attendance")
      .withIndex("by_user_date", (q) => q.eq("userId", employee._id).eq("date", date))
      .unique();
    if (!row) {
      const holiday = await ctx.db
        .query("holidays")
        .withIndex("by_date", (q) => q.eq("date", date))
        .first();
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (!isWorkday(weekday) || holiday) throw new ConvexError("Not a workday");
      if (changes.timeIn === undefined) throw new ConvexError("Time-in is required");
    }
    const now = Date.now();
    if (Object.values(changes).some((ms) => ms > now)) throw new ConvexError("Time is in the future");

    // Inputs have minute precision and punches have seconds: the same minute is no change.
    const minute = (ms) => Math.floor(ms / 60_000);
    const next = { timeIn: row?.timeIn, timeOut: row?.timeOut };
    const entries = [];
    for (const field of ["timeIn", "timeOut"]) {
      const to = changes[field];
      const from = row?.[field];
      if (to === undefined || (from !== undefined && minute(to) === minute(from))) continue;
      next[field] = to;
      entries.push({ field, ...(from !== undefined && { from }), to, reason, at: now });
    }
    if (!entries.length) throw new ConvexError("Nothing to change");
    const { timeIn, timeOut } = next;
    if (timeOut !== undefined && timeOut <= timeIn) throw new ConvexError("Time-out must be after time-in");
    const corrections = [...(row?.corrections ?? []), ...entries];
    if (row) await ctx.db.patch(row._id, { timeIn, timeOut, corrections });
    else await ctx.db.insert("attendance", { userId: employee._id, date, timeIn, timeOut, corrections });
    return null;
  },
});
