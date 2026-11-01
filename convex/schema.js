import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  // Auth's users table plus HR fields. Employees are users with role "employee".
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("employee"))),
    employeeId: v.optional(v.string()),
    active: v.optional(v.boolean()),
    searchText: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_employeeId", ["employeeId"])
    .searchIndex("search", { searchField: "searchText", filterFields: ["role"] }),
  attendance: defineTable({
    userId: v.id("users"),
    date: v.string(),
    timeIn: v.number(),
    timeOut: v.optional(v.number()),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_date", ["date"]),
});
