import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "hr",
  base: "./", // Electron loads the build over file://
  envDir: "..",
  plugins: [react()],
  build: { outDir: "../dist/hr", emptyOutDir: true },
});
