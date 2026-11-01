import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Employee web app (US-7, US-8). Same Convex backend and .env.local as the HR app.
export default defineConfig({
  root: "web",
  envDir: "..",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
});
