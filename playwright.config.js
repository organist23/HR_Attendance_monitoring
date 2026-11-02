import { defineConfig } from "@playwright/test";

// The user supplies throwaway dev-deployment admin credentials in .env.e2e (git-ignored).
try {
  process.loadEnvFile(".env.e2e");
} catch {}

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60_000,
  projects: [
    { name: "hr", testMatch: "hr.spec.js" }, // Electron, launched by the spec
    { name: "web", testMatch: "web.spec.js", use: { channel: "chrome", baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4174" } },
  ],
  // Serves the built employee web app (dist/web) for the web project, unless E2E_BASE_URL names a live site.
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npx vite preview --config vite.web.config.js --port 4174 --strictPort", url: "http://localhost:4174" },
});
