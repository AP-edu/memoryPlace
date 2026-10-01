import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Minimal config: pure TS unit tests (geometry helpers), node environment.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
