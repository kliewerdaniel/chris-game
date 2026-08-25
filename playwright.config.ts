import { defineConfig, devices } from "@playwright/test";

/**
 * E2E for the CHRIS literary surface.
 *
 * Boots a local `next dev` with narration OFF and TTS OFF so the core loop is
 * 100% deterministic — no hosted key, no model. This exercises the engine, the
 * redesigned manuscript UI, and the Established-Facts resolution (IDs →
 * statements) end to end in a real browser.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3217",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "NEXT_PUBLIC_NARRATION=off NEXT_PUBLIC_TTS_ENABLED=0 PORT=3217 npx next dev -p 3217",
    url: "http://localhost:3217",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { NEXT_PUBLIC_NARRATION: "off", NEXT_PUBLIC_TTS_ENABLED: "0" },
  },
});
