import { defineConfig } from "vitest/config";

// Vitest transforms TSX with esbuild; match Next's automatic JSX runtime so
// components (e.g. GameShell) render without a manual `import React`.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
});
