// Test-only helpers, kept outside convex/ so they are never deployed.
export const modules = import.meta.glob(["../convex/**/*.js", "!../convex/**/*.test.js"]);

export async function asRole(t, role, fields = {}) {
  const userId = await t.run((ctx) => ctx.db.insert("users", { name: role, role, ...fields }));
  return { userId, as: t.withIdentity({ subject: `${userId}|session` }) };
}

export const page1 = { numItems: 25, cursor: null };
