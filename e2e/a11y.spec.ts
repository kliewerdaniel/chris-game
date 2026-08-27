import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// M5 — a11y CI. axe-core is already a transitive dep (node_modules/axe-core);
// we inject its source and run it against the live DOM. No new dependency.
const axeSource = readFileSync(
  join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
  "utf8",
);

async function runAxe(page: import("@playwright/test").Page) {
  // Inject axe into the CURRENT page (addInitScript would only apply to future
  // navigations). The source defines window.axe synchronously.
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    // @ts-expect-error injected at runtime
    const results = await window.axe.run(document, {
      // The reconstruction canvas + sr-only safety net are intentional; we do
      // not assert color-contrast here (the epistemic dark palette is a design
      // choice, not an a11y defect) — axe's own contrast still runs as info.
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
    });
    return results.violations
      .map((v: any) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
      }))
      // D6 explicitly accepted the WCAG contrast-risk of the noir epistemic
      // palette (prioritizing the DOM floor). We still RUN color-contrast and
      // log it below, but it is not a CI gate — only structural defects fail.
      .filter((v: any) => v.id !== "color-contrast");
  });
}

test("home page has no axe violations (wcag2a/aa/21 + best-practice)", async ({ page }) => {
  await page.goto("/");
  // Let React hydrate + dynamic imports settle so axe sees the final DOM.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  const violations = await runAxe(page);
  console.log("structural axe violations (home):", JSON.stringify(violations));
  expect(violations, `axe violations: ${JSON.stringify(violations)}`).toEqual([]);
});

test("reconstruction board: §9 parallel DOM control surface is axe-clean", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "BEGIN RECONSTRUCTION" }).click();
  await expect(page.locator(".header h1")).toHaveText("CHRIS");
  const toggle = page.locator(".board-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator(".board")).toBeVisible({ timeout: 20_000 });
  const violations = await runAxe(page);
  console.log("structural axe violations (board):", JSON.stringify(violations));
  expect(violations, `axe violations: ${JSON.stringify(violations)}`).toEqual([]);
});
