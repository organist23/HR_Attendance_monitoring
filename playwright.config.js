import { defineConfig } from "@playwright/test";

// The user supplies throwaway dev-deployment admin credentials in .env.e2e (git-ignored).
try {
  process.loadEnvFile(".env.e2e");
} catch {}

export default defineConfig({ testDir: "e2e", workers: 1, timeout: 60_000 });
