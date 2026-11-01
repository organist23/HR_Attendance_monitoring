import { ConvexError } from "convex/values";

// Server rules throw ConvexError with user-facing copy; anything else is unexpected.
export const errorText = (e) => (e instanceof ConvexError ? e.data : "Something went wrong. Try again.");
