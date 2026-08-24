import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Deterministic tests only. No network, no LLM.
    testTimeout: 15000,
  },
});
